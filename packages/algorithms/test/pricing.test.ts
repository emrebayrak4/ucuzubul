import { describe, expect, it } from "vitest";
import {
  computeDealScore,
  computePriceStats,
  dealTier,
  detectFakeDiscount,
  median,
  trailingMedianCents,
  type PricePoint,
} from "../src/index";

const NOW = new Date("2026-11-26T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("median", () => {
  it("odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // 2.5 rounded to whole cents
    expect(median([])).toBeNull();
  });
});

describe("computePriceStats", () => {
  const history: PricePoint[] = [
    { observedAt: daysAgo(200), priceCents: 12000 },
    { observedAt: daysAgo(100), priceCents: 11000 },
    { observedAt: daysAgo(60), priceCents: 10000 },
    { observedAt: daysAgo(20), priceCents: 10500 },
    { observedAt: daysAgo(5), priceCents: 9900 },
    { observedAt: daysAgo(1), priceCents: 9000 },
  ];

  it("computes current, previous, ATL, ATH", () => {
    const s = computePriceStats(history, { now: NOW });
    expect(s.currentCents).toBe(9000);
    expect(s.previousPriceCents).toBe(9900);
    expect(s.dropVsPreviousPct).toBe(9.09);
    expect(s.allTimeLowCents).toBe(9000);
    expect(s.allTimeHighCents).toBe(12000);
    expect(s.isAllTimeLow).toBe(true);
    expect(s.totalPoints).toBe(6);
  });

  it("computes windows only from real points", () => {
    const s = computePriceStats(history, { now: NOW });
    const w7 = s.windows["7d"];
    expect(w7.coverage.points).toBe(2);
    expect(w7.coverage.sparse).toBe(true);
    expect(w7.minCents).toBe(9000);
    expect(w7.maxCents).toBe(9900);
    expect(w7.avgCents).toBe(9450);
    expect(w7.medianCents).toBe(9450);
    const w90 = s.windows["90d"];
    expect(w90.coverage.points).toBe(4);
    expect(w90.medianCents).toBe(9950); // (9900 + 10000) / 2
    expect(w90.dropVsMedianPct).toBe(9.55);
    expect(w90.stddevCents).toBeGreaterThan(0);
    expect(w90.coefficientOfVariation).toBeGreaterThan(0);
    expect(s.windows.all.coverage.points).toBe(6);
    expect(s.windows["365d"].coverage.points).toBe(6);
    expect(s.windows["180d"].coverage.points).toBe(5);
  });

  it("reports coverage ratio as days with data / window days", () => {
    const s = computePriceStats(history, { now: NOW });
    expect(s.windows["30d"].coverage.daysWithData).toBe(3);
    expect(s.windows["30d"].coverage.ratio).toBe(0.1);
  });

  it("handles empty and invalid data", () => {
    const s = computePriceStats(
      [
        { observedAt: "not a date", priceCents: 100 },
        { observedAt: daysAgo(1), priceCents: 99.5 },
        { observedAt: daysAgo(1), priceCents: -5 },
        { observedAt: new Date(NOW.getTime() + 86_400_000), priceCents: 100 },
      ],
      { now: NOW },
    );
    expect(s.totalPoints).toBe(0);
    expect(s.invalidPointsDropped).toBe(4);
    expect(s.currentCents).toBeNull();
    expect(s.windows["30d"].medianCents).toBeNull();
    expect(s.windows["30d"].coverage.ratio).toBe(0);
  });

  it("single point / constant price has zero volatility and no previous price", () => {
    const s = computePriceStats([{ observedAt: daysAgo(2), priceCents: 5000 }, { observedAt: daysAgo(1), priceCents: 5000 }], { now: NOW });
    expect(s.previousPriceCents).toBeNull();
    expect(s.dropVsPreviousPct).toBeNull();
    expect(s.windows["7d"].stddevCents).toBe(0);
  });

  it("trailing median helper", () => {
    expect(trailingMedianCents(history, 30, NOW)).toBe(9900);
  });
});

describe("computeDealScore", () => {
  const full = {
    currentPriceCents: 8000,
    median90dCents: 10000,
    allTimeLowCents: 8000,
    otherStorePricesCents: [9500, 9900, 10500],
    retailerTrust: 0.9,
    lastCheckedAt: new Date(NOW.getTime() - 60 * 60_000 * 2),
    inStock: true,
    historyPoints: 40,
  };

  it("scores a strong deal with full data", () => {
    const r = computeDealScore(full, { now: NOW });
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.confidence).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.suppressed).toBe(false);
    expect(r.reasons).toContain("At its all-time low");
    expect(r.reasons.some((x) => x.startsWith("20% below its 90-day median"))).toBe(true);
    expect(r.reasons.some((x) => x.includes("Lowest of 4 stores"))).toBe(true);
  });

  it("returns a structured factor breakdown whose points sum to the score", () => {
    const r = computeDealScore(full, { now: NOW });
    expect(r.factors.map((f) => f.factor)).toEqual(["vsMedian90d", "nearAllTimeLow", "vsOtherStores", "retailerTrust", "freshness", "stock"]);
    const sum = r.factors.reduce((s, f) => s + f.points, 0);
    expect(Math.abs(sum - r.score)).toBeLessThanOrEqual(1);
    expect(r.factors.every((f) => f.message.length > 0)).toBe(true);
  });

  it("re-weights missing inputs and lowers confidence", () => {
    const r = computeDealScore({ currentPriceCents: 8000, median90dCents: 10000, allTimeLowCents: 8000 }, { now: NOW });
    expect(r.missing).toEqual(["vsOtherStores", "retailerTrust", "freshness", "stock"]);
    expect(r.confidence).toBe(0.55);
    expect(r.effectiveWeights.vsMedian90d).toBeCloseTo(0.55, 2);
    expect(r.score).toBeGreaterThan(0);
  });

  it("tiers", () => {
    expect(dealTier(95)).toBe("Exceptional");
    expect(dealTier(90)).toBe("Exceptional");
    expect(dealTier(75)).toBe("Great");
    expect(dealTier(60)).toBe("Good");
    expect(dealTier(40)).toBe("Average");
    expect(dealTier(39)).toBe("Poor");
  });

  it("suppresses invalid prices", () => {
    expect(computeDealScore({ currentPriceCents: 0 }).suppressionReason).toBe("invalid_price");
    expect(computeDealScore({ currentPriceCents: 12.5 }).suppressed).toBe(true);
  });

  it("suppresses suspicious >70% drops with low confidence", () => {
    const r = computeDealScore({ currentPriceCents: 2000, median90dCents: 10000, historyPoints: 3 }, { now: NOW });
    expect(r.suppressed).toBe(true);
    expect(r.suppressionReason).toBe("suspicious_price");
  });

  it("does not suppress an extreme drop with high confidence but warns", () => {
    const r = computeDealScore({ ...full, currentPriceCents: 2500, allTimeLowCents: 2500 }, { now: NOW });
    expect(r.suppressed).toBe(false);
    expect(r.reasons.some((x) => x.includes("verify"))).toBe(true);
  });

  it("suppresses when nothing but the price is known", () => {
    const r = computeDealScore({ currentPriceCents: 1000 });
    expect(r.suppressed).toBe(true);
    expect(r.suppressionReason).toBe("insufficient_data");
  });

  it("stale prices and out-of-stock reduce the score", () => {
    const fresh = computeDealScore(full, { now: NOW });
    const stale = computeDealScore({ ...full, lastCheckedAt: daysAgo(5), inStock: false }, { now: NOW });
    expect(stale.score).toBeLessThan(fresh.score);
    expect(stale.reasons).toContain("Currently out of stock");
  });

  it("has no sponsored input (type-level guarantee)", () => {
    // @ts-expect-error sponsored is not part of DealScoreInput
    const r = computeDealScore({ ...full, sponsored: true }, { now: NOW });
    expect(r.score).toBe(computeDealScore(full, { now: NOW }).score);
  });
});

describe("detectFakeDiscount", () => {
  const flat = (price: number, fromDay: number, toDay: number, step = 3): PricePoint[] => {
    const pts: PricePoint[] = [];
    for (let d = fromDay; d >= toDay; d -= step) pts.push({ observedAt: daysAgo(d), priceCents: price });
    return pts;
  };

  it("flags an inflated reference price with the neutral message", () => {
    const history = [...flat(10000, 120, 3), { observedAt: daysAgo(1), priceCents: 9200 }];
    const r = detectFakeDiscount({ currentPriceCents: 9200, claimedListPriceCents: 15333, history }, { now: NOW });
    expect(r.flag).toBe("inflated_reference");
    expect(r.claimedPct).toBe(40);
    expect(r.realPctVs90dMedian).toBe(8);
    expect(r.message).toContain("This product is advertised as 40% off, but its current price is only 8% below its 90-day median.");
    expect(r.referenceNeverObserved).toBe(true);
  });

  it("accepts a genuine discount", () => {
    const history = [...flat(10000, 120, 3), { observedAt: daysAgo(1), priceCents: 7000 }];
    const r = detectFakeDiscount({ currentPriceCents: 7000, claimedListPriceCents: 10000, history }, { now: NOW });
    expect(r.flag).toBe("genuine");
    expect(r.realPctVs90dMedian).toBe(30);
  });

  it("detects a price hike shortly before a sale", () => {
    const history = [
      ...flat(10000, 120, 31),
      ...flat(14000, 25, 4),
      { observedAt: daysAgo(2), priceCents: 9900 },
    ];
    const r = detectFakeDiscount({ currentPriceCents: 9900, claimedListPriceCents: 14000, history }, { now: NOW });
    expect(r.flag).toBe("pre_sale_price_hike");
    expect(r.message).toContain("raised shortly before the sale");
  });

  it("overstated when the list price was observed but the claim is still too big", () => {
    const history = [
      { observedAt: daysAgo(85), priceCents: 15000 },
      ...flat(10000, 80, 3),
      { observedAt: daysAgo(1), priceCents: 9500 },
    ];
    const r = detectFakeDiscount({ currentPriceCents: 9500, claimedListPriceCents: 15000, history }, { now: NOW });
    expect(r.flag).toBe("overstated");
  });

  it("insufficient data without history or medians", () => {
    const r = detectFakeDiscount({ currentPriceCents: 9000, claimedListPriceCents: 12000 }, { now: NOW });
    expect(r.flag).toBe("insufficient_data");
    expect(r.claimedPct).toBe(25);
  });

  it("works from precomputed medians without history", () => {
    const r = detectFakeDiscount({ currentPriceCents: 9000, claimedDiscountPct: 50, median90dCents: 9500 }, { now: NOW });
    expect(r.flag).toBe("overstated");
    expect(r.message).toBe("This product is advertised as 50% off, but its current price is only 5% below its 90-day median.");
  });

  it("no claim, mentions cheaper stores", () => {
    const r = detectFakeDiscount({ currentPriceCents: 9000, median90dCents: 9000, otherStorePricesCents: [8500, 9900] }, { now: NOW });
    expect(r.flag).toBe("no_claim");
    expect(r.cheaperElsewhereCount).toBe(1);
    expect(r.message).toContain("1 other store currently lists it for less.");
  });

  it("price above median is described neutrally", () => {
    const r = detectFakeDiscount({ currentPriceCents: 10500, claimedDiscountPct: 30, median90dCents: 10000 }, { now: NOW });
    expect(r.message).toContain("5% above its 90-day median");
  });
});
