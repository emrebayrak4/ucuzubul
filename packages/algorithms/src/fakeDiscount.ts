/**
 * Fake / inflated discount detection.
 *
 * Compares the advertised discount against what the price history actually shows:
 * 30/90-day medians, all-time low, the claimed list ("was") price, other stores' prices,
 * and price hikes shortly before a "sale" started. Messages are neutral and factual.
 */
import { formatUsd, isValidCents } from "./money";
import { cleanPricePoints, median, type PricePoint } from "./priceStats";

export type DiscountFlag =
  | "genuine"
  | "overstated"
  | "inflated_reference"
  | "pre_sale_price_hike"
  | "no_claim"
  | "insufficient_data";

export interface FakeDiscountInput {
  currentPriceCents: number;
  /** Claimed list / "was" / compare-at price. */
  claimedListPriceCents?: number | null;
  /** Advertised discount percentage, if the retailer states one explicitly. */
  claimedDiscountPct?: number | null;
  /** Real price history for this offer (only observed points). */
  history?: readonly PricePoint[] | null;
  /** Pre-computed medians (used when history is not supplied). */
  median30dCents?: number | null;
  median90dCents?: number | null;
  allTimeLowCents?: number | null;
  otherStorePricesCents?: readonly number[] | null;
  /** When the sale price started; inferred from history when omitted. */
  saleStartedAt?: Date | string | null;
}

export interface FakeDiscountResult {
  flag: DiscountFlag;
  claimedPct: number | null;
  realPctVs90dMedian: number | null;
  realPctVs30dMedian: number | null;
  median90dCents: number | null;
  median30dCents: number | null;
  /** Highest price actually observed in the 90 days before the sale. */
  max90dBeforeSaleCents: number | null;
  /** True when the reference price was never observed in the history window. */
  referenceNeverObserved: boolean | null;
  /** Number of other stores currently selling for less. */
  cheaperElsewhereCount: number;
  message: string;
}

export interface FakeDiscountOptions {
  now?: Date;
  /** Claim is "genuine" when real >= claimed * ratio, or within `tolerancePct` points. Defaults 0.7 / 5. */
  genuineRatio?: number;
  tolerancePct?: number;
  /** Rise vs. baseline (before the run-up) to call a pre-sale hike. Default 0.1 (10%). */
  hikeThreshold?: number;
  /** Look-back window in days for a pre-sale hike. Default 30. */
  hikeWindowDays?: number;
}

const DAY_MS = 86_400_000;
const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function detectFakeDiscount(input: FakeDiscountInput, opts: FakeDiscountOptions = {}): FakeDiscountResult {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const genuineRatio = opts.genuineRatio ?? 0.7;
  const tolerance = opts.tolerancePct ?? 5;
  const hikeThreshold = opts.hikeThreshold ?? 0.1;
  const hikeWindowMs = (opts.hikeWindowDays ?? 30) * DAY_MS;
  const price = input.currentPriceCents;

  const others = (input.otherStorePricesCents ?? []).filter(isValidCents);
  const cheaperElsewhereCount = isValidCents(price) ? others.filter((o) => o < price).length : 0;

  const base: Omit<FakeDiscountResult, "flag" | "message"> = {
    claimedPct: null,
    realPctVs90dMedian: null,
    realPctVs30dMedian: null,
    median90dCents: null,
    median30dCents: null,
    max90dBeforeSaleCents: null,
    referenceNeverObserved: null,
    cheaperElsewhereCount,
  };

  if (!isValidCents(price)) {
    return { ...base, flag: "insufficient_data", message: "The current price is unavailable, so the discount cannot be checked." };
  }

  // Claimed percentage
  const list = isValidCents(input.claimedListPriceCents) ? input.claimedListPriceCents : null;
  let claimedPct: number | null = null;
  if (typeof input.claimedDiscountPct === "number" && input.claimedDiscountPct > 0) claimedPct = input.claimedDiscountPct;
  else if (list !== null && list > price) claimedPct = ((list - price) / list) * 100;
  base.claimedPct = claimedPct === null ? null : r2(claimedPct);

  // History-derived references
  const { points } = cleanPricePoints(input.history ?? [], now);
  let saleStart: number | null = null;
  if (input.saleStartedAt) {
    const t = input.saleStartedAt instanceof Date ? input.saleStartedAt.getTime() : Date.parse(input.saleStartedAt);
    if (Number.isFinite(t)) saleStart = t;
  }
  if (saleStart === null && points.length > 0) {
    // Start of the trailing run of points at (or below) the current price.
    let i = points.length - 1;
    while (i > 0 && (points[i - 1] as { price: number }).price <= price) i--;
    saleStart = (points[i] as { t: number }).t;
  }

  const medianOver = (days: number): number | null => {
    if (points.length === 0) return null;
    // Medians are computed over the period BEFORE the sale started so that a long sale does not
    // drag the reference down to the sale price itself.
    const end = saleStart ?? nowMs;
    const from = end - days * DAY_MS;
    const vals = points.filter((p) => p.t >= from && p.t < end).map((p) => p.price);
    return median(vals.length > 0 ? vals : points.filter((p) => p.t >= nowMs - days * DAY_MS).map((p) => p.price));
  };
  const med90 = medianOver(90) ?? (isValidCents(input.median90dCents) ? input.median90dCents : null);
  const med30 = medianOver(30) ?? (isValidCents(input.median30dCents) ? input.median30dCents : null);
  base.median90dCents = med90;
  base.median30dCents = med30;
  if (med90 !== null) base.realPctVs90dMedian = r2(((med90 - price) / med90) * 100);
  if (med30 !== null) base.realPctVs30dMedian = r2(((med30 - price) / med30) * 100);

  let hike = false;
  if (points.length > 0 && saleStart !== null) {
    const before = points.filter((p) => p.t < saleStart && p.t >= saleStart - 90 * DAY_MS);
    if (before.length > 0) {
      base.max90dBeforeSaleCents = Math.max(...before.map((p) => p.price));
      if (list !== null) base.referenceNeverObserved = !before.some((p) => p.price >= list * 0.98);
      const recent = before.filter((p) => p.t >= saleStart - hikeWindowMs);
      const baseline = before.filter((p) => p.t < saleStart - hikeWindowMs);
      const baselineMedian = median(baseline.map((p) => p.price));
      if (recent.length > 0 && baselineMedian !== null) {
        const recentMax = Math.max(...recent.map((p) => p.price));
        hike = recentMax >= baselineMedian * (1 + hikeThreshold) && price >= baselineMedian * 0.95;
      }
    }
  }

  const tail = cheaperElsewhereCount > 0
    ? ` ${cheaperElsewhereCount} other store${cheaperElsewhereCount === 1 ? " currently lists" : "s currently list"} it for less.`
    : "";

  if (claimedPct === null) {
    const msg = med90 !== null
      ? `No discount is advertised. The current price is ${describeVsMedian(base.realPctVs90dMedian as number)}.${tail}`
      : `No discount is advertised.${tail}`;
    return { ...base, flag: "no_claim", message: msg };
  }

  const claimedR = r0(claimedPct);
  if (med90 === null || (input.history && points.length < 3)) {
    return {
      ...base,
      flag: "insufficient_data",
      message: `This product is advertised as ${claimedR}% off. There is not enough price history yet to verify the discount.${tail}`,
    };
  }
  const real = base.realPctVs90dMedian as number;

  if (hike) {
    return {
      ...base,
      flag: "pre_sale_price_hike",
      message: `This product is advertised as ${claimedR}% off, but its price was raised shortly before the sale; the current price is ${describeVsMedian(real)}.${tail}`,
    };
  }
  const genuine = real >= claimedPct * genuineRatio || claimedPct - real <= tolerance;
  if (genuine) {
    return {
      ...base,
      flag: "genuine",
      message: `This product is advertised as ${claimedR}% off, and its current price is ${describeVsMedian(real)}.${tail}`,
    };
  }
  const flag: DiscountFlag = base.referenceNeverObserved === true || (list !== null && base.max90dBeforeSaleCents !== null && list > base.max90dBeforeSaleCents * 1.05)
    ? "inflated_reference"
    : "overstated";
  const refNote = flag === "inflated_reference" && list !== null
    ? ` The reference price of ${formatUsd(list)} was not observed in the last 90 days.`
    : "";
  return {
    ...base,
    flag,
    message: `This product is advertised as ${claimedR}% off, but its current price is ${real > 0 ? "only " : ""}${describeVsMedian(real)}.${refNote}${tail}`,
  };
}

function describeVsMedian(realPct: number): string {
  const p = Math.round(Math.abs(realPct));
  if (p === 0) return "about the same as its 90-day median";
  return realPct > 0 ? `${p}% below its 90-day median` : `${p}% above its 90-day median`;
}
