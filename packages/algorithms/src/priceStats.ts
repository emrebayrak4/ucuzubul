/**
 * Price statistics from REAL observation points only (no interpolation, no forward-fill).
 * Money is integer cents. Percentages are plain numbers rounded to 2 decimals.
 */

export interface PricePoint {
  observedAt: Date | string | number;
  priceCents: number;
  inStock?: boolean | null;
}

export type StatsWindow = "7d" | "30d" | "90d" | "180d" | "365d" | "all";
export const STATS_WINDOWS: readonly StatsWindow[] = ["7d", "30d", "90d", "180d", "365d", "all"];
const WINDOW_DAYS: Record<Exclude<StatsWindow, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365 };

const DAY_MS = 86_400_000;

export interface WindowCoverage {
  /** Number of real observations inside the window. */
  points: number;
  /** Distinct UTC calendar days with at least one observation. */
  daysWithData: number;
  /** Length of the window in days (for "all": span from first point to now, min 1). */
  windowDays: number;
  /** daysWithData / windowDays, 0..1 (rounded to 4 decimals). */
  ratio: number;
  /** True when there are fewer points than `minPoints` (default 3). */
  sparse: boolean;
}

export interface WindowStats {
  window: StatsWindow;
  coverage: WindowCoverage;
  /** All numeric fields are null when the window has no points. */
  minCents: number | null;
  minAt: string | null;
  maxCents: number | null;
  maxAt: string | null;
  avgCents: number | null;
  medianCents: number | null;
  /** Population standard deviation, rounded to whole cents. */
  stddevCents: number | null;
  /** Coefficient of variation (stddev / mean), 4 decimals. */
  coefficientOfVariation: number | null;
  /** (median - current) / median * 100. Positive = current is below the median. */
  dropVsMedianPct: number | null;
  firstAt: string | null;
  lastAt: string | null;
}

export interface PriceStats {
  currentCents: number | null;
  currentAt: string | null;
  /** Most recent observed price that differs from the current price. */
  previousPriceCents: number | null;
  previousPriceAt: string | null;
  /** (previous - current) / previous * 100. Positive = price dropped. */
  dropVsPreviousPct: number | null;
  allTimeLowCents: number | null;
  allTimeLowAt: string | null;
  allTimeHighCents: number | null;
  allTimeHighAt: string | null;
  /** True when the current price equals (or is below) the all-time low. */
  isAllTimeLow: boolean;
  windows: Record<StatsWindow, WindowStats>;
  totalPoints: number;
  /** Points ignored because of invalid timestamp/price, or because they are in the future. */
  invalidPointsDropped: number;
}

export interface PriceStatsOptions {
  now?: Date;
  /** Below this many points a window is flagged sparse. Default 3. */
  minPoints?: number;
}

interface CleanPoint {
  t: number;
  price: number;
}

const pct = (n: number) => Math.round(n * 100) / 100;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : Math.round(((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

function toTime(v: Date | string | number): number {
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
}

function iso(t: number): string {
  return new Date(t).toISOString();
}

export function cleanPricePoints(points: readonly PricePoint[], now: Date = new Date()): { points: CleanPoint[]; dropped: number } {
  const nowMs = now.getTime();
  const clean: CleanPoint[] = [];
  let dropped = 0;
  for (const p of points) {
    const t = toTime(p.observedAt);
    if (!Number.isFinite(t) || t > nowMs || !Number.isInteger(p.priceCents) || p.priceCents <= 0) {
      dropped++;
      continue;
    }
    clean.push({ t, price: p.priceCents });
  }
  clean.sort((a, b) => a.t - b.t);
  return { points: clean, dropped };
}

function windowStats(window: StatsWindow, pts: CleanPoint[], nowMs: number, current: number | null, minPoints: number): WindowStats {
  const firstAll = pts[0]?.t ?? nowMs;
  const windowDays = window === "all" ? Math.max(1, Math.ceil((nowMs - firstAll) / DAY_MS)) : WINDOW_DAYS[window];
  const from = window === "all" ? -Infinity : nowMs - windowDays * DAY_MS;
  const inWin = pts.filter((p) => p.t >= from && p.t <= nowMs);
  const days = new Set(inWin.map((p) => Math.floor(p.t / DAY_MS)));
  const coverage: WindowCoverage = {
    points: inWin.length,
    daysWithData: days.size,
    windowDays,
    ratio: Math.round(Math.min(1, days.size / windowDays) * 10000) / 10000,
    sparse: inWin.length < minPoints,
  };
  if (inWin.length === 0) {
    return {
      window, coverage, minCents: null, minAt: null, maxCents: null, maxAt: null, avgCents: null, medianCents: null,
      stddevCents: null, coefficientOfVariation: null, dropVsMedianPct: null, firstAt: null, lastAt: null,
    };
  }
  let min = inWin[0] as CleanPoint;
  let max = inWin[0] as CleanPoint;
  let sum = 0;
  for (const p of inWin) {
    if (p.price < min.price) min = p;
    if (p.price > max.price) max = p;
    sum += p.price;
  }
  const mean = sum / inWin.length;
  const variance = inWin.reduce((s, p) => s + (p.price - mean) ** 2, 0) / inWin.length;
  const sd = Math.sqrt(variance);
  const med = median(inWin.map((p) => p.price)) as number;
  return {
    window,
    coverage,
    minCents: min.price,
    minAt: iso(min.t),
    maxCents: max.price,
    maxAt: iso(max.t),
    avgCents: Math.round(mean),
    medianCents: med,
    stddevCents: Math.round(sd),
    coefficientOfVariation: Math.round((sd / mean) * 10000) / 10000,
    dropVsMedianPct: current === null ? null : pct(((med - current) / med) * 100),
    firstAt: iso((inWin[0] as CleanPoint).t),
    lastAt: iso((inWin[inWin.length - 1] as CleanPoint).t),
  };
}

/** Compute price statistics for all standard windows. */
export function computePriceStats(points: readonly PricePoint[], opts: PriceStatsOptions = {}): PriceStats {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const minPoints = opts.minPoints ?? 3;
  const { points: pts, dropped } = cleanPricePoints(points, now);
  const last = pts[pts.length - 1];
  const current = last?.price ?? null;

  let previous: CleanPoint | undefined;
  for (let i = pts.length - 2; i >= 0; i--) {
    const p = pts[i] as CleanPoint;
    if (p.price !== current) {
      previous = p;
      break;
    }
  }
  let low: CleanPoint | undefined;
  let high: CleanPoint | undefined;
  for (const p of pts) {
    if (!low || p.price < low.price) low = p;
    if (!high || p.price > high.price) high = p;
  }

  const windows = {} as Record<StatsWindow, WindowStats>;
  for (const w of STATS_WINDOWS) windows[w] = windowStats(w, pts, nowMs, current, minPoints);

  return {
    currentCents: current,
    currentAt: last ? iso(last.t) : null,
    previousPriceCents: previous?.price ?? null,
    previousPriceAt: previous ? iso(previous.t) : null,
    dropVsPreviousPct: previous && current !== null ? pct(((previous.price - current) / previous.price) * 100) : null,
    allTimeLowCents: low?.price ?? null,
    allTimeLowAt: low ? iso(low.t) : null,
    allTimeHighCents: high?.price ?? null,
    allTimeHighAt: high ? iso(high.t) : null,
    isAllTimeLow: current !== null && low !== undefined && current <= low.price,
    windows,
    totalPoints: pts.length,
    invalidPointsDropped: dropped,
  };
}

/** Median over an arbitrary trailing N-day window (helper for dealScore / fakeDiscount). */
export function trailingMedianCents(points: readonly PricePoint[], days: number, now: Date = new Date()): number | null {
  const { points: pts } = cleanPricePoints(points, now);
  const from = now.getTime() - days * DAY_MS;
  return median(pts.filter((p) => p.t >= from).map((p) => p.price));
}
