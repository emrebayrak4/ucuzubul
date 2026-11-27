/**
 * Catalog sources that create and enrich products (worker jobs; see docs/DATA_SOURCES.md):
 *  - Channel3: per category, search → create ACTIVE products (founder decision 2026-11-27) with brand, image,
 *    attributes and one offer per store. Stores we don't have yet are added as retailers. Buy links are
 *    Channel3-attributed, so the offer url/affiliateUrl is the Channel3 link and its host is allow-listed.
 *    When a category gets real products, its demo products are archived (founder decision, reversible).
 *  - Channel3 refresh: free product-detail calls update prices/stock and deactivate offers that disappeared.
 *  - Icecat: products with a UPC/EAN/GTIN get licensed images + specs (attributes group "Icecat").
 * Without credentials every job reports pending_configuration and touches nothing.
 */
import type { PrismaClient } from "@pricora/database";
import {
  Channel3Client,
  IcecatClient,
  type Channel3Product,
  type EnvLike,
  type NormalizedListing,
} from "@pricora/retailer-adapters";
import { slugify } from "@pricora/utils";
import type { PriceEventJob } from "./alerts";

export const CATALOG_SOURCES_QUEUE = "catalog-sources";
export type CatalogSourceJobName = "channel3-catalog" | "channel3-refresh" | "icecat-enrich";

export interface CatalogSourceDeps {
  channel3?: Channel3Client;
  icecat?: IcecatClient;
  enqueuePriceEvent?: (job: PriceEventJob) => Promise<void>;
  now?: Date;
}

type Status = "ok" | "pending_configuration" | "error";

const STOCK = { in_stock: "in_stock", limited: "low_stock", out_of_stock: "out_of_stock", preorder: "preorder", backorder: "unknown", unknown: "unknown" } as const;
/** Channel3 buy-link hosts we allow as outbound redirect targets for the offers they attribute. */
const CHANNEL3_HOST_RE = /(^|\.)trychannel3\.com$/i;
const C3_SKU = /^c3:([^:]+)/;

function c3ProductId(retailerSku: string): string | null {
  return C3_SKU.exec(retailerSku)?.[1] ?? null;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function cleanDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

// ───────────────────────── shared upserts ─────────────────────────

type RetailerRow = { id: string; domain: string; allowedRedirectHosts: string[] };

/** Retailer for a store domain; created (with a US market row) when we don't have it yet. */
async function retailerForDomain(prisma: PrismaClient, domainRaw: string, cache: Map<string, RetailerRow>, stats: { retailersCreated: number }): Promise<RetailerRow> {
  const domain = cleanDomain(domainRaw);
  const hit = cache.get(domain);
  if (hit) return hit;
  let r = await prisma.retailer.findFirst({ where: { OR: [{ domain }, { domain: `www.${domain}` }] }, select: { id: true, domain: true, allowedRedirectHosts: true } });
  if (!r) {
    const base = slugify(domain.replace(/\./g, "-"), { maxLength: 60 }) || "store";
    const slug = (await prisma.retailer.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-c3` : base;
    const websiteUrl = `https://${domain}`;
    r = await prisma.retailer.create({
      data: {
        slug,
        name: domain,
        domain,
        websiteUrl,
        integrationStatus: "live",
        markets: { create: { marketId: "us", isPrimary: true, localDomain: domain, websiteUrl, notes: "Added automatically from Channel3 offers." } },
      },
      select: { id: true, domain: true, allowedRedirectHosts: true },
    });
    stats.retailersCreated++;
  }
  cache.set(domain, r);
  return r;
}

async function allowHost(prisma: PrismaClient, r: RetailerRow, url: string): Promise<boolean> {
  const host = hostOf(url);
  if (!host || !CHANNEL3_HOST_RE.test(host)) return false;
  if (!r.allowedRedirectHosts.map((h) => h.toLowerCase()).includes(host)) {
    await prisma.retailer.update({ where: { id: r.id }, data: { allowedRedirectHosts: { push: host } } });
    r.allowedRedirectHosts = [...r.allowedRedirectHosts, host];
  }
  return true;
}

/** Upsert one Channel3 listing as an offer of `productId`. */
async function upsertChannel3Offer(
  prisma: PrismaClient,
  productId: string,
  retailer: RetailerRow,
  listing: NormalizedListing,
  deps: CatalogSourceDeps,
  now: Date,
): Promise<"created" | "changed" | "unchanged" | "skipped"> {
  const o = listing.offer;
  if (!o?.affiliateUrl || !(await allowHost(prisma, retailer, o.affiliateUrl))) return "skipped";
  const stock = STOCK[o.availability];
  const prev = await prisma.offer.findUnique({ where: { retailerId_retailerSku: { retailerId: retailer.id, retailerSku: listing.product.retailerSku } } });
  const changed = !prev || prev.priceCents !== o.priceCents || prev.stock !== stock || !prev.isActive;
  const data = {
    title: listing.product.title.slice(0, 500),
    url: o.affiliateUrl,
    affiliateUrl: o.affiliateUrl,
    condition: o.condition,
    sellerName: o.sellerName,
    priceCents: o.priceCents,
    listPriceCents: o.listPriceCents,
    currency: o.currency,
    stock,
    source: "affiliate" as const,
    isActive: true,
    lastCheckedAt: now,
  };
  const saved = prev
    ? await prisma.offer.update({ where: { id: prev.id }, data: { ...data, ...(prev.priceCents !== o.priceCents ? { lastChangedAt: now } : {}) } })
    : await prisma.offer.create({ data: { ...data, productId, retailerId: retailer.id, retailerSku: listing.product.retailerSku, firstSeenAt: now, lastChangedAt: now } });
  if (changed) {
    await prisma.priceHistory
      .create({ data: { offerId: saved.id, observedAt: now, productId: saved.productId, retailerId: retailer.id, priceCents: o.priceCents, shippingCents: o.shippingCents, currency: o.currency, stock, source: "affiliate" } })
      .catch(() => undefined);
  }
  if (prev && changed && deps.enqueuePriceEvent) {
    await deps.enqueuePriceEvent({
      offerId: prev.id,
      previousPriceCents: prev.priceCents,
      newPriceCents: o.priceCents,
      previousInStock: prev.stock !== "out_of_stock",
      newInStock: stock !== "out_of_stock",
      occurredAt: now.toISOString(),
    });
  }
  return prev ? (changed ? "changed" : "unchanged") : "created";
}

async function brandId(prisma: PrismaClient, name: string | null): Promise<string | null> {
  if (!name) return null;
  const existing = await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (existing) return existing.id;
  const base = slugify(name, { maxLength: 80 }) || "brand";
  const slug = (await prisma.brand.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${Date.now().toString(36)}` : base;
  return (await prisma.brand.create({ data: { name, slug }, select: { id: true } })).id;
}

async function createProduct(prisma: PrismaClient, p: Channel3Product, categoryId: string): Promise<string> {
  const slug = `${slugify(p.title, { maxLength: 100 }) || "product"}-${p.id.toLowerCase()}`;
  const created = await prisma.product.create({
    data: {
      slug,
      title: p.title.slice(0, 500),
      description: p.description,
      brandId: await brandId(prisma, p.brand),
      categoryId,
      status: "active",
      isDemo: false,
      images: p.imageUrl ? { create: [{ url: p.imageUrl, alt: p.title.slice(0, 200), sortOrder: 0, source: "affiliate" }] } : undefined,
      attributes: { create: Object.entries(p.attributes).map(([name, value], i) => ({ name, value, sortOrder: i })) },
    },
    select: { id: true },
  });
  return created.id;
}

function channel3(env: EnvLike, deps: CatalogSourceDeps): Channel3Client {
  return deps.channel3 ?? new Channel3Client({ env });
}

// ───────────────────────── Channel3 catalog ─────────────────────────

export interface Channel3CategoryStats {
  status: Status;
  message: string;
  products: number;
  productsCreated: number;
  productsMatched: number;
  offersUpserted: number;
  priceChanges: number;
  retailersCreated: number;
  skippedOffers: number;
  demoArchived: number;
  warnings: string[];
}

/** One Channel3 search for a category (1 credit) → products + offers in that category. */
export async function ingestChannel3Category(
  prisma: PrismaClient,
  env: EnvLike,
  categoryId: string,
  deps: CatalogSourceDeps = {},
  opts: { limit?: number } = {},
): Promise<Channel3CategoryStats> {
  const stats: Channel3CategoryStats = { status: "ok", message: "", products: 0, productsCreated: 0, productsMatched: 0, offersUpserted: 0, priceChanges: 0, retailersCreated: 0, skippedOffers: 0, demoArchived: 0, warnings: [] };
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
  if (!category) return { ...stats, status: "error", message: "Category not found" };
  const now = deps.now ?? new Date();
  const page = await client.search({ query: category.name, limit: opts.limit ?? 20, inStockOnly: true });
  stats.warnings.push(...page.warnings);
  const retailers = new Map<string, RetailerRow>();
  for (const p of page.items) {
    const listings = client.toListings(p).filter((l) => l.offer?.currency === "USD");
    if (!listings.length) continue;
    stats.products++;
    const existing = await prisma.offer.findFirst({ where: { retailerSku: { startsWith: `c3:${p.id}` } }, select: { productId: true, retailerSku: true } });
    let productId = existing && c3ProductId(existing.retailerSku) === p.id ? existing.productId : null;
    if (productId) stats.productsMatched++;
    else {
      productId = await createProduct(prisma, p, category.id);
      stats.productsCreated++;
    }
    for (const l of listings) {
      const retailer = await retailerForDomain(prisma, l.offer?.sellerName ?? l.product.retailerId, retailers, stats);
      const r = await upsertChannel3Offer(prisma, productId, retailer, l, deps, now);
      if (r === "skipped") stats.skippedOffers++;
      else stats.offersUpserted++;
      if (r === "changed") stats.priceChanges++;
    }
  }
  const real = await prisma.product.count({ where: { categoryId: category.id, isDemo: false, status: "active", offers: { some: { isActive: true } } } });
  if (real > 0) {
    const archived = await prisma.product.updateMany({ where: { categoryId: category.id, isDemo: true, status: "active" }, data: { status: "archived" } });
    stats.demoArchived = archived.count;
  }
  stats.message = `${stats.products} product(s) for "${category.name}"`;
  return stats;
}

/**
 * Daily catalog run: leaf categories with the fewest real products first, one search (1 credit) each.
 * `searchesPerRun` caps credit use (default 30 ≈ 900 of the 1,000 free monthly searches).
 */
export async function runChannel3Catalog(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { searchesPerRun?: number } = {},
): Promise<{ status: Status; message: string; categories: Record<string, Channel3CategoryStats | { error: string }> }> {
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}`, categories: {} };
  const leaves = await prisma.category.findMany({
    where: { isActive: true, children: { none: {} } },
    select: { id: true, slug: true, sortOrder: true, _count: { select: { products: { where: { isDemo: false, status: "active" } } } } },
  });
  leaves.sort((a, b) => a._count.products - b._count.products || a.sortOrder - b.sortOrder);
  const out: Record<string, Channel3CategoryStats | { error: string }> = {};
  for (const c of leaves.slice(0, opts.searchesPerRun ?? 30)) {
    try {
      out[c.slug] = await ingestChannel3Category(prisma, env, c.id, { ...deps, channel3: client });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out[c.slug] = { error: message };
      await prisma.integrationError.create({ data: { provider: "channel3", code: "catalog_ingest_failed", message } });
      if (client.status() === "error") break; // bad key: stop spending requests
    }
  }
  return { status: "ok", message: `${Object.keys(out).length} categor(ies)`, categories: out };
}

// ───────────────────────── Channel3 refresh ─────────────────────────

export interface Channel3RefreshStats {
  status: Status;
  message: string;
  checked: number;
  priceChanges: number;
  deactivated: number;
  gone: number;
  retailersCreated: number;
}

/** Free product-detail refresh for Channel3 products, oldest check first. */
export async function refreshChannel3Offers(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { maxProducts?: number; productIds?: string[] } = {},
): Promise<Channel3RefreshStats> {
  const stats: Channel3RefreshStats = { status: "ok", message: "", checked: 0, priceChanges: 0, deactivated: 0, gone: 0, retailersCreated: 0 };
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const now = deps.now ?? new Date();
  let ids = opts.productIds;
  if (!ids) {
    const rows = await prisma.offer.findMany({ where: { retailerSku: { startsWith: "c3:" }, isActive: true }, select: { retailerSku: true }, orderBy: { lastCheckedAt: "asc" }, take: (opts.maxProducts ?? 200) * 4 });
    ids = [...new Set(rows.map((r) => c3ProductId(r.retailerSku)).filter((x): x is string => !!x))];
  }
  const retailers = new Map<string, RetailerRow>();
  for (const id of ids.slice(0, opts.maxProducts ?? 200)) {
    const offers = await prisma.offer.findMany({ where: { retailerSku: { startsWith: `c3:${id}` } }, select: { id: true, productId: true, retailerId: true, retailerSku: true, isActive: true } });
    const own = offers.filter((o) => c3ProductId(o.retailerSku) === id);
    if (!own.length) continue;
    stats.checked++;
    const p = await client.getProduct(id);
    if (!p) {
      const r = await prisma.offer.updateMany({ where: { id: { in: own.map((o) => o.id) }, isActive: true }, data: { isActive: false, lastCheckedAt: now } });
      stats.deactivated += r.count;
      stats.gone++;
      continue;
    }
    const seen = new Set<string>();
    for (const l of client.toListings(p).filter((x) => x.offer?.currency === "USD")) {
      const retailer = await retailerForDomain(prisma, l.offer?.sellerName ?? l.product.retailerId, retailers, stats);
      const result = await upsertChannel3Offer(prisma, own[0]!.productId, retailer, l, deps, now);
      if (result === "changed") stats.priceChanges++;
      if (result !== "skipped") seen.add(`${retailer.id}\u0000${l.product.retailerSku}`);
    }
    const vanished = own.filter((o) => o.isActive && !seen.has(`${o.retailerId}\u0000${o.retailerSku}`)).map((o) => o.id);
    if (vanished.length) {
      const r = await prisma.offer.updateMany({ where: { id: { in: vanished } }, data: { isActive: false, lastCheckedAt: now } });
      stats.deactivated += r.count;
    }
  }
  stats.message = `${stats.checked} product(s) refreshed`;
  return stats;
}

// ───────────────────────── Icecat enrichment ─────────────────────────

export interface IcecatEnrichStats {
  status: Status;
  message: string;
  checked: number;
  enriched: number;
  notFound: number;
}

const ICECAT_GROUP = "Icecat";

/** Images + specs from Open Icecat for products with a GTIN that were not enriched yet. */
export async function enrichWithIcecat(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { limit?: number; productIds?: string[] } = {},
): Promise<IcecatEnrichStats> {
  const stats: IcecatEnrichStats = { status: "ok", message: "", checked: 0, enriched: 0, notFound: 0 };
  const client = deps.icecat ?? new IcecatClient({ env });
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const products = await prisma.product.findMany({
    where: {
      ...(opts.productIds ? { id: { in: opts.productIds } } : {}),
      status: "active",
      isDemo: false,
      identifiers: { some: { type: { in: ["UPC", "EAN", "GTIN"] } } },
      attributes: { none: { group: ICECAT_GROUP } },
    },
    select: { id: true, title: true, identifiers: { where: { type: { in: ["UPC", "EAN", "GTIN"] } }, select: { value: true } }, images: { select: { url: true } } },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 50,
  });
  for (const p of products) {
    stats.checked++;
    let content = null;
    for (const ident of p.identifiers) {
      try {
        content = await client.lookup({ gtin: ident.value });
      } catch (err) {
        if (err instanceof RangeError) continue; // malformed stored GTIN
        throw err;
      }
      if (content) break;
    }
    if (!content) {
      stats.notFound++;
      continue;
    }
    const have = new Set(p.images.map((i) => i.url));
    const images = content.images.filter((i) => !have.has(i.url));
    const specs = Object.entries(content.specs);
    await prisma.$transaction([
      prisma.productImage.createMany({ data: images.map((i, n) => ({ productId: p.id, url: i.url, alt: p.title.slice(0, 200), width: i.width, height: i.height, sortOrder: have.size + n, source: "api" as const })) }),
      prisma.productAttribute.createMany({ data: specs.map(([name, value], n) => ({ productId: p.id, group: ICECAT_GROUP, name, value, sortOrder: 1000 + n })) }),
    ]);
    stats.enriched++;
  }
  stats.message = `${stats.enriched}/${stats.checked} product(s) enriched`;
  return stats;
}
