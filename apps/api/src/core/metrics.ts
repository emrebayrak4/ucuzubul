/**
 * Product price metrics (stats, Deal Score, fake-discount check, recent drops) computed from REAL
 * observations only. Framework-free so both the API and the worker can use it.
 *
 * Scale note: this computes from raw history in-process. At production volume the worker should persist
 * these results into a product_metrics table on each price change; the API would then read that table.
 */
import {
  DEAL_WEIGHTS,
  computeDealScore,
  computePriceStats,
  detectFakeDiscount,
  type DealComponent,
  type PricePoint,
} from "@pricora/algorithms";
import type { DealScore, FakeDiscount, PriceStats } from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";

const DAY_MS = 86_400_000;

export interface RecentDrop {
  offerId: string;
  retailerId: string;
  previousPriceCents: number;
  currentPriceCents: number;
  dropCents: number;
  dropRatio: number;
  droppedAt: Date;
  source: string;
}

export interface ProductMetrics {
  productId: string;
  lowestOfferId: string | null;
  lowestPriceCents: number | null;
  /** Lowest price + known shipping (tax excluded). */
  lowestTotalCents: number | null;
  storeCount: number;
  inStock: boolean;
  retailerIds: string[];
  freeShipping: boolean;
  pickup: boolean;
  hasDemoData: boolean;
  stats: PriceStats;
  /** Ratio below the 30-day median of the daily lowest price (0.12 = 12% below). null when sparse. */
  dropRatio: number | null;
  dealScore: DealScore | null;
  fakeDiscount: FakeDiscount;
  recentDrop: RecentDrop | null;
  /** Daily lowest-price series (real points only). */
  lowestSeries: { t: Date; priceCents: number }[];
  lastCheckedAt: Date | null;
}

const FACTOR: Record<DealComponent, DealScore["reasons"][number]["factor"]> = {
  vsMedian90d: "vs_median_90d",
  nearAllTimeLow: "near_all_time_low",
  vsOtherStores: "vs_other_stores",
  retailerTrust: "retailer_trust",
  freshness: "freshness",
  stock: "stock",
};

const FLAGGED = new Set(["overstated", "inflated_reference", "pre_sale_price_hike"]);

export const EMPTY_FAKE_DISCOUNT: FakeDiscount = {
  flag: false,
  message: null,
  advertisedDiscountRatio: null,
  actualVsMedian90Ratio: null,
};

function iso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

export function emptyStats(): PriceStats {
  return {
    currentLowestCents: null,
    allTimeLowCents: null,
    allTimeLowAt: null,
    allTimeHighCents: null,
    avg30Cents: null,
    median30Cents: null,
    avg90Cents: null,
    median90Cents: null,
    min90Cents: null,
    max90Cents: null,
    volatility90: null,
    change30Ratio: null,
    sampleSize: 0,
    firstObservedAt: null,
  };
}

/** Daily lowest price across offers, keeping the actual observation timestamp of the minimum. */
export function dailyLowest(points: { t: Date; priceCents: number }[]): { t: Date; priceCents: number }[] {
  const byDay = new Map<number, { t: Date; priceCents: number }>();
  for (const p of points) {
    const day = Math.floor(p.t.getTime() / DAY_MS);
    const cur = byDay.get(day);
    if (!cur || p.priceCents < cur.priceCents) byDay.set(day, p);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Converts a lowest-price series into the contract PriceStats. */
export function statsFromSeries(
  series: { t: Date; priceCents: number }[],
  currentLowestCents: number | null,
  rawSampleSize: number,
  firstObservedAt: Date | null,
  now: Date,
): PriceStats {
  if (series.length === 0) return { ...emptyStats(), currentLowestCents };
  const s = computePriceStats(
    series.map((p) => ({ observedAt: p.t, priceCents: p.priceCents })),
    { now },
  );
  const w30 = s.windows["30d"];
  const w90 = s.windows["90d"];
  const since30 = now.getTime() - 30 * DAY_MS;
  const first30 = series.find((p) => p.t.getTime() >= since30);
  const current = currentLowestCents ?? s.currentCents;
  return {
    currentLowestCents: current,
    allTimeLowCents: s.allTimeLowCents,
    allTimeLowAt: iso(s.allTimeLowAt),
    allTimeHighCents: s.allTimeHighCents,
    avg30Cents: w30.avgCents,
    median30Cents: w30.medianCents,
    avg90Cents: w90.avgCents,
    median90Cents: w90.medianCents,
    min90Cents: w90.minCents,
    max90Cents: w90.maxCents,
    volatility90: w90.coefficientOfVariation,
    change30Ratio: first30 && current !== null && first30.priceCents > 0 ? round4((current - first30.priceCents) / first30.priceCents) : null,
    sampleSize: rawSampleSize,
    firstObservedAt: iso(firstObservedAt),
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

interface OfferRow {
  id: string;
  productId: string;
  retailerId: string;
  priceCents: number;
  listPriceCents: number | null;
  shippingCents: number | null;
  pickupAvailable: boolean;
  stock: string;
  source: string;
  lastCheckedAt: Date;
  retailer: { trustScore: number | null };
}

export function computeMetricsForProduct(
  productId: string,
  offers: OfferRow[],
  history: Map<string, { t: Date; priceCents: number; inStock: boolean }[]>,
  now: Date,
): ProductMetrics {
  const inStockOffers = offers.filter((o) => o.stock !== "out_of_stock");
  const pool = inStockOffers.length > 0 ? inStockOffers : offers;
  const lowest = pool.reduce<OfferRow | null>((m, o) => (m === null || o.priceCents < m.priceCents ? o : m), null);
  const lowestTotal = pool.reduce<number | null>((m, o) => {
    const t = o.priceCents + (o.shippingCents ?? 0);
    return m === null || t < m ? t : m;
  }, null);

  const allPoints: { t: Date; priceCents: number }[] = [];
  let firstObserved: Date | null = null;
  for (const o of offers) {
    for (const p of history.get(o.id) ?? []) {
      allPoints.push(p);
      if (!firstObserved || p.t < firstObserved) firstObserved = p.t;
    }
  }
  const series = dailyLowest(allPoints);
  const stats = statsFromSeries(series, lowest?.priceCents ?? null, allPoints.length, firstObserved, now);
  const dropRatio =
    stats.median30Cents && stats.currentLowestCents !== null && series.length >= 3
      ? round4((stats.median30Cents - stats.currentLowestCents) / stats.median30Cents)
      : null;

  let dealScore: DealScore | null = null;
  let fakeDiscount: FakeDiscount = EMPTY_FAKE_DISCOUNT;
  if (lowest) {
    const others = offers.filter((o) => o.id !== lowest.id).map((o) => o.priceCents);
    const since90 = now.getTime() - 90 * DAY_MS;
    const ds = computeDealScore(
      {
        currentPriceCents: lowest.priceCents,
        median90dCents: stats.median90Cents,
        allTimeLowCents: stats.allTimeLowCents,
        otherStorePricesCents: others,
        retailerTrust: lowest.retailer.trustScore === null ? null : lowest.retailer.trustScore / 100,
        lastCheckedAt: lowest.lastCheckedAt,
        inStock: lowest.stock !== "out_of_stock",
        historyPoints: series.filter((p) => p.t.getTime() >= since90).length,
      },
      { now },
    );
    if (!ds.suppressed) {
      const reasons: DealScore["reasons"] = ds.factors.map((f) => ({
        factor: FACTOR[f.factor],
        points: Math.round(f.points * 10) / 10,
        weight: Math.round(DEAL_WEIGHTS[f.factor] * 100),
        message: f.message,
      }));
      dealScore = {
        score: Math.max(0, Math.min(100, Math.round(ds.score))),
        tier: ds.tier.toLowerCase() as DealScore["tier"],
        confidence: Math.max(0, Math.min(1, ds.confidence)),
        reasons,
      };
    }

    const lowestHistory: PricePoint[] = (history.get(lowest.id) ?? []).map((p) => ({
      observedAt: p.t,
      priceCents: p.priceCents,
      inStock: p.inStock,
    }));
    const fd = detectFakeDiscount(
      {
        currentPriceCents: lowest.priceCents,
        claimedListPriceCents: lowest.listPriceCents,
        history: lowestHistory,
        otherStorePricesCents: others,
      },
      { now },
    );
    fakeDiscount = {
      flag: FLAGGED.has(fd.flag),
      message: fd.flag === "no_claim" || fd.flag === "insufficient_data" ? null : fd.message,
      advertisedDiscountRatio: fd.claimedPct === null ? null : round4(fd.claimedPct / 100),
      actualVsMedian90Ratio: fd.realPctVs90dMedian === null ? null : round4(fd.realPctVs90dMedian / 100),
    };
  }

  let recentDrop: RecentDrop | null = null;
  for (const o of offers) {
    const pts = history.get(o.id) ?? [];
    const last = pts[pts.length - 1];
    if (!last) continue;
    let i = pts.length - 2;
    while (i >= 0 && pts[i]?.priceCents === last.priceCents) i--;
    const prev = i >= 0 ? pts[i] : undefined;
    const firstAtCurrent = pts[i + 1];
    if (!prev || !firstAtCurrent || prev.priceCents <= last.priceCents) continue;
    const dropRatioOffer = (prev.priceCents - last.priceCents) / prev.priceCents;
    if (!recentDrop || dropRatioOffer > recentDrop.dropRatio) {
      recentDrop = {
        offerId: o.id,
        retailerId: o.retailerId,
        previousPriceCents: prev.priceCents,
        currentPriceCents: last.priceCents,
        dropCents: prev.priceCents - last.priceCents,
        dropRatio: round4(dropRatioOffer),
        droppedAt: firstAtCurrent.t,
        source: o.source,
      };
    }
  }

  return {
    productId,
    lowestOfferId: lowest?.id ?? null,
    lowestPriceCents: lowest?.priceCents ?? null,
    lowestTotalCents: lowestTotal,
    storeCount: new Set(offers.map((o) => o.retailerId)).size,
    inStock: inStockOffers.length > 0,
    retailerIds: [...new Set(offers.map((o) => o.retailerId))],
    freeShipping: offers.some((o) => o.shippingCents === 0),
    pickup: offers.some((o) => o.pickupAvailable),
    hasDemoData: offers.some((o) => o.source === "demo"),
    stats,
    dropRatio,
    dealScore,
    fakeDiscount,
    recentDrop,
    lowestSeries: series,
    lastCheckedAt: offers.reduce<Date | null>((m, o) => (m === null || o.lastCheckedAt > m ? o.lastCheckedAt : m), null),
  };
}

/** Computes metrics for the given products (or all active products) from the database. */
export async function computeProductMetrics(
  prisma: PrismaClient,
  productIds?: string[],
  now: Date = new Date(),
): Promise<Map<string, ProductMetrics>> {
  const offers = await prisma.offer.findMany({
    where: { isActive: true, product: { status: "active" }, ...(productIds ? { productId: { in: productIds } } : {}) },
    select: {
      id: true,
      productId: true,
      retailerId: true,
      priceCents: true,
      listPriceCents: true,
      shippingCents: true,
      pickupAvailable: true,
      stock: true,
      source: true,
      lastCheckedAt: true,
      retailer: { select: { trustScore: true } },
    },
  });
  const offerIds = offers.map((o) => o.id);
  const history = new Map<string, { t: Date; priceCents: number; inStock: boolean }[]>();
  const CHUNK = 2000;
  for (let i = 0; i < offerIds.length; i += CHUNK) {
    const rows = await prisma.priceHistory.findMany({
      where: { offerId: { in: offerIds.slice(i, i + CHUNK) } },
      select: { offerId: true, observedAt: true, priceCents: true, stock: true },
      orderBy: { observedAt: "asc" },
    });
    for (const r of rows) {
      let arr = history.get(r.offerId);
      if (!arr) history.set(r.offerId, (arr = []));
      arr.push({ t: r.observedAt, priceCents: r.priceCents, inStock: r.stock !== "out_of_stock" });
    }
  }
  const byProduct = new Map<string, OfferRow[]>();
  for (const o of offers) {
    let arr = byProduct.get(o.productId);
    if (!arr) byProduct.set(o.productId, (arr = []));
    arr.push(o);
  }
  const out = new Map<string, ProductMetrics>();
  for (const [pid, list] of byProduct) out.set(pid, computeMetricsForProduct(pid, list, history, now));
  return out;
}
