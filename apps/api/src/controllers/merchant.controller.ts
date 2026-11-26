import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  ApiKeyListResponse,
  ApiKeySummary,
  CreateApiKeyResponse,
  MerchantAnalyticsResponse,
  MerchantFeed,
  MerchantFeedListResponse,
  MerchantOffer,
  MerchantOfferListResponse,
  MerchantProfile,
  OkResponse,
} from "@pricora/contracts";
import type { ServerEnv } from "@pricora/config/env";
import type { ApiKey, MerchantAccount, Prisma, RetailerFeed, User } from "@pricora/database";
import { Auth, CurrentUser, randomToken, sha256 } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, PRISMA, QUEUES, type PrismaClient, type Queues } from "../common/infra";
import { input } from "../common/validate";
import type { PriceEventJob } from "../core/alerts";
import { FEED_INLINE_MAX_ROWS, FEED_MAX_ROWS, parseMerchantFeed, processMerchantFeed, type MerchantFeedJob } from "../core/feeds";
import { MetricsService } from "../services/catalog.service";

const MAX_FEED_BYTES = 10 * 1024 * 1024;
const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

interface UploadedFeedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function feedOut(f: RetailerFeed): MerchantFeed {
  const errors = Array.isArray(f.errors) ? (f.errors as { row: number; field: string | null; message: string }[]) : [];
  return {
    id: f.id,
    name: f.name,
    format: f.format,
    status: f.status,
    rowsTotal: f.rowsTotal,
    rowsAccepted: f.rowsAccepted,
    rowsRejected: f.rowsRejected,
    errors,
    uploadedAt: f.uploadedAt.toISOString(),
    completedAt: f.completedAt?.toISOString() ?? null,
  };
}

function keyOut(k: ApiKey): ApiKeySummary {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

@Controller("merchant")
@Auth("merchant")
export class MerchantController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUES) private readonly queues: Queues,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  private async account(user: User): Promise<MerchantAccount> {
    const acc = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (!acc) throw new ApiException(404, "not_found", "No merchant account is linked to this user");
    return acc;
  }

  private async profileOut(acc: MerchantAccount): Promise<MerchantProfile> {
    const retailer = acc.retailerId ? await this.prisma.retailer.findUnique({ where: { id: acc.retailerId }, select: { id: true, slug: true, name: true } }) : null;
    return {
      id: acc.id,
      companyName: acc.companyName,
      contactEmail: acc.contactEmail,
      website: acc.website,
      retailer,
      verificationStatus: acc.verificationStatus,
      createdAt: acc.createdAt.toISOString(),
    };
  }

  @Get("profile")
  async profile(@CurrentUser() user: User): Promise<MerchantProfile> {
    return this.profileOut(await this.account(user));
  }

  @Patch("profile")
  async updateProfile(@CurrentUser() user: User, @Body() body: unknown): Promise<MerchantProfile> {
    const b = input("merchant.profile.update", "body", body);
    const acc = await this.account(user);
    return this.profileOut(await this.prisma.merchantAccount.update({ where: { id: acc.id }, data: b }));
  }

  // ───────── feeds ─────────
  @Get("feeds")
  async feeds(@CurrentUser() user: User, @Query() query: unknown): Promise<MerchantFeedListResponse> {
    const q = input("merchant.feeds.list", "query", query);
    const acc = await this.account(user);
    const where = { merchantAccountId: acc.id };
    const [total, rows] = await Promise.all([
      this.prisma.retailerFeed.count({ where }),
      this.prisma.retailerFeed.findMany({ where, orderBy: { uploadedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { items: rows.map(feedOut), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  }

  @Post("feeds")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_FEED_BYTES, files: 1, fields: 10 } }))
  async upload(@CurrentUser() user: User, @Body() body: unknown, @UploadedFile() file: UploadedFeedFile | undefined): Promise<MerchantFeed> {
    const meta = input("merchant.feeds.upload", "body", body);
    if (!file) throw new ApiException(422, "validation_failed", "Attach the feed as multipart field `file`");
    if (meta.format === "json") throw new ApiException(422, "validation_failed", "JSON feeds are not supported yet — use CSV or XML");
    // Server-side type check (SEC-L4): extension, declared MIME type and a binary sniff.
    const ext = (file.originalname.split(".").pop() ?? "").toLowerCase();
    const okExt = meta.format === "csv" ? ["csv", "txt", "tsv"] : ["xml"];
    const okMime = ["text/csv", "text/plain", "text/tab-separated-values", "application/vnd.ms-excel", "application/csv", "text/xml", "application/xml", "application/octet-stream"];
    if (!okExt.includes(ext) || !okMime.includes(file.mimetype.toLowerCase()) || file.buffer.subarray(0, 8192).includes(0)) {
      throw new ApiException(415, "unsupported_media_type", `Upload a .${okExt[0]} text file for format "${meta.format}"`);
    }
    const acc = await this.account(user);
    if (!acc.retailerId) {
      throw new ApiException(409, "conflict", "Your merchant account is not linked to a store yet. An admin links it during verification.");
    }
    const retailer = await this.prisma.retailer.findUnique({ where: { id: acc.retailerId } });
    if (!retailer) throw notFound("Store");
    const format = meta.format;
    const text = file.buffer.toString("utf8");
    const parsed = parseMerchantFeed(text, format, { id: `merchant-${acc.id}`, name: acc.companyName, retailerId: retailer.id });
    if (parsed.stats.rows > FEED_MAX_ROWS) {
      throw new ApiException(413, "payload_too_large", `Feeds are limited to ${FEED_MAX_ROWS} rows per upload (got ${parsed.stats.rows})`);
    }
    const feed = await this.prisma.retailerFeed.create({
      data: { retailerId: retailer.id, merchantAccountId: acc.id, name: meta.name, format, status: "queued", rowsTotal: parsed.stats.rows },
    });

    if (parsed.stats.rows <= FEED_INLINE_MAX_ROWS) {
      await processMerchantFeed(this.prisma, feed.id, parsed, (job) => this.enqueuePriceEventJob(job));
      this.metrics.invalidate();
      return feedOut(await this.prisma.retailerFeed.findUniqueOrThrow({ where: { id: feed.id } }));
    }

    // Large feed → stage on disk and hand off to the worker; clients poll GET /v1/merchant/feeds.
    const dir = this.env.FEED_UPLOAD_DIR ?? path.join(os.tmpdir(), "pricora-feeds");
    await mkdir(dir, { recursive: true });
    const staged = path.join(dir, `${feed.id}.${format}`);
    await writeFile(staged, file.buffer);
    const job: MerchantFeedJob = { feedId: feed.id, path: staged, format };
    try {
      await this.queues.merchantFeeds.add("process", job, { removeOnComplete: 500, removeOnFail: 500, attempts: 2 });
    } catch {
      await this.prisma.retailerFeed.update({ where: { id: feed.id }, data: { status: "failed", errors: [{ row: 0, field: null, message: "Processing queue unavailable — try again later" }] } });
      throw new ApiException(503, "service_unavailable", "Feed processing queue is unavailable — try again later");
    }
    return feedOut(feed);
  }

  private async enqueuePriceEventJob(job: PriceEventJob): Promise<void> {
    await this.queues.priceEvents.add("price-change", job, { removeOnComplete: 1000, removeOnFail: 1000 }).catch(() => undefined);
  }

  private async enqueuePriceEvent(offerId: string, prev: number, next: number, prevIn: boolean, nextIn: boolean): Promise<void> {
    const job: PriceEventJob = { offerId, previousPriceCents: prev, newPriceCents: next, previousInStock: prevIn, newInStock: nextIn, occurredAt: new Date().toISOString() };
    await this.queues.priceEvents.add("price-change", job, { removeOnComplete: 1000, removeOnFail: 1000 }).catch(() => undefined);
  }

  // ───────── offers ─────────
  @Get("offers")
  async offers(@CurrentUser() user: User, @Query() query: unknown): Promise<MerchantOfferListResponse> {
    const q = input("merchant.offers.list", "query", query);
    const acc = await this.account(user);
    const where: Prisma.OfferWhereInput = { merchantAccountId: acc.id, ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { product: { select: { slug: true } } } }),
    ]);
    return {
      items: rows.map((o) => this.offerOut(o, o.product.slug)),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }

  private offerOut(o: Prisma.OfferGetPayload<object>, productSlug: string): MerchantOffer {
    return {
      id: o.id,
      sku: o.retailerSku,
      title: o.title,
      productSlug,
      matchStatus: "matched",
      priceCents: o.priceCents,
      shippingCents: o.shippingCents,
      stock: o.stock,
      condition: o.condition,
      source: o.source,
      isActive: o.isActive,
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  @Patch("offers/:id")
  async updateOffer(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<MerchantOffer> {
    const { id } = input("merchant.offers.update", "params", params);
    const b = input("merchant.offers.update", "body", body);
    const acc = await this.account(user);
    const before = await this.prisma.offer.findFirst({ where: { id, merchantAccountId: acc.id } });
    if (!before) throw notFound("Offer");
    if (b.isActive && acc.verificationStatus !== "verified") throw new ApiException(403, "forbidden", "Offers go live after your account is verified");
    const now = new Date();
    const priceChanged = b.priceCents !== undefined && b.priceCents !== before.priceCents;
    const stockChanged = b.stock !== undefined && b.stock !== before.stock;
    const after = await this.prisma.offer.update({
      where: { id },
      data: { ...b, lastCheckedAt: now, ...(priceChanged ? { lastChangedAt: now } : {}) },
      include: { product: { select: { slug: true } } },
    });
    if (priceChanged || stockChanged) {
      await this.prisma.priceHistory.create({
        data: { offerId: id, observedAt: now, productId: after.productId, retailerId: after.retailerId, priceCents: after.priceCents, shippingCents: after.shippingCents, stock: after.stock, source: "merchant_upload" },
      });
      await this.enqueuePriceEvent(id, before.priceCents, after.priceCents, before.stock !== "out_of_stock", after.stock !== "out_of_stock");
      this.metrics.invalidate();
    }
    return this.offerOut(after, after.product.slug);
  }

  // ───────── analytics ─────────
  @Get("analytics")
  async analytics(@CurrentUser() user: User, @Query() query: unknown): Promise<MerchantAnalyticsResponse> {
    const { range } = input("merchant.analytics", "query", query);
    const acc = await this.account(user);
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86_400_000);
    const where = { retailerId: acc.retailerId ?? "__none__", createdAt: { gte: since } };
    const [clicks, conv, top, daily] = await Promise.all([
      this.prisma.affiliateClick.count({ where }),
      this.prisma.affiliateConversion.aggregate({ where: { click: where, status: { not: "reversed" } }, _count: { _all: true }, _sum: { orderAmountCents: true } }),
      this.prisma.affiliateClick.groupBy({ by: ["productId"], where: { ...where, productId: { not: null } }, _count: { _all: true }, orderBy: { _count: { productId: "desc" } }, take: 10 }),
      this.prisma.$queryRaw<{ t: Date; clicks: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS t, count(*) AS clicks FROM affiliate_clicks
        WHERE "retailerId" = ${acc.retailerId ?? "__none__"} AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    ]);
    const products = await this.prisma.product.findMany({ where: { id: { in: top.map((t) => t.productId).filter((x): x is string => Boolean(x)) } }, select: { id: true, slug: true, title: true } });
    return {
      range,
      // Impressions are not tracked yet; reported as 0 rather than estimated.
      impressions: 0,
      clicks,
      ctr: 0,
      conversions: conv._count._all,
      revenueCents: conv._sum.orderAmountCents ?? 0,
      topProducts: top.flatMap((t) => {
        const p = products.find((x) => x.id === t.productId);
        return p ? [{ productSlug: p.slug, title: p.title, clicks: t._count._all }] : [];
      }),
      series: daily.map((d) => ({ t: new Date(d.t).toISOString(), clicks: Number(d.clicks), impressions: 0 })),
    };
  }

  // ───────── API keys ─────────
  @Get("api-keys")
  async apiKeys(@CurrentUser() user: User): Promise<ApiKeyListResponse> {
    const acc = await this.account(user);
    const rows = await this.prisma.apiKey.findMany({ where: { merchantAccountId: acc.id }, orderBy: { createdAt: "desc" } });
    return { items: rows.map(keyOut) };
  }

  @Post("api-keys")
  async createKey(@CurrentUser() user: User, @Body() body: unknown): Promise<CreateApiKeyResponse> {
    const b = input("merchant.apiKeys.create", "body", body);
    const acc = await this.account(user);
    const active = await this.prisma.apiKey.count({ where: { merchantAccountId: acc.id, revokedAt: null } });
    if (active >= 10) throw new ApiException(409, "conflict", "Maximum of 10 active API keys");
    const secret = `pk_live_${randomToken(24)}`;
    const key = await this.prisma.apiKey.create({
      data: { merchantAccountId: acc.id, name: b.name, prefix: secret.slice(0, 12), keyHash: sha256(secret), scopes: b.scopes },
    });
    return { key: keyOut(key), secret };
  }

  @Delete("api-keys/:id")
  async revokeKey(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("merchant.apiKeys.revoke", "params", params);
    const acc = await this.account(user);
    const r = await this.prisma.apiKey.updateMany({ where: { id, merchantAccountId: acc.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw notFound("API key");
    return { ok: true };
  }
}
