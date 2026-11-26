export interface FormatPercentOptions {
  /** Max fraction digits. Default 0. */
  decimals?: number;
  /** Prefix "+" for positive values. */
  signed?: boolean;
  locale?: string;
}

/** 0.125 → "13%" (decimals 0) / "12.5%" (decimals 1). Input is a ratio, not a percentage. */
export function formatPercent(ratio: number, options: FormatPercentOptions = {}): string {
  const { decimals = 0, signed = false, locale = "en-US" } = options;
  if (!Number.isFinite(ratio)) return "—";
  const out = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(ratio);
  return signed && ratio > 0 ? "+" + out : out;
}

/** Basis points (825) → ratio (0.0825). */
export function basisPointsToRatio(bp: number): number {
  return bp / 10_000;
}

/** Ratio (0.0825) → basis points (825), rounded. */
export function ratioToBasisPoints(ratio: number): number {
  return Math.round(ratio * 10_000);
}

/** Basis points → "8.25%". */
export function formatBasisPoints(bp: number, options: FormatPercentOptions = {}): string {
  return formatPercent(basisPointsToRatio(bp), { decimals: 2, ...options });
}

/**
 * Relative change from `from` to `to` as a ratio. (10000 → 8000) = -0.2.
 * Returns null when `from` is 0 (undefined change).
 */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return (to - from) / from;
}

/** Discount ratio of `price` vs `reference` (positive = cheaper). (10000, 8000) → 0.2 */
export function discountRatio(reference: number, price: number): number | null {
  if (reference <= 0) return null;
  return (reference - price) / reference;
}
