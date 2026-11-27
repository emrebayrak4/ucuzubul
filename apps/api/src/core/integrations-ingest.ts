/**
 * Affiliate-network ingestion (worker + admin "run now"):
 *  - coupons:     network promotions → Coupon rows (source "affiliate", status "unverified")
 *  - products:    network catalogs/feeds → matching engine (GTIN, then @pricora/algorithms matchProducts) → Offer + PriceHistory
 *  - conversions: network reports → AffiliateConversion + Commission, attributed to AffiliateClick via our sub-id
 * Advertisers map to our retailers through AffiliateProgram (network, externalId). Unknown advertisers are
 * recorded as unmapped programs (retailerId null) for an admin to link — nothing is guessed.
 * Without credentials a network reports pending_configuration; nothing is fabricated.
 */
import { matchProducts, type MatchableProduct } from "@pricora/algorithms";
import type { Prisma, PrismaClient } from "@pricora/database";
import {
  NETWORK_REGISTRY,
  chunkRange,
  collectPages,
  createNetworkClient,
  detectLinkNetwork,
  type AffiliateNetworkClient,
  type EnvLike,
  type NetworkConversion,
  type NetworkCoupon,
  type NetworkId,
  type NetworkProduct,
  type NormalizedListing,
} from "@pricora/retailer-adapters";
import type { PriceEventJob } from "./alerts";
import { upsertIngestedCoupon, type FeedPullResult } from "./coupons";

export const NETWORK_INGEST_QUEUE = "network-ingest";
export type NetworkJobKind = "coupons" | "products" | "conversions";
export interface NetworkIngestJob {
  kind: NetworkJobKind;
  network: NetworkId;
  /** conversions: look-back window in days (default 45 — networks restate pending → approved/reversed). */
  days?: number;
}

const DAY_MS = 86_400_000;

function client(network: NetworkId, env: EnvLike): AffiliateNetworkClient {
  return createNetworkClient(network, { env });
}

/** Resolve (or register as unmapped) the AffiliateProgram for a network advertiser. */
export async function resolveProgram(
  prisma: PrismaClient,
  network: NetworkId,
  advertiserId: string | null,
  advertiserName: string | null,
): Promise<{ id: string; retailerId: string | null; isActive: boolean } | null> {
  if (!advertiserId) return null;
  const existing = await prisma.affiliateProgram.findUnique({ where: { network_externalId: { network, externalId: advertiserId } }, select: { id: true, retailerId: true, isActive: true } });
  if (existing) return existing;
  return prisma.affiliateProgram.create({
    data: { network, externalId: advertiserId, name: advertiserName ?? `${network} advertiser ${advertiserId}`, status: "pending_configuration", retailerId: null },
    select: { id: true, retailerId: true, isActive: true },
  });
}

/**
 * Outbound redirects are allow-listed per retailer. Tracking URLs from a network API live on the network's
 * click host (anrdoezrs.net, *.sjv.io, click.linksynergy.com, awin1.com, prf.hn…); add that host to the
 * retailer's allow-list only when it is a recognised affiliate-network host (never arbitrary domains).
 */
export async function allowNetworkHost(prisma: PrismaClient, retailerId: string, trackingUrl: string | null, known?: Set<string>): Promise<boolean> {
  if (!trackingUrl || !detectLinkNetwork(trackingUrl)) return false;
  let host: string;
  try {
    const u = new URL(trackingUrl);
    if (u.protocol !== "https:") return false;
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (known?.has(host)) return true;
  const r = await prisma.retailer.findUnique({ where: { id: retailerId }, select: { allowedRedirectHosts: true } });
  if (!r) return false;
  if (!r.allowedRedirectHosts.map((h) => h.toLowerCase()).includes(host)) {
    await prisma.retailer.update({ where: { id: retailerId }, data: { allowedRedirectHosts: { push: host } } });
  }
  known?.add(host);
  return true;
}

// ───────────────────────── coupons ─────────────────────────

export function toNormalizedCoupon(c: NetworkCoupon, retailerId: string) {
  return {
    source: "affiliate" as const,
    externalId: `${c.network}:${c.externalId}`,
    retailerId,
    code: c.code,
    title: c.title.slice(0, 300),
    description: c.description?.slice(0, 2000) ?? null,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minSpendCents: c.minSpendCents,
    startsAt: c.startsAt ? new Date(c.startsAt) : null,
    expiresAt: c.expiresAt ? new Date(c.expiresAt) : null,
    affiliateUrl: c.trackingUrl,
  };
}

export async function ingestNetworkCoupons(prisma: PrismaClient, network: NetworkId, env: EnvLike, now = new Date()): Promise<FeedPullResult> {
  const meta = NETWORK_REGISTRY.find((n) => n.id === network);
  const c = client(network, env);
  const missing = c.missingEnv();
  if (missing.length) return { id: network, status: "pending_configuration", message: `Missing ${missing.join(", ")}`, created: 0, updated: 0 };
  if (!meta?.capabilities.coupons) return { id: network, status: "unsupported", message: `${c.name} has no publisher promotions API`, created: 0, updated: 0 };
  try {
    const { items, warnings, truncated } = await collectPages((cur) => c.fetchCoupons(cur), 20);
    let created = 0;
    let updated = 0;
    let unmapped = 0;
    let expired = 0;
    for (const coupon of items) {
      if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
        expired++;
        continue;
      }
      const program = await resolveProgram(prisma, network, coupon.advertiserId, coupon.advertiserName);
      if (!program?.retailerId || !program.isActive) {
        unmapped++;
        continue;
      }
      const n = toNormalizedCoupon(coupon, program.retailerId);
      // Only keep tracking URLs we can actually redirect to (recognised network host, https).
      if (n.affiliateUrl && !(await allowNetworkHost(prisma, program.retailerId, n.affiliateUrl))) n.affiliateUrl = null;
      const r = await upsertIngestedCoupon(prisma, n);
      if (r === "created") created++;
      else updated++;
    }
    const notes = [`${items.length} promotion(s)`, unmapped ? `${unmapped} from advertisers not linked to a retailer (Admin → Affiliate programs)` : "", expired ? `${expired} already expired` : "", truncated ? "page limit reached" : "", ...warnings.slice(0, 3)].filter(Boolean);
    return { id: network, status: "ok", message: notes.join("; "), created, updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.integrationError.create({ data: { provider: network, code: "coupon_ingest_failed", message } });
    return { id: network, status: "error", message, created: 0, updated: 0 };
  }
}

// ───────────────────────── products ─────────────────────────

const STOCK = { in_stock: "in_stock", limited: "low_stock", out_of_stock: "out_of_stock", preorder: "preorder", backorder: "unknown", unknown: "unknown" } as const;

function gtinVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  const core = digits.replace(/^0+/, "");
  const out = new Set<string>([digits]);
  for (const len of [12, 13, 14]) if (core.length <= len) out.add(core.padStart(len, "0"));
  return [...out];
}

export interface ProductIngestStats {
  listings: number;
  offersUpserted: number;
  priceChanges: number;
  queuedForReview: number;
  rejected: number;
  skippedNoPrice: number;
  skippedUrl: number;
  demoOffersHidden: number;
}

/** Allow-listed outbound host (retailer domain, its www, or explicit allowedRedirectHosts). */
function urlAllowed(target: string | null, domain: string, hosts: string[]): boolean {
  if (!target) return false;
  try {
    const u = new URL(target);
    return u.protocol === "https:" && new Set([domain, `www.${domain}`, ...hosts].map((h) => h.toLowerCase())).has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Upsert network listings for one retailer: exact GTIN → auto; otherwise score against same-brand
 * catalog products with matchProducts (auto ≥ 0.98, review ≥ 0.85, else reject). Offers are source
 * "affiliate" and carry the network tracking URL; the redirect adds our sub-id at click time.
 */
export async function upsertNetworkListings(
  prisma: PrismaClient,
  retailer: { id: string; domain: string; allowedRedirectHosts: string[] },
  listings: NormalizedListing[],
  enqueuePriceEvent: (job: PriceEventJob) => Promise<void>,
  now = new Date(),
): Promise<ProductIngestStats> {
  const stats: ProductIngestStats = { listings: listings.length, offersUpserted: 0, priceChanges: 0, queuedForReview: 0, rejected: 0, skippedNoPrice: 0, skippedUrl: 0, demoOffersHidden: 0 };
  const gtins = [...new Set(listings.flatMap((l) => (l.product.gtin ? gtinVariants(l.product.gtin) : [])))];
  const idents = gtins.length
    ? await prisma.productIdentifier.findMany({ where: { value: { in: gtins }, product: { status: "active", isDemo: false } }, select: { value: true, product: { select: { id: true, condition: true } } } })
    : [];
  const existing = new Map((await prisma.offer.findMany({ where: { retailerId: retailer.id, retailerSku: { in: listings.map((l) => l.product.retailerSku) } } })).map((o) => [o.retailerSku, o]));
  const brandCache = new Map<string, MatchableProduct[]>();
  const allowedHosts = new Set(retailer.allowedRedirectHosts.map((h) => h.toLowerCase()));

  async function candidatesFor(brand: string): Promise<MatchableProduct[]> {
    const key = brand.toLowerCase();
    const hit = brandCache.get(key);
    if (hit) return hit;
    const rows = await prisma.product.findMany({
      where: { status: "active", isDemo: false, brand: { name: { equals: brand, mode: "insensitive" } } },
      select: { id: true, title: true, mpn: true, model: true, condition: true, brand: { select: { name: true } }, identifiers: { select: { type: true, value: true } } },
      take: 500,
    });
    const out = rows.map((r) => ({
      id: r.id,
      title: r.title,
      brand: r.brand?.name ?? null,
      mpn: r.mpn,
      model: r.model,
      condition: r.condition,
      gtins: r.identifiers.filter((i) => ["UPC", "EAN", "GTIN"].includes(i.type)).map((i) => i.value),
    }));
    brandCache.set(key, out);
    return out;
  }

  for (const listing of listings) {
    const o = listing.offer;
    if (!o) {
      stats.skippedNoPrice++;
      continue;
    }
    const landing = o.productUrl ?? listing.product.productUrl;
    // The stored url must be on the retailer allow-list; the tracking URL is validated by host at redirect time.
    const url = urlAllowed(landing, retailer.domain, retailer.allowedRedirectHosts) ? landing : null;
    if (!url) {
      stats.skippedUrl++;
      continue;
    }
    const prev = existing.get(listing.product.retailerSku);
    let productId: string | null = prev?.productId ?? null;
    if (!productId) {
      const gset = listing.product.gtin ? new Set(gtinVariants(listing.product.gtin)) : null;
      productId = (gset ? idents.find((i) => gset.has(i.value) && i.product.condition === o.condition)?.product.id : undefined) ?? null;
    }
    if (!productId && listing.product.brand) {
      const me: MatchableProduct = {
        id: listing.product.retailerSku,
        title: listing.product.title,
        brand: listing.product.brand,
        mpn: listing.product.mpn,
        model: listing.product.model,
        condition: o.condition,
        gtins: listing.product.gtin ? [listing.product.gtin] : [],
      };
      let best: { id: string; confidence: number; decision: string; conflicts: string[] } | null = null;
      for (const cand of await candidatesFor(listing.product.brand)) {
        const r = matchProducts(me, cand);
        if (r.blocked) continue;
        if (!best || r.confidence > best.confidence) best = { id: cand.id, confidence: r.confidence, decision: r.decision, conflicts: r.conflicts.map((c) => c.attribute) };
      }
      if (best?.decision === "auto") productId = best.id;
      else if (best?.decision === "review") {
        await prisma.productMatch.create({
          data: {
            retailerId: retailer.id,
            productId: best.id,
            candidateTitle: listing.product.title.slice(0, 500),
            candidateData: JSON.parse(JSON.stringify(listing)) as Prisma.InputJsonValue,
            confidenceBp: Math.round(best.confidence * 10_000),
            method: listing.product.mpn ? "brand_mpn" : "attributes",
            status: "pending_review",
            conflicts: best.conflicts,
          },
        });
        stats.queuedForReview++;
        continue;
      }
    }
    if (!productId) {
      stats.rejected++;
      continue;
    }
    const stock = STOCK[o.availability];
    const affiliateUrl = o.affiliateUrl && (await allowNetworkHost(prisma, retailer.id, o.affiliateUrl, allowedHosts)) ? o.affiliateUrl : null;
    const changed = !prev || prev.priceCents !== o.priceCents || prev.stock !== stock;
    const saved = await prisma.offer.upsert({
      where: { retailerId_retailerSku: { retailerId: retailer.id, retailerSku: listing.product.retailerSku } },
      update: {
        title: listing.product.title.slice(0, 500),
        url,
        affiliateUrl,
        priceCents: o.priceCents,
        listPriceCents: o.listPriceCents,
        shippingCents: o.shippingCents,
        currency: o.currency,
        stock,
        isActive: true,
        source: "affiliate",
        lastCheckedAt: now,
        ...(prev && prev.priceCents !== o.priceCents ? { lastChangedAt: now } : {}),
      },
      create: {
        productId,
        retailerId: retailer.id,
        retailerSku: listing.product.retailerSku,
        title: listing.product.title.slice(0, 500),
        url,
        affiliateUrl,
        condition: o.condition,
        priceCents: o.priceCents,
        listPriceCents: o.listPriceCents,
        shippingCents: o.shippingCents,
        currency: o.currency,
        stock,
        source: "affiliate",
        isActive: true,
      },
    });
    stats.offersUpserted++;
    if (changed) {
      await prisma.priceHistory
        .create({ data: { offerId: saved.id, observedAt: now, productId: saved.productId, retailerId: retailer.id, priceCents: o.priceCents, shippingCents: o.shippingCents, currency: o.currency, stock, source: "affiliate" } })
        .catch(() => undefined);
      if (prev) {
        stats.priceChanges++;
        await enqueuePriceEvent({ offerId: prev.id, previousPriceCents: prev.priceCents, newPriceCents: o.priceCents, previousInStock: prev.stock !== "out_of_stock", newInStock: stock !== "out_of_stock", occurredAt: now.toISOString() });
      }
    }
  }
  if (stats.offersUpserted > 0) stats.demoOffersHidden = await hideDemoOffers(prisma, retailer.id);
  return stats;
}

/** Live data for a retailer automatically hides that retailer's demo offers (they stay in the DB, inactive). */
export async function hideDemoOffers(prisma: PrismaClient, retailerId: string): Promise<number> {
  const r = await prisma.offer.updateMany({ where: { retailerId, source: "demo", isActive: true }, data: { isActive: false } });
  return r.count;
}

export async function ingestNetworkProducts(
  prisma: PrismaClient,
  network: NetworkId,
  env: EnvLike,
  enqueuePriceEvent: (job: PriceEventJob) => Promise<void>,
  opts: { maxPagesPerProgram?: number } = {},
): Promise<{ status: "ok" | "pending_configuration" | "unsupported" | "error"; message: string; programs: Record<string, ProductIngestStats | { error: string }> }> {
  const meta = NETWORK_REGISTRY.find((n) => n.id === network);
  const c = client(network, env);
  const missing = c.missingEnv();
  if (missing.length) return { status: "pending_configuration", message: `Missing ${missing.join(", ")}`, programs: {} };
  if (!meta?.capabilities.products) return { status: "unsupported", message: `${c.name}: no product catalog API`, programs: {} };
  const programs = await prisma.affiliateProgram.findMany({
    where: { network, isActive: true, retailerId: { not: null }, externalId: { not: null } },
    include: { retailer: { select: { id: true, domain: true, allowedRedirectHosts: true, isActive: true } } },
  });
  if (!programs.length) return { status: "ok", message: "No active programs linked to a retailer (Admin → Affiliate programs)", programs: {} };
  const out: Record<string, ProductIngestStats | { error: string }> = {};
  for (const p of programs) {
    if (!p.retailer?.isActive || !p.externalId) continue;
    try {
      const { items } = await collectPages<NetworkProduct>((cur) => c.fetchProducts({ advertiserId: p.externalId as string }, cur), opts.maxPagesPerProgram ?? 10);
      out[p.externalId] = await upsertNetworkListings(prisma, p.retailer, items.map((i) => i.listing), enqueuePriceEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      out[p.externalId] = { error: message };
      await prisma.integrationError.create({ data: { provider: network, retailerId: p.retailerId, code: "product_ingest_failed", message } });
    }
  }
  return { status: "ok", message: `${programs.length} program(s)`, programs: out };
}

// ───────────────────────── conversions ─────────────────────────

export interface ConversionImportStats {
  fetched: number;
  created: number;
  updated: number;
  attributed: number;
  unattributed: number;
  reversedCashback: number;
}

const COMMISSION_STATUS = { pending: "pending", approved: "approved", reversed: "reversed" } as const;

/** Idempotent upsert of one network conversion (+ Commission). Cashback rules are unchanged: we only reverse pending cashback when the network reverses. */
export async function upsertConversion(prisma: PrismaClient, c: NetworkConversion, stats: ConversionImportStats): Promise<void> {
  const click = c.subId ? await prisma.affiliateClick.findUnique({ where: { subId: c.subId }, select: { id: true } }) : null;
  if (click) stats.attributed++;
  else stats.unattributed++;
  const program = await resolveProgram(prisma, c.network, c.advertiserId, c.advertiserName);
  const data = {
    programId: program?.id ?? null,
    clickId: click?.id ?? null,
    orderAmountCents: c.saleAmountCents,
    commissionCents: c.commissionCents,
    currency: c.currency,
    status: c.state,
    occurredAt: new Date(c.occurredAt),
    raw: JSON.parse(JSON.stringify(c.raw)) as Prisma.InputJsonValue,
  };
  const prev = await prisma.affiliateConversion.findUnique({ where: { network_externalId: { network: c.network, externalId: c.externalId } }, select: { id: true, status: true } });
  const saved = prev
    ? await prisma.affiliateConversion.update({ where: { id: prev.id }, data })
    : await prisma.affiliateConversion.create({ data: { ...data, network: c.network, externalId: c.externalId } });
  if (prev) stats.updated++;
  else stats.created++;
  await prisma.commission.upsert({
    where: { conversionId: saved.id },
    update: { amountCents: c.commissionCents, currency: c.currency, status: COMMISSION_STATUS[c.state], ...(c.state !== "pending" ? { reconciledAt: new Date() } : {}) },
    create: { conversionId: saved.id, amountCents: c.commissionCents, currency: c.currency, status: COMMISSION_STATUS[c.state], ...(c.state !== "pending" ? { reconciledAt: new Date() } : {}) },
  });
  if (c.state === "reversed" && prev?.status !== "reversed") {
    const r = await prisma.cashbackTransaction.updateMany({ where: { conversionId: saved.id, status: { in: ["pending", "confirmed"] } }, data: { status: "reversed", note: "network reversed the conversion" } });
    stats.reversedCashback += r.count;
  }
}

export async function importNetworkConversions(
  prisma: PrismaClient,
  network: NetworkId,
  env: EnvLike,
  days = 45,
  now = new Date(),
): Promise<{ status: "ok" | "pending_configuration" | "unsupported" | "error"; message: string; stats: ConversionImportStats }> {
  const stats: ConversionImportStats = { fetched: 0, created: 0, updated: 0, attributed: 0, unattributed: 0, reversedCashback: 0 };
  const c = client(network, env);
  const missing = c.missingEnv();
  if (missing.length) return { status: "pending_configuration", message: `Missing ${missing.join(", ")}`, stats };
  if (!c.capabilities.conversions) return { status: "unsupported", message: `${c.name}: no conversion report API`, stats };
  try {
    const lookback = Math.min(days, c.maxLookbackDays);
    for (const range of chunkRange({ since: new Date(now.getTime() - lookback * DAY_MS), until: now }, c.maxReportDays)) {
      const { items } = await collectPages((cur) => c.fetchConversions(range, cur), 50);
      stats.fetched += items.length;
      for (const conv of items) await upsertConversion(prisma, conv, stats);
    }
    return { status: "ok", message: `${stats.fetched} record(s) in the last ${lookback} days`, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.integrationError.create({ data: { provider: network, code: "conversion_import_failed", message } });
    return { status: "error", message, stats };
  }
}

/** Runs one network job and logs it to data_ingestion_jobs. */
export async function runNetworkJob(prisma: PrismaClient, job: NetworkIngestJob, env: EnvLike, enqueuePriceEvent: (j: PriceEventJob) => Promise<void>): Promise<Record<string, unknown>> {
  const run = await prisma.dataIngestionJob.create({ data: { kind: `network-${job.kind}:${job.network}`, status: "processing", startedAt: new Date() } });
  try {
    const result =
      job.kind === "coupons"
        ? await ingestNetworkCoupons(prisma, job.network, env)
        : job.kind === "products"
          ? await ingestNetworkProducts(prisma, job.network, env, enqueuePriceEvent)
          : await importNetworkConversions(prisma, job.network, env, job.days ?? 45);
    const failed = result.status === "error";
    await prisma.dataIngestionJob.update({
      where: { id: run.id },
      data: { status: failed ? "failed" : "completed", finishedAt: new Date(), stats: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue, ...(failed ? { error: result.message } : {}) },
    });
    return result as unknown as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.dataIngestionJob.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: message } });
    throw err;
  }
}

/** Per-network job schedules derived from the registry (0 = capability not available). */
export function networkSchedules(): { id: string; job: NetworkIngestJob; everyMs: number }[] {
  return NETWORK_REGISTRY.flatMap((n) =>
    (
      [
        ["coupons", n.schedule.couponsEveryMin],
        ["products", n.schedule.productsEveryMin],
        ["conversions", n.schedule.conversionsEveryMin],
      ] as const
    )
      .filter(([, every]) => every > 0)
      .map(([kind, every]) => ({ id: `network-${n.id}-${kind}`, job: { kind, network: n.id }, everyMs: every * 60_000 })),
  );
}
