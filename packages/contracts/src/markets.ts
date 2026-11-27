/**
 * Multi-market contracts. The market list mirrors @pricora/config `MARKET_IDS` (single source of the
 * config itself); a test in apps/api asserts both lists stay identical.
 *
 * Every catalog/search/deals/coupons/travel endpoint accepts the market as `?market=` (+ `?locale=`) or
 * the headers `x-wl-market` / `x-wl-locale` (the api-client sets these). Unknown or missing market → "us".
 * Prices in responses are in the market's currency minor units and are never converted.
 */
import { z } from "zod";

export const MARKET_ID_VALUES = ["us", "uk", "ca", "au", "de", "fr", "es", "it", "nl", "jp", "tr", "br"] as const;
export const MarketIdSchema = z.enum(MARKET_ID_VALUES);
export type MarketIdValue = z.infer<typeof MarketIdSchema>;

export const MARKET_HEADER = "x-wl-market";
export const LOCALE_HEADER = "x-wl-locale";

/** Optional market selection accepted on any public read endpoint (lenient: unknown values fall back to "us"). */
export const MarketQuery = z.object({
  market: z.string().trim().toLowerCase().max(8).optional(),
  locale: z.string().trim().max(10).optional(),
});
export type MarketQuery = z.infer<typeof MarketQuery>;

export const MarketInfo = z.object({
  id: MarketIdSchema,
  /** ISO 3166-1 alpha-2 ("GB" for uk). */
  country: z.string().length(2),
  name: z.string(),
  flag: z.string(),
  defaultLocale: z.string(),
  locales: z.array(z.string()),
  currency: z.string().length(3),
  currencyDigits: z.union([z.literal(0), z.literal(2)]),
  /** "tax_inclusive": shelf price includes VAT/GST; "tax_added_at_checkout": US/CA sales tax estimated on top. */
  priceDisplay: z.enum(["tax_inclusive", "tax_added_at_checkout"]),
  /** Local tax name (VAT, MwSt., TVA, KDV, 消費税…); null for US/CA/BR composite. */
  taxName: z.string().nullable(),
  /** Standard VAT/GST rate in basis points (2000 = 20%); null where not a single VAT rate. */
  standardTaxRateBasisPoints: z.number().int().nullable(),
  postalCodeLabel: z.string(),
  postalCodeExample: z.string(),
  measurement: z.enum(["imperial", "metric", "uk_mixed"]),
  timezone: z.string(),
  /** Web path prefix for each locale: { "en-CA": "/ca", "fr-CA": "/ca-fr" }; US default locale = "". */
  pathPrefixes: z.record(z.string(), z.string()),
  cookieConsentRequired: z.boolean(),
  imprintRequired: z.boolean(),
  imprintPageName: z.string().nullable(),
  /** "lowest_30_days": EU/UK/TR rule — "was" prices must be the lowest of the prior 30 days. */
  priceReductionReference: z.enum(["lowest_30_days", "none"]),
  /** Active storefronts in this market (with at least one active offer or listed for the market). */
  retailerCount: z.number().int().nonnegative(),
  isActive: z.boolean(),
});
export type MarketInfo = z.infer<typeof MarketInfo>;

export const MarketListResponse = z.object({
  markets: z.array(MarketInfo),
  defaultMarket: MarketIdSchema,
});
export type MarketListResponse = z.infer<typeof MarketListResponse>;

/** Resolved market context echoed on market-aware responses (optional field). */
export const MarketContextInfo = z.object({
  market: MarketIdSchema,
  locale: z.string(),
  currency: z.string().length(3),
  priceDisplay: z.enum(["tax_inclusive", "tax_added_at_checkout"]),
});
export type MarketContextInfo = z.infer<typeof MarketContextInfo>;

export const FxRatesQuery = z.object({
  /** Convert-to currency for `approx` helpers; default USD. */
  quote: z.string().trim().toUpperCase().length(3).optional(),
});

export const FxRatesResponse = z.object({
  base: z.literal("EUR"),
  /** ECB publication date (YYYY-MM-DD); null when no rates were fetched yet (worker not run). */
  date: z.string().nullable(),
  /** Units per 1 EUR as decimal strings. */
  rates: z.record(z.string(), z.string()),
  source: z.literal("ecb"),
  /** Always shown with "≈": reference rates for orientation only; stores charge in their own currency. */
  note: z.string(),
});
export type FxRatesResponse = z.infer<typeof FxRatesResponse>;
