/**
 * Money helpers. All amounts are integer minor units (cents). Never floats for storage or arithmetic.
 */

export interface FormatMoneyOptions {
  /** ISO 4217 code. Default "USD". */
  currency?: string;
  /** BCP 47 locale. Default "en-US". */
  locale?: string;
  /** "always" (default) → $1,299.00; "auto" → drops .00 for whole amounts ($1,299); "never" rounds to whole units. */
  cents?: "always" | "auto" | "never";
  /** Prefix "+" for positive values (useful for deltas). */
  signed?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string, fractionDigits: number): Intl.NumberFormat {
  const key = locale + "|" + currency + "|" + fractionDigits;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, f);
  }
  return f;
}

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError("Expected integer cents, received " + String(value));
  }
}

/** 129999 → "$1,299.99" */
export function formatCents(cents: number, options: FormatMoneyOptions = {}): string {
  assertCents(cents);
  const { currency = "USD", locale = "en-US", cents: centsMode = "always", signed = false } = options;
  const whole = cents % 100 === 0;
  const digits = centsMode === "never" || (centsMode === "auto" && whole) ? 0 : 2;
  const value = digits === 0 ? Math.round(cents / 100) : cents / 100;
  const out = getFormatter(locale, currency, digits).format(value);
  return signed && cents > 0 ? "+" + out : out;
}

/** Alias kept for readability at call sites. */
export const formatMoney = formatCents;

/**
 * Parses a user/feed-entered money string into integer cents without float math.
 * Accepts "$1,299.99", "1299.9", "1,299", "-$5.00", "(5.00)", "USD 12.50". Returns null when unparseable.
 * More than 2 decimal places are rounded half-up on the third digit.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.trim();
  if (s === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[A-Za-z$\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/,/g, "");
  if (!/^\d*(\.\d*)?$/.test(s) || s === "" || s === ".") return null;
  const [intPart = "0", fracRaw = ""] = s.split(".");
  const frac = (fracRaw + "000").slice(0, 3);
  let cents = Number(intPart || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Sum of integer cents with safety check. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total);
  return total;
}

/** Multiply cents by a quantity or rate and round half-up to whole cents. */
export function multiplyCents(cents: number, factor: number): number {
  assertCents(cents);
  return Math.round(cents * factor);
}

/** Apply a rate given in basis points (825 = 8.25%) and round to cents. */
export function applyBasisPoints(cents: number, basisPoints: number): number {
  assertCents(cents);
  return Math.round((cents * basisPoints) / 10_000);
}

export function centsToDollars(cents: number): number {
  assertCents(cents);
  return cents / 100;
}
