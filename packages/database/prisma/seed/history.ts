import type { PricePattern } from "./products";

export type Rng = () => number;

const DAY_MS = 86_400_000;

export interface HistoryPoint {
  observedAt: Date;
  priceCents: number;
  inStock: boolean;
}

export const randInt = (rng: Rng, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) throw new Error("pick() on empty array");
  return v;
};

/** Round to retail price endings: $X.99 (or whole dollars for retailers like Apple), cents for cheap items. */
export function retailRound(cents: number, roundDollars: boolean): number {
  if (roundDollars) return Math.max(100, Math.round(cents / 100) * 100);
  if (cents < 2000) return Math.max(99, Math.round(cents / 10) * 10 - 1);
  return Math.max(99, Math.floor(cents / 100) * 100 + 99);
}

/**
 * Product-level price index per day (index 0 = oldest day, last = today). Piecewise constant, so prices
 * stay sticky like real retail pricing.
 */
export function productIndex(rng: Rng, days: number, pattern: PricePattern): number[] {
  const idx: number[] = new Array<number>(days + 1).fill(1);
  const setRange = (from: number, to: number, value: number) => {
    for (let d = Math.max(0, from); d <= Math.min(days, to); d++) idx[d] = value;
  };

  switch (pattern) {
    case "stable":
      break;
    case "sale": {
      const windows = randInt(rng, 1, 3);
      for (let i = 0; i < windows; i++) {
        const start = randInt(rng, 5, days - 10);
        setRange(start, start + randInt(rng, 3, 10), 0.8 + rng() * 0.1);
      }
      break;
    }
    case "recent_drop": {
      const windows = randInt(rng, 0, 2);
      for (let i = 0; i < windows; i++) {
        const start = randInt(rng, 5, days - 30);
        setRange(start, start + randInt(rng, 3, 7), 0.85 + rng() * 0.08);
      }
      setRange(days - randInt(rng, 1, 5), days, 0.76 + rng() * 0.12);
      break;
    }
    case "decline": {
      const steps = randInt(rng, 3, 6);
      const totalDrop = 0.12 + rng() * 0.15;
      for (let s = 1; s <= steps; s++) {
        const from = Math.floor((days * s) / (steps + 1));
        setRange(from, days, 1 - (totalDrop * s) / steps);
      }
      break;
    }
    case "hike_then_sale": {
      // Raise ~40–15 days ago, then "sale" back to roughly the pre-hike level.
      setRange(days - 40, days - 15, 1.18 + rng() * 0.07);
      setRange(days - 14, days, 0.97 + rng() * 0.04);
      break;
    }
  }
  return idx;
}

export interface OfferSeriesInput {
  rng: Rng;
  days: number;
  now: Date;
  baseCents: number;
  index: number[];
  roundDollars: boolean;
  /** Probability of a daily observation (gaps stay gaps — no interpolation). */
  observeProbability: number;
}

/**
 * Generates one offer's observation series. Each retailer follows the product index with a small lag
 * and its own sticky drift; observations are recorded on most days and always on change days and today.
 */
export function offerSeries(input: OfferSeriesInput): HistoryPoint[] {
  const { rng, days, now, baseCents, index, roundDollars, observeProbability } = input;
  const followsEvents = rng() < 0.8;
  const lag = randInt(rng, 0, 2);
  let drift = 1;
  let prev = -1;
  let inStock = true;
  const points: HistoryPoint[] = [];
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let d = 0; d <= days; d++) {
    if (rng() < 0.04) drift = Math.min(1.07, Math.max(0.93, drift + (rng() < 0.5 ? -1 : 1) * (0.01 + rng() * 0.02)));
    const i = followsEvents ? (index[Math.max(0, d - lag)] ?? 1) : 1;
    const price = retailRound(Math.round(baseCents * i * drift), roundDollars);
    if (rng() < 0.01) inStock = !inStock;
    if (d === days) inStock = inStock || rng() < 0.85;

    const changed = price !== prev;
    if (changed || d === days || rng() < observeProbability) {
      const hour = randInt(rng, 6, 22);
      const minute = randInt(rng, 0, 59);
      let ts = todayUtc - (days - d) * DAY_MS + hour * 3_600_000 + minute * 60_000;
      if (ts > now.getTime()) ts = now.getTime() - randInt(rng, 5, 90) * 60_000;
      points.push({ observedAt: new Date(ts), priceCents: price, inStock });
      prev = price;
    }
  }
  return points;
}

/** UPC-A check digit. */
export function upcCheckDigit(first11: string): number {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(first11[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** Demo UPC in GS1 restricted-circulation range (prefix "4") — never a real product's code. */
export function demoUpc(n: number): string {
  const body = "4" + String(n).padStart(10, "0").slice(-10);
  return body + String(upcCheckDigit(body));
}
