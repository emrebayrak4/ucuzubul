/**
 * Market + locale negotiation. Precedence: URL path segment > cookie > Accept-Language > geo header.
 *
 * SEO rule: the path is authoritative. A URL without a market segment is the US site; we never
 * auto-redirect on cookie/Accept-Language/geo (crawlers mostly come from the US and would never see
 * other markets). Instead `suggested` tells the UI to show a "Go to WhichLess Germany?" banner.
 */
import {
  DEFAULT_MARKET_ID,
  LOCALES,
  MARKETS,
  MARKET_LIST,
  getMarket,
  isLocale,
  marketForCountry,
  marketForLocale,
  parseMarketId,
  parseMarketPathSegment,
  resolveMarketLocale,
  type Locale,
  type MarketConfig,
  type MarketId,
} from "@pricora/config";

/** Cookie set by the market/language switcher: "<market>|<locale>", e.g. "ca|fr-CA". */
export const MARKET_COOKIE = "wl_market";
/** Request headers that carry the visitor's country (first present wins). */
export const GEO_COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-geo-country"] as const;

export type NegotiationSource = "path" | "cookie" | "accept-language" | "geo" | "default";

export interface NegotiationInput {
  /** First path segment (without slashes), e.g. "de", "ca-fr", "products". */
  pathSegment?: string | null;
  /** Raw value of the `wl_market` cookie. */
  cookie?: string | null;
  /** Raw Accept-Language header. */
  acceptLanguage?: string | null;
  /** ISO country from a CDN geo header. */
  geoCountry?: string | null;
}

export interface Negotiated {
  market: MarketConfig;
  locale: Locale;
  /** What decided the market. */
  source: NegotiationSource;
  /** True when the path carried the market (render that market, no banner). */
  fromPath: boolean;
  /** Market the visitor probably wants when it differs from the one rendered (for a suggestion banner). */
  suggested: { market: MarketConfig; locale: Locale; source: Exclude<NegotiationSource, "path" | "default"> } | null;
}

export function encodeMarketCookie(market: MarketId, locale: Locale): string {
  return market + "|" + locale;
}

export function parseMarketCookie(value: string | null | undefined): { market: MarketConfig; locale: Locale } | null {
  if (!value) return null;
  const [m, l] = decodeURIComponent(value).split("|");
  const id = parseMarketId(m);
  if (!id) return null;
  const market = MARKETS[id];
  return { market, locale: resolveMarketLocale(market, l) };
}

interface LangRange {
  tag: string;
  q: number;
}

/** Parses Accept-Language into ranges sorted by q (stable for equal q). Ignores "*". */
export function parseAcceptLanguage(header: string | null | undefined): LangRange[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, i) => {
      const [tagRaw = "", ...params] = part.trim().split(";");
      const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qp ? Number(qp.slice(2)) : 1;
      return { tag: tagRaw.trim(), q: Number.isFinite(q) ? q : 0, i };
    })
    .filter((r) => r.tag && r.tag !== "*" && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map(({ tag, q }) => ({ tag, q }));
}

const LANGUAGE_DEFAULT: Readonly<Record<string, Locale>> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
  nl: "nl-NL",
  ja: "ja-JP",
  tr: "tr-TR",
  pt: "pt-BR",
};

function canonicalTag(tag: string): string {
  const [lang = "", region = ""] = tag.replace("_", "-").split("-");
  return region ? lang.toLowerCase() + "-" + region.toUpperCase() : lang.toLowerCase();
}

/**
 * Best supported locale for an Accept-Language header. Exact match wins ("fr-CA"), then the
 * language's market-local variant when a country hint matches ("en" + GB → en-GB), then the
 * language default ("de-AT" → de-DE, "pt-PT" → pt-BR).
 */
export function matchLocale(header: string | null | undefined, countryHint?: string | null): Locale | null {
  const hintMarket = marketForCountry(countryHint);
  for (const { tag } of parseAcceptLanguage(header)) {
    const t = canonicalTag(tag);
    if (isLocale(t)) return t;
    const lang = t.split("-")[0] ?? "";
    const regional = t.split("-")[1];
    // Same language spoken in the hinted (or tag's own) country, e.g. en-IE → none, en + GB → en-GB.
    const byCountry = (regional ? marketForCountry(regional) : null) ?? hintMarket;
    const local = byCountry?.locales.find((l) => l.startsWith(lang + "-"));
    if (local) return local;
    const def = LANGUAGE_DEFAULT[lang];
    if (def) return def;
  }
  return null;
}

function geoFrom(input: NegotiationInput): MarketConfig | null {
  return marketForCountry(input.geoCountry);
}

export function negotiate(input: NegotiationInput): Negotiated {
  const fromPath = parseMarketPathSegment(input.pathSegment);
  const cookie = parseMarketCookie(input.cookie);
  const geo = geoFrom(input);
  const alLocale = matchLocale(input.acceptLanguage, input.geoCountry);
  const alMarket = alLocale ? marketForLocale(alLocale) : null;

  // What the visitor would pick (ignoring the path):
  // cookie > Accept-Language with a region we serve ("de-DE", "en-GB") > geo > language-only Accept-Language ("de").
  let preferred: Negotiated["suggested"] = null;
  if (cookie) preferred = { market: cookie.market, locale: cookie.locale, source: "cookie" };
  else if (alLocale && alMarket && hasRegionalTag(input.acceptLanguage))
    preferred = { market: alMarket, locale: alLocale, source: "accept-language" };
  else if (geo) preferred = { market: geo, locale: resolveMarketLocale(geo, alLocale), source: "geo" };
  else if (alLocale && alMarket) preferred = { market: alMarket, locale: alLocale, source: "accept-language" };

  if (fromPath) {
    const suggested = preferred && preferred.market.id !== fromPath.market.id ? preferred : null;
    return { market: fromPath.market, locale: fromPath.locale, source: "path", fromPath: true, suggested };
  }

  // No market in the path → the US site at the root. Locale stays en-US (the root is English).
  const market = getMarket(DEFAULT_MARKET_ID);
  const suggested = preferred && preferred.market.id !== market.id ? preferred : null;
  return { market, locale: market.defaultLocale, source: "default", fromPath: false, suggested };
}

function hasRegionalTag(header: string | null | undefined): boolean {
  const first = parseAcceptLanguage(header)[0];
  return !!first && /-/.test(first.tag);
}

/** Negotiation for API requests: explicit `market`/`locale` query params, then the same chain as the web. */
export function negotiateApi(input: {
  market?: string | null;
  locale?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  geoCountry?: string | null;
}): { market: MarketConfig; locale: Locale; source: NegotiationSource } {
  const id = parseMarketId(input.market);
  if (id) {
    const market = MARKETS[id];
    const requested = isLocale(input.locale) ? input.locale : matchLocale(input.acceptLanguage, market.country);
    return { market, locale: resolveMarketLocale(market, requested), source: "path" };
  }
  // A locale alone implies its market ("de-DE" → de) — convenient for clients that only know the UI language.
  if (isLocale(input.locale)) {
    const market = marketForLocale(input.locale) ?? MARKETS[DEFAULT_MARKET_ID];
    return { market, locale: input.locale, source: "path" };
  }
  const n = negotiate({ cookie: input.cookie, acceptLanguage: input.acceptLanguage, geoCountry: input.geoCountry });
  return { market: n.market, locale: n.locale, source: n.source };
}

/** hreflang alternates for a path that exists in every market: [{ hreflang: "de-DE", href: "/de/deals" }, …, x-default]. */
export function hreflangAlternates(pathWithoutMarket: string): { hreflang: string; href: string }[] {
  const p = pathWithoutMarket.startsWith("/") ? pathWithoutMarket : "/" + pathWithoutMarket;
  const out: { hreflang: string; href: string }[] = MARKET_LIST.flatMap((m) =>
    m.locales.map((l) => {
      const seg = l === m.defaultLocale ? m.routing.pathSegment : (m.routing.localeSegments[l] ?? m.routing.pathSegment);
      return { hreflang: l, href: (seg ? "/" + seg : "") + (p === "/" && seg ? "" : p) };
    }),
  );
  out.push({ hreflang: "x-default", href: p });
  return out;
}

export const SUPPORTED_LOCALES = LOCALES;
