import { Body, Controller, Delete, Get, Inject, Param, Post, Put } from "@nestjs/common";
import type { CommerceConnectionDto, CommerceProviderId, CommerceProviderInfo, CommerceSyncResponse, MerchantConnectionsResponse, OkResponse } from "@pricora/contracts";
import type { ServerEnv } from "@pricora/config/env";
import type { CommerceConnection, MerchantAccount, Prisma, User } from "@pricora/database";
import { COMMERCE_PROVIDERS, createCommerceConnector, nextScheduledFetch } from "@pricora/retailer-adapters";
import { Auth, CurrentUser } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, PRISMA, QUEUES, type PrismaClient, type Queues } from "../common/infra";
import { input } from "../common/validate";
import { applyCommerceResult } from "../core/commerce-sync";
import { syncLocalInventory } from "../core/local-inventory";
import { decryptJson, encryptJson, parseKey } from "../core/crypto";
import { MetricsService } from "../services/catalog.service";

/** Which config keys are secrets (encrypted at rest, never returned). */
const SECRET_KEYS = new Set(["accessToken", "apiSecret", "consumerSecret", "consumerKey"]);
const LABELS: Record<string, string> = {
  shopDomain: "Shop domain (yourshop.myshopify.com)",
  accessToken: "Access token",
  apiKey: "App API key",
  apiSecret: "App API secret",
  storeUrl: "Store URL (https://…)",
  consumerKey: "Consumer key",
  consumerSecret: "Consumer secret",
  environment: "Environment (production / sandbox)",
  merchantId: "Merchant ID",
  region: "Region (us / sandbox)",
  feedUrl: "Feed URL (https://…)",
  defaultCondition: "Condition of all items (new / refurbished / used)",
  currency: "Currency",
  squareVersion: "Square API version",
};
const NOTES: Partial<Record<CommerceProviderId, string>> = {
  shopify: "Paste an Admin API access token from a custom app (read_products, read_inventory, read_locations). One-click app install needs WhichLess Shopify app credentials — pending configuration.",
  google_merchant: "We fetch your Merchant Center feed URL once a day (HTTPS only).",
  woocommerce: "Create read-only REST API keys in WooCommerce → Settings → Advanced → REST API.",
};

function providerInfo(): CommerceProviderInfo[] {
  return COMMERCE_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    fields: [...p.requiredConfig, ...p.optionalConfig.filter((k) => k !== "apiKey" && k !== "apiSecret")].map((key) => ({
      key,
      label: LABELS[key] ?? key,
      secret: SECRET_KEYS.has(key),
      placeholder: key === "shopDomain" ? "yourshop.myshopify.com" : key === "feedUrl" || key === "storeUrl" ? "https://" : null,
    })),
    supportsLocations: p.supportsLocations,
    docsUrl: p.docsUrl,
    platformStatus: "available",
    note: NOTES[p.id] ?? null,
  }));
}

@Controller("merchant/connections")
@Auth("merchant")
export class MerchantConnectionsController {
  private readonly key: Buffer | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUES) private readonly queues: Queues,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(ENV) env: ServerEnv,
  ) {
    this.key = parseKey(env.CREDENTIALS_ENCRYPTION_KEY);
  }

  private async account(user: User): Promise<MerchantAccount> {
    const acc = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (!acc) throw new ApiException(404, "not_found", "No merchant account is linked to this user");
    return acc;
  }

  private secrets(c: CommerceConnection): Record<string, string> {
    if (!c.ciphertext || !this.key) return {};
    try {
      return decryptJson(c.ciphertext, this.key);
    } catch {
      return {};
    }
  }

  private out(c: CommerceConnection): CommerceConnectionDto {
    const cfg = c.config && typeof c.config === "object" && !Array.isArray(c.config) ? (c.config as Record<string, unknown>) : {};
    return {
      id: c.id,
      provider: c.provider as CommerceProviderId,
      status: c.status,
      config: Object.fromEntries(Object.entries(cfg).filter((e): e is [string, string] => typeof e[1] === "string")),
      storedSecrets: Object.keys(this.secrets(c)),
      lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: c.nextSyncAt?.toISOString() ?? null,
      lastError: c.lastError,
      itemsSynced: c.itemsSynced,
    };
  }

  @Get()
  async list(@CurrentUser() user: User): Promise<MerchantConnectionsResponse> {
    const acc = await this.account(user);
    const rows = await this.prisma.commerceConnection.findMany({ where: { merchantAccountId: acc.id }, orderBy: { createdAt: "asc" } });
    return { providers: providerInfo(), items: rows.map((r) => this.out(r)) };
  }

  @Put()
  async upsert(@CurrentUser() user: User, @Body() body: unknown): Promise<CommerceConnectionDto> {
    const b = input("merchant.connections.upsert", "body", body);
    const acc = await this.account(user);
    const meta = COMMERCE_PROVIDERS.find((p) => p.id === b.provider);
    if (!meta) throw notFound("Provider");
    const allowed = new Set([...meta.requiredConfig, ...meta.optionalConfig]);
    const config: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.config)) if (allowed.has(k) && !SECRET_KEYS.has(k) && v.trim()) config[k] = v.trim();
    const existing = await this.prisma.commerceConnection.findUnique({ where: { merchantAccountId_provider: { merchantAccountId: acc.id, provider: b.provider } } });
    const secrets = { ...(existing ? this.secrets(existing) : {}) };
    const incoming = Object.entries(b.secrets ?? {}).filter(([k, v]) => allowed.has(k) && v.trim());
    if (incoming.length && !this.key) throw new ApiException(503, "pending_configuration", "Credential storage is not configured on the server (CREDENTIALS_ENCRYPTION_KEY)");
    for (const [k, v] of incoming) secrets[k] = v.trim();
    const missing = meta.requiredConfig.filter((k) => !(config[k] ?? secrets[k]));
    const data = {
      config: config as Prisma.InputJsonValue,
      ciphertext: Object.keys(secrets).length && this.key ? encryptJson(secrets, this.key) : null,
      status: missing.length ? ("pending_configuration" as const) : ("live" as const),
      lastError: missing.length ? `Missing: ${missing.join(", ")}` : null,
      nextSyncAt: missing.length ? null : new Date(),
    };
    const row = existing
      ? await this.prisma.commerceConnection.update({ where: { id: existing.id }, data })
      : await this.prisma.commerceConnection.create({ data: { ...data, merchantAccountId: acc.id, provider: b.provider } });
    // Product links on the shop's platform domain must pass the outbound allow-list.
    const host = config["shopDomain"] ?? (config["storeUrl"] ? safeHost(config["storeUrl"]) : null);
    if (host && acc.retailerId) {
      const r = await this.prisma.retailer.findUnique({ where: { id: acc.retailerId }, select: { allowedRedirectHosts: true } });
      if (r && !r.allowedRedirectHosts.includes(host)) await this.prisma.retailer.update({ where: { id: acc.retailerId }, data: { allowedRedirectHosts: [...r.allowedRedirectHosts, host] } });
    }
    return this.out(row);
  }

  @Delete(":provider")
  async remove(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { provider } = input("merchant.connections.delete", "params", params);
    const acc = await this.account(user);
    await this.prisma.commerceConnection.deleteMany({ where: { merchantAccountId: acc.id, provider } });
    return { ok: true };
  }

  @Post(":provider/sync")
  async sync(@CurrentUser() user: User, @Param() params: unknown): Promise<CommerceSyncResponse> {
    const { provider } = input("merchant.connections.sync", "params", params);
    const acc = await this.account(user);
    const conn = await this.prisma.commerceConnection.findUnique({ where: { merchantAccountId_provider: { merchantAccountId: acc.id, provider } } });
    if (!conn) throw notFound("Connection");
    if (!acc.retailerId) throw new ApiException(409, "conflict", "Your merchant account is not linked to a store yet");
    const cfg = this.out(conn).config;
    const connector = createCommerceConnector(provider, { ...cfg, ...this.secrets(conn) });
    const result = await connector.sync({ limit: 250 });
    if (result.status !== "ok") {
      await this.prisma.commerceConnection.update({
        where: { id: conn.id },
        data: { status: result.status === "pending_configuration" ? "pending_configuration" : "error", lastError: result.message ?? result.status, lastSyncAt: new Date() },
      });
      return { status: result.status, message: result.message ?? null, products: 0, locations: 0 };
    }
    const outcome = await applyCommerceResult(this.prisma, {
      merchantAccountId: acc.id,
      retailerId: acc.retailerId,
      provider,
      result,
      enqueue: async (job) => {
        await this.queues.priceEvents.add("price-change", job, { removeOnComplete: 1000, removeOnFail: 1000 }).catch(() => undefined);
      },
    });
    await syncLocalInventory(this.prisma, acc.id);
    const now = new Date();
    await this.prisma.commerceConnection.update({
      where: { id: conn.id },
      data: { status: "live", lastError: null, lastSyncAt: now, nextSyncAt: nextScheduledFetch(now, 24), itemsSynced: outcome.products },
    });
    this.metrics.invalidate();
    return {
      status: "ok",
      message: `${outcome.products} products, ${outcome.locations} locations, ${outcome.inventoryRows} stock rows${result.nextCursor ? " (more pages on the next scheduled sync)" : ""}`,
      products: outcome.products,
      locations: outcome.locations,
    };
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
