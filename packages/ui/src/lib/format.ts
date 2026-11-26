/**
 * Money formatting for UI. Input is ALWAYS integer minor units (cents).
 * (packages/utils owns the canonical helpers; this local copy keeps @pricora/ui dependency-free.)
 */
export interface FormatPriceOptions {
  currency?: string;
  /** Hide ".00" when the amount is whole. Default: false (prices always show cents). */
  trimZeroCents?: boolean;
  /** Compact for tight spaces, e.g. $1.2K. Never use in offer tables. */
  compact?: boolean;
  locale?: string;
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
}

export function formatPrice(cents: number, options: FormatPriceOptions = {}): string {
  const { currency = "USD", trimZeroCents = false, compact = false, locale = "en-US" } = options;
  if (!Number.isFinite(cents)) return "";
  const amount = Math.round(cents) / 100;
  const whole = Math.round(cents) % 100 === 0;
  const digits = compact ? undefined : trimZeroCents && whole ? 0 : 2;
  const key = `${locale}|${currency}|${compact ? "c" : "n"}|${digits ?? "auto"}`;
  return formatter(key, () =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: digits,
      maximumFractionDigits: compact ? 1 : digits,
    }),
  ).format(amount);
}

/** Percent drop between two prices in cents, rounded to an integer (e.g. 12 for -12%). */
export function percentDrop(fromCents: number, toCents: number): number {
  if (fromCents <= 0 || toCents >= fromCents) return 0;
  return Math.round(((fromCents - toCents) / fromCents) * 100);
}

export function formatCount(n: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(n);
}
