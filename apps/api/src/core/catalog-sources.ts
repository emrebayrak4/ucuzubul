/**
 * Catalog sources that create and enrich products (worker jobs; see docs/DATA_SOURCES.md):
 *  - Channel3: per category, search → create ACTIVE products (founder decision 2026-11-27) with brand, image,
 *    attributes and one offer per store. Stores we don't have yet are added as retailers. Buy links are
 *    Channel3-attributed, so the offer url/affiliateUrl is the Channel3 link and its host is allow-listed.
 *    Once a category has enough real products its demo products are archived; below that they come back
 *    (founder decision: hide demos where real data exists; reversible).
 *  - Channel3 refresh: free product-detail calls update prices/stock and deactivate offers that disappeared.
 *  - Icecat: products with a UPC/EAN/GTIN get licensed images + specs (attributes group "Icecat").
 * Without credentials every job reports pending_configuration and touches nothing.
 * Searches cost Channel3 credits: the daily runner keeps a monthly budget from DataIngestionJob stats.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@pricora/database";
import {
  AdapterHttpError,
  Channel3Client,
  IcecatClient,
  channel3RetailerId,
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
/** Plain hostnames only (no path, port, spaces or user info). */
const HOSTNAME_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const C3_SKU = /^c3:([^:]+)/;
/** Real products a category needs before its demo products are hidden. */
const DEFAULT_MIN_REAL_PRODUCTS = 3;
/** Channel3 free tier is 1,000 searches/month; keep headroom. */
const DEFAULT_MONTHLY_SEARCH_CAP = 900;
/** Adapter id → our retailer slug where they differ (same map as the worker's price refresh). */
const TRACKED_RETAILER_SLUG: Readonly<Record<string, string>> = { bestbuy: "best-buy", homedepot: "home-depot", bhphoto: "bh-photo", samsclub: "sams-club" };
/** Stop a daily run after this many consecutive failed searches (rate limit / outage). */
const MAX_CONSECUTIVE_ERRORS = 3;

function c3ProductId(retailerSku: string): string | null {
  return C3_SKU.exec(retailerSku)?.[1] ?? null;
}

/** Offers of exactly this Channel3 product: "c3:<id>" or "c3:<id>:<condition>" (never "c3:<id>X"). */
function c3SkuWhere(id: string) {
  return { OR: [{ retailerSku: `c3:${id}` }, { retailerSku: { startsWith: `c3:${id}:` } }] };
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

function cleanDomain(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  return HOSTNAME_RE.test(d) ? d : null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

function shortHash(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 8);
}

/** A listing we can store: USD, a valid store domain and a Channel3 https buy link. */
function storable(l: NormalizedListing): boolean {
  const o = l.offer;
  if (!o || o.currency !== "USD" || !o.affiliateUrl) return false;
  const host = hostOf(o.affiliateUrl);
  return !!host && CHANNEL3_HOST_RE.test(host) && cleanDomain(o.sellerName ?? l.product.retailerId) !== null;
}

// ───────────────────────── shared upserts ─────────────────────────

type RetailerRow = { id: string; domain: string; allowedRedirectHosts: string[] };
const RETAILER_SELECT = { id: true, domain: true, allowedRedirectHosts: true } as const;

/** Retailer for a store domain; created (with a US market row) when we don't have it yet. Safe under concurrent runs. */
async function retailerForDomain(prisma: PrismaClient, domain: string, cache: Map<string, RetailerRow>, stats: { retailersCreated: number }): Promise<RetailerRow> {
  const hit = cache.get(domain);
  if (hit) return hit;
  const find = () => prisma.retailer.findFirst({ where: { OR: [{ domain }, { domain: `www.${domain}` }] }, select: RETAILER_SELECT });
  let r = await find();
  if (!r) {
    // A store we already track by id (Sam's Club, Target…) gets our own retailer slug, so a later official
    // retailer row (seed / admin, upserted by slug) updates this row instead of colliding on the domain.
    const known = channel3RetailerId(domain);
    const base = known ? (TRACKED_RETAILER_SLUG[known] ?? known) : slugify(domain.replace(/\./g, "-"), { maxLength: 60 }) || "store";
    const taken = await prisma.retailer.findUnique({ where: { slug: base }, select: { id: true } });
    const slug = taken ? `${base}-${shortHash(domain)}` : base;
    const websiteUrl = `https://${domain}`;
    try {
      r = await prisma.retailer.create({
        data: {
          slug,
          name: domain,
          domain,
          websiteUrl,
          integrationStatus: "live",
          markets: { create: { marketId: "us", isPrimary: true, localDomain: domain, websiteUrl, notes: "Added automatically from Channel3 offers." } },
        },
        select: RETAILER_SELECT,
      });
      stats.retailersCreated++;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      r = await find(); // created concurrently
      if (!r) throw err;
    }
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

/** Upsert one (storable) Channel3 listing as an offer of `productId`. */
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
  const priceOrStockChanged = !prev || prev.priceCents !== o.priceCents || prev.stock !== stock;
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
  if (priceOrStockChanged) {
    await prisma.priceHistory.create({
      data: { offerId: saved.id, observedAt: now, productId: saved.productId, retailerId: retailer.id, priceCents: o.priceCents, shippingCents: o.shippingCents, currency: o.currency, stock, source: "affiliate" },
    });
  }
  if (prev && priceOrStockChanged && deps.enqueuePriceEvent) {
    await deps.enqueuePriceEvent({
      offerId: prev.id,
      previousPriceCents: prev.priceCents,
      newPriceCents: o.priceCents,
      previousInStock: prev.stock !== "out_of_stock",
      newInStock: stock !== "out_of_stock",
      occurredAt: now.toISOString(),
    });
  }
  if (!prev) return "created";
  return priceOrStockChanged ? "changed" : "unchanged";
}

async function brandId(prisma: PrismaClient, name: string | null): Promise<string | null> {
  if (!name) return null;
  const find = () => prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const existing = await find();
  if (existing) return existing.id;
  const base = slugify(name, { maxLength: 80 }) || "brand";
  const slug = (await prisma.brand.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${shortHash(name)}` : base;
  try {
    return (await prisma.brand.create({ data: { name, slug }, select: { id: true } })).id;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return (await find())?.id ?? null; // created concurrently
  }
}

/** Find-or-create the catalog product for a Channel3 product (slug is stable per Channel3 id). */
async function productFor(prisma: PrismaClient, p: Channel3Product, categoryId: string): Promise<{ id: string; created: boolean }> {
  const slug = `${slugify(p.title, { maxLength: 100 }) || "product"}-${shortHash(p.id)}`;
  const bySlug = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  if (bySlug) return { id: bySlug.id, created: false };
  try {
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
    return { id: created.id, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const again = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!again) throw err;
    return { id: again.id, created: false };
  }
}

/**
 * Hide a category's demo products once it has `minReal` real products with an active offer; show them again
 * when it drops below. Returns the number of demo rows archived (positive) or restored (negative).
 */
async function syncDemoVisibility(prisma: PrismaClient, categoryId: string, minReal: number): Promise<number> {
  const real = await prisma.product.count({ where: { categoryId, isDemo: false, status: "active", offers: { some: { isActive: true } } } });
  if (real >= minReal) return (await prisma.product.updateMany({ where: { categoryId, isDemo: true, status: "active" }, data: { status: "archived" } })).count;
  return -(await prisma.product.updateMany({ where: { categoryId, isDemo: true, status: "archived" }, data: { status: "active" } })).count;
}

function channel3(env: EnvLike, deps: CatalogSourceDeps): Channel3Client {
  return deps.channel3 ?? new Channel3Client({ env });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  demoRestored: number;
  warnings: string[];
}

/** One Channel3 search for a category (1 credit) → products + offers in that category. */
export async function ingestChannel3Category(
  prisma: PrismaClient,
  env: EnvLike,
  categoryId: string,
  deps: CatalogSourceDeps = {},
  opts: { limit?: number; minRealProducts?: number } = {},
): Promise<Channel3CategoryStats> {
  const stats: Channel3CategoryStats = { status: "ok", message: "", products: 0, productsCreated: 0, productsMatched: 0, offersUpserted: 0, priceChanges: 0, retailersCreated: 0, skippedOffers: 0, demoArchived: 0, demoRestored: 0, warnings: [] };
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true } });
  if (!category) return { ...stats, status: "error", message: "Category not found" };
  const now = deps.now ?? new Date();
  const page = await client.search({ query: category.name, limit: opts.limit ?? 20, inStockOnly: true });
  stats.warnings.push(...page.warnings);
  const retailers = new Map<string, RetailerRow>();
  for (const p of page.items) {
    const all = client.toListings(p);
    const listings = all.filter(storable);
    stats.skippedOffers += all.length - listings.length;
    if (!listings.length) continue; // never create a product we can't attach an offer to
    stats.products++;
    const existing = await prisma.offer.findFirst({ where: c3SkuWhere(p.id), select: { productId: true } });
    let productId = existing?.productId ?? null;
    if (productId) stats.productsMatched++;
    else {
      const r = await productFor(prisma, p, category.id);
      productId = r.id;
      if (r.created) stats.productsCreated++;
      else stats.productsMatched++;
    }
    for (const l of listings) {
      const retailer = await retailerForDomain(prisma, cleanDomain(l.offer?.sellerName ?? l.product.retailerId) as string, retailers, stats);
      const r = await upsertChannel3Offer(prisma, productId, retailer, l, deps, now);
      if (r === "skipped") stats.skippedOffers++;
      else stats.offersUpserted++;
      if (r === "changed") stats.priceChanges++;
    }
  }
  const demo = await syncDemoVisibility(prisma, category.id, opts.minRealProducts ?? DEFAULT_MIN_REAL_PRODUCTS);
  if (demo > 0) stats.demoArchived = demo;
  else stats.demoRestored = -demo;
  stats.message = `${stats.products} product(s) for "${category.name}"`;
  return stats;
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Daily catalog run, one search (1 credit) per leaf category. Categories searched least recently go first.
 * Credit use is capped per run (`searchesPerRun`, default 30) and per calendar month (`monthlyCap`, default 900,
 * counted from previous runs' DataIngestionJob stats). Stops after repeated failures.
 */
export async function runChannel3Catalog(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { searchesPerRun?: number; monthlyCap?: number } = {},
): Promise<{ status: Status; message: string; searches: number; categories: Record<string, Channel3CategoryStats | { error: string }> }> {
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}`, searches: 0, categories: {} };
  const now = deps.now ?? new Date();
  const history = await prisma.dataIngestionJob.findMany({
    where: { kind: "channel3-catalog", startedAt: { gte: new Date(now.getTime() - 31 * 86_400_000) } },
    select: { startedAt: true, stats: true },
  });
  const since = monthStart(now);
  let used = 0;
  const lastSearched = new Map<string, number>();
  for (const h of history) {
    const s = (h.stats ?? {}) as { searches?: unknown; categories?: unknown };
    if (h.startedAt && h.startedAt >= since && typeof s.searches === "number") used += s.searches;
    if (s.categories && typeof s.categories === "object") {
      for (const slug of Object.keys(s.categories)) lastSearched.set(slug, Math.max(lastSearched.get(slug) ?? 0, h.startedAt?.getTime() ?? 0));
    }
  }
  const budget = Math.max(0, Math.min(opts.searchesPerRun ?? 30, (opts.monthlyCap ?? DEFAULT_MONTHLY_SEARCH_CAP) - used));
  if (budget === 0) return { status: "ok", message: `Monthly Channel3 search budget used (${used})`, searches: 0, categories: {} };
  const leaves = await prisma.category.findMany({ where: { isActive: true, children: { none: {} } }, select: { id: true, slug: true, sortOrder: true } });
  leaves.sort((a, b) => (lastSearched.get(a.slug) ?? 0) - (lastSearched.get(b.slug) ?? 0) || a.sortOrder - b.sortOrder);
  const out: Record<string, Channel3CategoryStats | { error: string }> = {};
  let searches = 0;
  let failures = 0;
  let consecutive = 0;
  for (const c of leaves.slice(0, budget)) {
    searches++;
    try {
      out[c.slug] = await ingestChannel3Category(prisma, env, c.id, { ...deps, channel3: client });
      consecutive = 0;
    } catch (err) {
      const message = errorMessage(err);
      out[c.slug] = { error: message };
      failures++;
      consecutive++;
      await prisma.integrationError.create({ data: { provider: "channel3", code: "catalog_ingest_failed", message } });
      if (client.status() === "error" || consecutive >= MAX_CONSECUTIVE_ERRORS) break; // bad key / rate limit / outage
    }
  }
  const status: Status = searches > 0 && failures === searches ? "error" : "ok";
  return { status, message: `${searches} search(es), ${failures} failed; ${used + searches} used this month`, searches, categories: out };
}

// ───────────────────────── Channel3 refresh ─────────────────────────

export interface Channel3RefreshStats {
  status: Status;
  message: string;
  checked: number;
  priceChanges: number;
  deactivated: number;
  gone: number;
  errors: number;
  retailersCreated: number;
  demoRestored: number;
}

/**
 * Free product-detail refresh for Channel3 products, least recently checked first (inactive offers included,
 * so products that came back are revived). One failing product never blocks the rest.
 */
export async function refreshChannel3Offers(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { maxProducts?: number; productIds?: string[]; minRealProducts?: number } = {},
): Promise<Channel3RefreshStats> {
  const stats: Channel3RefreshStats = { status: "ok", message: "", checked: 0, priceChanges: 0, deactivated: 0, gone: 0, errors: 0, retailersCreated: 0, demoRestored: 0 };
  const client = channel3(env, deps);
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const now = deps.now ?? new Date();
  const max = opts.maxProducts ?? 200;
  let ids = opts.productIds;
  if (!ids) {
    const rows = await prisma.offer.findMany({ where: { retailerSku: { startsWith: "c3:" } }, select: { retailerSku: true }, orderBy: { lastCheckedAt: "asc" }, take: max * 4 });
    ids = [...new Set(rows.map((r) => c3ProductId(r.retailerSku)).filter((x): x is string => !!x))];
  }
  const retailers = new Map<string, RetailerRow>();
  const touchedCategories = new Set<string>();
  for (const id of ids.slice(0, max)) {
    const own = await prisma.offer.findMany({ where: c3SkuWhere(id), select: { id: true, productId: true, retailerId: true, retailerSku: true, isActive: true, product: { select: { categoryId: true } } } });
    if (!own.length) continue;
    stats.checked++;
    try {
      const p = await client.getProduct(id);
      const categoryId = own[0]!.product.categoryId;
      if (categoryId) touchedCategories.add(categoryId);
      if (!p) {
        const r = await prisma.offer.updateMany({ where: { id: { in: own.map((o) => o.id) }, isActive: true }, data: { isActive: false } });
        stats.deactivated += r.count;
        stats.gone++;
        continue;
      }
      const seen = new Set<string>();
      for (const l of client.toListings(p).filter(storable)) {
        const retailer = await retailerForDomain(prisma, cleanDomain(l.offer?.sellerName ?? l.product.retailerId) as string, retailers, stats);
        const result = await upsertChannel3Offer(prisma, own[0]!.productId, retailer, l, deps, now);
        if (result === "changed") stats.priceChanges++;
        if (result !== "skipped") seen.add(`${retailer.id}\u0000${l.product.retailerSku}`);
      }
      const vanished = own.filter((o) => o.isActive && !seen.has(`${o.retailerId}\u0000${o.retailerSku}`)).map((o) => o.id);
      if (vanished.length) stats.deactivated += (await prisma.offer.updateMany({ where: { id: { in: vanished } }, data: { isActive: false } })).count;
    } catch (err) {
      stats.errors++;
      await prisma.integrationError.create({ data: { provider: "channel3", code: "refresh_failed", message: `${id}: ${errorMessage(err)}`.slice(0, 1000) } });
      if (client.status() === "error") break; // bad key: stop
    } finally {
      // Always move this product to the back of the queue, so a failing one can't starve the others.
      await prisma.offer.updateMany({ where: c3SkuWhere(id), data: { lastCheckedAt: now } });
    }
  }
  for (const c of touchedCategories) {
    const d = await syncDemoVisibility(prisma, c, opts.minRealProducts ?? DEFAULT_MIN_REAL_PRODUCTS);
    if (d < 0) stats.demoRestored += -d;
  }
  if (stats.checked > 0 && stats.errors === stats.checked) stats.status = "error";
  stats.message = `${stats.checked} product(s) refreshed, ${stats.errors} error(s)`;
  return stats;
}

// ───────────────────────── Icecat enrichment ─────────────────────────

export interface IcecatEnrichStats {
  status: Status;
  message: string;
  checked: number;
  enriched: number;
  notFound: number;
  errors: number;
}

const ICECAT_GROUP = "Icecat";

/**
 * Images + specs from Open Icecat for products with a GTIN that were not enriched yet. Products are taken
 * least recently updated first; every checked product is touched, so misses rotate to the back of the queue.
 */
export async function enrichWithIcecat(
  prisma: PrismaClient,
  env: EnvLike,
  deps: CatalogSourceDeps = {},
  opts: { limit?: number; productIds?: string[] } = {},
): Promise<IcecatEnrichStats> {
  const stats: IcecatEnrichStats = { status: "ok", message: "", checked: 0, enriched: 0, notFound: 0, errors: 0 };
  const client = deps.icecat ?? new IcecatClient({ env });
  if (client.status() === "pending_configuration") return { ...stats, status: "pending_configuration", message: `Missing ${client.missingEnv().join(", ")}` };
  const now = deps.now ?? new Date();
  const products = await prisma.product.findMany({
    where: {
      ...(opts.productIds ? { id: { in: opts.productIds } } : {}),
      status: "active",
      isDemo: false,
      identifiers: { some: { type: { in: ["UPC", "EAN", "GTIN"] } } },
      attributes: { none: { group: ICECAT_GROUP } },
    },
    select: { id: true, title: true, identifiers: { where: { type: { in: ["UPC", "EAN", "GTIN"] } }, select: { value: true } }, images: { select: { url: true } } },
    orderBy: { updatedAt: "asc" },
    take: opts.limit ?? 50,
  });
  for (const p of products) {
    stats.checked++;
    try {
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
    } catch (err) {
      stats.errors++;
      await prisma.integrationError.create({ data: { provider: "icecat", code: "enrich_failed", message: `${p.id}: ${errorMessage(err)}`.slice(0, 1000) } });
      if (err instanceof AdapterHttpError && client.status() === "error") break; // unknown shop name: stop
    } finally {
      await prisma.product.update({ where: { id: p.id }, data: { updatedAt: now } });
    }
  }
  if (stats.checked > 0 && stats.errors === stats.checked) stats.status = "error";
  stats.message = `${stats.enriched}/${stats.checked} product(s) enriched, ${stats.notFound} not in Open Icecat, ${stats.errors} error(s)`;
  return stats;
}
