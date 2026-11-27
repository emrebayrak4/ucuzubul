/**
 * @pricora/i18n — message catalogs (ICU MessageFormat), typed keys, Intl formatting helpers and
 * market/locale negotiation. Locale catalogs live in src/messages (en-US base + en-GB/en-AU/en-CA overrides);
 * full translations were not finished (multi-market work paused 2026-11-27).
 */
export * from "./format";
export * from "./negotiate";
export * from "./translate";
export {
  LOCALES,
  MARKETS,
  MARKET_IDS,
  MARKET_LIST,
  DEFAULT_LOCALE,
  DEFAULT_MARKET_ID,
  getMarket,
  isLocale,
  isMarketId,
  type Locale,
  type MarketConfig,
  type MarketId,
} from "@pricora/config";
