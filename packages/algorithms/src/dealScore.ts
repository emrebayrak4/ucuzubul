/**
 * Deal Score 0–100.
 *
 * Weights: 30% vs 90-day median · 25% proximity to all-time low · 20% vs other stores ·
 * 10% retailer trust · 10% freshness · 5% stock.
 * Missing inputs are dropped and the remaining weights re-normalized; confidence (0..1)
 * drops accordingly. There is deliberately NO sponsored/paid input: placements can never
 * influence the score.
 */
import { clamp01, formatUsd, isValidCents } from "./money";
import { median } from "./priceStats";

export type DealTier = "Exceptional" | "Great" | "Good" | "Average" | "Poor";
export type DealComponent = "vsMedian90d" | "nearAllTimeLow" | "vsOtherStores" | "retailerTrust" | "freshness" | "stock";

export const DEAL_WEIGHTS: Readonly<Record<DealComponent, number>> = {
  vsMedian90d: 0.3,
  nearAllTimeLow: 0.25,
  vsOtherStores: 0.2,
  retailerTrust: 0.1,
  freshness: 0.1,
  stock: 0.05,
};

export interface DealScoreInput {
  /** Current price (or total) in cents for the offer being scored. */
  currentPriceCents: number;
  median90dCents?: number | null;
  allTimeLowCents?: number | null;
  /** Comparable prices (same basis as currentPriceCents) at OTHER stores. */
  otherStorePricesCents?: readonly number[] | null;
  /** Retailer trust 0..1 (from internal data-quality metrics, never from payments). */
  retailerTrust?: number | null;
  lastCheckedAt?: Date | string | null;
  inStock?: boolean | null;
  /** Number of real history points behind median/ATL; lowers confidence when small. */
  historyPoints?: number | null;
}

export interface DealScoreOptions {
  now?: Date;
  /** Below this confidence the score is suppressed. Default 0.35. */
  minConfidence?: number;
  /** Fraction below a reference price considered suspicious. Default 0.7 (i.e. >70% below). */
  suspiciousDropFraction?: number;
  /** Confidence under which a suspicious price is suppressed. Default 0.75. */
  suspiciousConfidence?: number;
}

export interface DealFactor {
  factor: DealComponent;
  /** Effective (re-normalized) weight 0..1. */
  weight: number;
  /** Component sub-score 0..1. */
  subScore: number;
  /** Contribution to the 0–100 score. */
  points: number;
  message: string;
}

export interface DealScoreResult {
  score: number;
  tier: DealTier;
  confidence: number;
  /** Sub-scores 0..1 for each component that had data. */
  components: Partial<Record<DealComponent, number>>;
  /** Effective (re-normalized) weights actually used. */
  effectiveWeights: Partial<Record<DealComponent, number>>;
  /** Structured per-factor breakdown (points sum to ~score). */
  factors: DealFactor[];
  missing: DealComponent[];
  reasons: string[];
  /** When true the deal must not be auto-published (e.g. badge, deals page, push). */
  suppressed: boolean;
  suppressionReason: "invalid_price" | "suspicious_price" | "low_confidence" | "insufficient_data" | null;
}

export function dealTier(score: number): DealTier {
  if (score >= 90) return "Exceptional";
  if (score >= 75) return "Great";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Poor";
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const HOUR_MS = 3_600_000;

export function computeDealScore(input: DealScoreInput, opts: DealScoreOptions = {}): DealScoreResult {
  const now = opts.now ?? new Date();
  const minConfidence = opts.minConfidence ?? 0.35;
  const suspiciousFraction = opts.suspiciousDropFraction ?? 0.7;
  const suspiciousConfidence = opts.suspiciousConfidence ?? 0.75;
  const price = input.currentPriceCents;

  if (!isValidCents(price)) {
    return {
      score: 0, tier: "Poor", confidence: 0, components: {}, effectiveWeights: {}, factors: [],
      missing: Object.keys(DEAL_WEIGHTS) as DealComponent[],
      reasons: ["Price is missing or invalid"], suppressed: true, suppressionReason: "invalid_price",
    };
  }

  const components: Partial<Record<DealComponent, number>> = {};
  const reasons: string[] = [];
  const messages: Partial<Record<DealComponent, string>> = {};
  const note = (c: DealComponent, text: string) => {
    reasons.push(text);
    messages[c] ??= text;
  };

  // 1. vs 90-day median: -10% (above) -> 0, +30% below -> 1
  const med = isValidCents(input.median90dCents) ? input.median90dCents : null;
  if (med !== null) {
    const below = (med - price) / med;
    components.vsMedian90d = clamp01((below + 0.1) / 0.4);
    const p = Math.round(Math.abs(below) * 100);
    if (p === 0) note("vsMedian90d", `In line with its 90-day median (${formatUsd(med)})`);
    else if (below > 0) note("vsMedian90d", `${p}% below its 90-day median (${formatUsd(med)})`);
    else note("vsMedian90d", `${p}% above its 90-day median (${formatUsd(med)})`);
  }

  // 2. proximity to all-time low: at/below ATL -> 1, 30%+ above -> 0
  const atl = isValidCents(input.allTimeLowCents) ? input.allTimeLowCents : null;
  if (atl !== null) {
    const above = (price - atl) / atl;
    components.nearAllTimeLow = above <= 0 ? 1 : clamp01(1 - above / 0.3);
    if (above <= 0) note("nearAllTimeLow", "At its all-time low");
    else if (above <= 0.05) note("nearAllTimeLow", `Within ${Math.max(1, Math.round(above * 100))}% of its all-time low (${formatUsd(atl)})`);
    else note("nearAllTimeLow", `${Math.round(above * 100)}% above its all-time low (${formatUsd(atl)})`);
  }

  // 3. vs other stores: 20% cheaper than their median -> 1, 20% pricier -> 0; cheapest -> >= 0.7
  const others = (input.otherStorePricesCents ?? []).filter(isValidCents);
  let otherMedian: number | null = null;
  if (others.length > 0) {
    otherMedian = median(others) as number;
    const cheapestOther = Math.min(...others);
    let s = clamp01(0.5 + ((otherMedian - price) / otherMedian) * 2.5);
    if (price <= cheapestOther) {
      s = Math.max(s, 0.7);
      const diff = cheapestOther - price;
      note("vsOtherStores", 
        diff > 0
          ? `Lowest of ${others.length + 1} stores, ${formatUsd(diff)} less than the next cheapest`
          : `Tied for lowest price across ${others.length + 1} stores`,
      );
    } else {
      const cheaperCount = others.filter((o) => o < price).length;
      note("vsOtherStores", `${cheaperCount} other store${cheaperCount === 1 ? " has" : "s have"} a lower price`);
    }
    components.vsOtherStores = s;
  }

  // 4. retailer trust
  if (typeof input.retailerTrust === "number" && Number.isFinite(input.retailerTrust)) {
    components.retailerTrust = clamp01(input.retailerTrust);
    if (input.retailerTrust < 0.5) note("retailerTrust", "Retailer has a lower data-reliability rating");
    else messages.retailerTrust = `Retailer data-reliability rating ${Math.round(input.retailerTrust * 100)}/100`;
  }

  // 5. freshness: <= 6h -> 1, linear to 0 at 72h
  if (input.lastCheckedAt) {
    const t = input.lastCheckedAt instanceof Date ? input.lastCheckedAt.getTime() : Date.parse(input.lastCheckedAt);
    if (Number.isFinite(t)) {
      const ageH = Math.max(0, (now.getTime() - t) / HOUR_MS);
      components.freshness = ageH <= 6 ? 1 : clamp01(1 - (ageH - 6) / 66);
      if (ageH < 1) note("freshness", "Price checked within the last hour");
      else if (ageH < 48) note("freshness", `Price checked ${Math.round(ageH)} hour${Math.round(ageH) === 1 ? "" : "s"} ago`);
      else note("freshness", `Price last checked ${Math.round(ageH / 24)} days ago — may have changed`);
    }
  }

  // 6. stock
  if (typeof input.inStock === "boolean") {
    components.stock = input.inStock ? 1 : 0;
    note("stock", input.inStock ? "In stock" : "Currently out of stock");
  }

  const present = (Object.keys(components) as DealComponent[]);
  const missing = (Object.keys(DEAL_WEIGHTS) as DealComponent[]).filter((k) => !(k in components));
  const presentWeight = present.reduce((s, k) => s + DEAL_WEIGHTS[k], 0);

  if (presentWeight === 0) {
    return {
      score: 0, tier: "Poor", confidence: 0, components, effectiveWeights: {}, factors: [], missing,
      reasons: ["Not enough data to score this deal"], suppressed: true, suppressionReason: "insufficient_data",
    };
  }

  const effectiveWeights: Partial<Record<DealComponent, number>> = {};
  let raw = 0;
  for (const k of present) {
    const w = DEAL_WEIGHTS[k] / presentWeight;
    effectiveWeights[k] = round2(w);
    raw += w * (components[k] as number);
  }
  const score = Math.round(raw * 100);
  const factors: DealFactor[] = present.map((k) => ({
    factor: k,
    weight: effectiveWeights[k] as number,
    subScore: Math.round((components[k] as number) * 1000) / 1000,
    points: Math.round(((DEAL_WEIGHTS[k] / presentWeight) * (components[k] as number) * 100) * 10) / 10,
    message: messages[k] ?? "",
  }));

  let historyFactor = 1;
  if (typeof input.historyPoints === "number") {
    historyFactor = Math.max(0.4, Math.min(1, input.historyPoints / 10));
    if (input.historyPoints < 10) reasons.push(`Limited price history (${input.historyPoints} data point${input.historyPoints === 1 ? "" : "s"})`);
  }
  const confidence = round2(presentWeight * historyFactor);
  if (missing.length > 0) reasons.push(`Scored on ${present.length} of 6 factors`);

  // Suppression rules
  const refs = [med, others.length >= 2 ? otherMedian : null].filter((r): r is number => r !== null);
  const extremeDrop = refs.some((r) => price < r * (1 - suspiciousFraction));
  let suppressed = false;
  let suppressionReason: DealScoreResult["suppressionReason"] = null;
  if (extremeDrop && confidence < suspiciousConfidence) {
    suppressed = true;
    suppressionReason = "suspicious_price";
    reasons.push(`Price is more than ${Math.round(suspiciousFraction * 100)}% below typical prices — held for verification`);
  } else if (extremeDrop) {
    reasons.push("Unusually low price — verify at the store before buying");
  }
  if (!suppressed && confidence < minConfidence) {
    suppressed = true;
    suppressionReason = "low_confidence";
  }

  return { score, tier: dealTier(score), confidence, components, effectiveWeights, factors, missing, reasons, suppressed, suppressionReason };
}
