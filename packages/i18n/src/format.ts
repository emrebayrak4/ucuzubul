/**
 * Locale-aware formatting on top of Intl. Money is integer minor units in the offer's own currency
 * (JPY has 0 minor digits, everything else we support has 2). Never convert offer prices for display;
 * use `formatApproxMoney` only for clearly-labelled "≈" hints.
 */
import { currencyDigits, getMarket, type Locale, type MarketId } from "@pricora/config";

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(opts);
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    nfCache.set(key, f);
  }
  return f;
}

const dfCache = new Map<string, Intl.DateTimeFormat>();
function df(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = dfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dfCache.set(key, f);
  }
  return f;
}

export interface MoneyFormatOptions {
  /** "always" shows minor digits (€1.299,00); "auto" drops them for whole amounts (€1.299); "never" rounds. */
  minor?: "always" | "auto" | "never";
  /** Prefix "+" on positive values (deltas). */
  signed?: boolean;
  /** "symbol" (default) | "narrowSymbol" ($ instead of US$) | "code" (USD 12.00). */
  display?: "symbol" | "narrowSymbol" | "code";
}

function assertMinor(value: number): void {
  if (!Number.isSafeInteger(value)) throw new TypeError("Expected integer minor units, received " + String(value));
}

/** Minor units → major-unit number (12999, "EUR" → 129.99; 1980, "JPY" → 1980). For charts/axes only. */
export function minorToMajor(minor: number, currency: string): number {
  assertMinor(minor);
  const d = currencyDigits(currency);
  return d === 0 ? minor : minor / 10 ** d;
}

/** Major-unit decimal string → minor units without float drift ("129.99","EUR" → 12999). */
export function majorToMinor(major: string | number, currency: string): number | null {
  const d = currencyDigits(currency);
  const s = typeof major === "number" ? major.toFixed(d) : major.trim();
  const m = /^(-)?(\d+)(?:[.,](\d+))?$/.exec(s);
  if (!m) return null;
  const frac = ((m[3] ?? "") + "000").slice(0, d + 1);
  let v = Number(m[2]) * 10 ** d + (d ? Number(frac.slice(0, d)) : 0);
  if (Number(frac[d] ?? "0") >= 5) v += 1;
  return m[1] ? -v : v;
}

/** 129999, "EUR", "de-DE" → "1.299,99 €"; 1980, "JPY", "ja-JP" → "￥1,980". */
export function formatMoney(minor: number, currency: string, locale: Locale | string, opts: MoneyFormatOptions = {}): string {
  assertMinor(minor);
  const digits = currencyDigits(currency);
  const whole = digits === 0 || minor % 10 ** digits === 0;
  const fd = opts.minor === "never" || (opts.minor === "auto" && whole) ? 0 : digits;
  const major = minorToMajor(minor, currency);
  const out = nf(locale, {
    style: "currency",
    currency,
    currencyDisplay: opts.display ?? "symbol",
    minimumFractionDigits: fd,
    maximumFractionDigits: fd,
  }).format(fd === 0 ? Math.round(major) : major);
  return opts.signed && minor > 0 ? "+" + out : out;
}

/** "≈ $142" — approximate conversion hint, whole units, never used as a price. */
export function formatApproxMoney(minor: number, currency: string, locale: Locale | string): string {
  return "≈ " + formatMoney(minor, currency, locale, { minor: "never", display: "narrowSymbol" });
}

/** Money in the market's own currency + default-or-given locale. */
export function formatMarketMoney(minor: number, marketId: MarketId, locale?: Locale, opts?: MoneyFormatOptions): string {
  const m = getMarket(marketId);
  return formatMoney(minor, m.currency, locale ?? m.defaultLocale, opts);
}

export function formatNumber(value: number, locale: Locale | string, opts: Intl.NumberFormatOptions = {}): string {
  return nf(locale, opts).format(value);
}

/** Basis points → localized percent (1250 → "12.5 %" in de-DE, "12.5%" in en-US). */
export function formatPercentBp(bp: number, locale: Locale | string, maxFractionDigits = 1): string {
  return nf(locale, { style: "percent", maximumFractionDigits: maxFractionDigits }).format(bp / 10_000);
}

export type DateStyle = "short" | "medium" | "long" | "full";

export function formatDate(
  date: Date | string | number,
  locale: Locale | string,
  opts: { dateStyle?: DateStyle; timeStyle?: DateStyle; timeZone?: string } = { dateStyle: "medium" },
): string {
  const d = date instanceof Date ? date : new Date(date);
  return df(locale, opts).format(d);
}

/** Calendar date in a market's timezone ("today" for deal expiry etc.). */
export function formatMarketDate(date: Date | string | number, marketId: MarketId, locale?: Locale, dateStyle: DateStyle = "medium"): string {
  const m = getMarket(marketId);
  return formatDate(date, locale ?? m.defaultLocale, { dateStyle, timeZone: m.timezone });
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "3 days ago" / "vor 3 Tagen" / "3 日前". */
export function formatRelative(date: Date | string | number, locale: Locale | string, now: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, sec] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= sec || unit === "second") return rtf.format(Math.round(diffSec / sec), unit);
  }
  return rtf.format(0, "second");
}

export function formatList(items: readonly string[], locale: Locale | string, type: "conjunction" | "disjunction" = "conjunction"): string {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}

/** Plural category for a count ("one", "other", "few"…). */
export function pluralCategory(count: number, locale: Locale | string): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale).select(count);
}

export type MeasureKind = "length" | "weight" | "volume" | "temperature" | "distance";

/**
 * Formats a metric base value for the market's measurement system.
 * length: centimetres, weight: grams, volume: litres, temperature: °C, distance: kilometres.
 * Imperial markets get inches/pounds/gallons/°F/miles; the UK shows miles for distance but metric otherwise.
 */
export function formatMeasure(value: number, kind: MeasureKind, marketId: MarketId, locale?: Locale): string {
  const m = getMarket(marketId);
  const loc = locale ?? m.defaultLocale;
  const imperial = m.measurement === "imperial";
  const ukMiles = m.measurement === "uk_mixed" && kind === "distance";
  const fmt = (v: number, unit: string, digits = 1) =>
    nf(loc, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: digits }).format(v);
  switch (kind) {
    case "length":
      return imperial ? fmt(value / 2.54, "inch") : fmt(value, "centimeter");
    case "weight":
      if (imperial) return value >= 453.592 ? fmt(value / 453.592, "pound") : fmt(value / 28.3495, "ounce");
      return value >= 1000 ? fmt(value / 1000, "kilogram") : fmt(value, "gram", 0);
    case "volume":
      return imperial ? fmt(value / 3.78541, "gallon") : fmt(value, "liter");
    case "temperature":
      return imperial ? fmt((value * 9) / 5 + 32, "fahrenheit", 0) : fmt(value, "celsius", 0);
    case "distance":
      return imperial || ukMiles ? fmt(value / 1.609344, "mile") : fmt(value, "kilometer");
  }
}

/** Screen/TV diagonal: inches everywhere (industry norm), plus cm in metric markets: '65" (165 cm)'. */
export function formatScreenSize(inches: number, marketId: MarketId, locale?: Locale): string {
  const m = getMarket(marketId);
  const loc = locale ?? m.defaultLocale;
  const inch = nf(loc, { maximumFractionDigits: 1 }).format(inches) + "″";
  if (m.measurement === "imperial") return inch;
  return inch + " (" + nf(loc, { style: "unit", unit: "centimeter", maximumFractionDigits: 0 }).format(inches * 2.54) + ")";
}
