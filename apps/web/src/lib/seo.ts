/**
 * SEO helpers shared by every template: metadata text clamping, the indexability policy and
 * JSON-LD builders. Builders are pure functions (unit-tested in test/structured-data.test.ts).
 *
 * Data-honesty rules baked in here:
 * - Prices/availability are only emitted from non-demo offers (`source !== "demo"`).
 * - No Review / AggregateRating, ever (we have none).
 * - No priceValidUntil: retailers don't give us a validity date, and inventing one is a false claim.
 */
import { brand } from "@pricora/config/brand";
import type { Offer, ProductCard, ProductDetailResponse, StockStatus } from "@pricora/contracts";
import { SITE_URL, absoluteUrl } from "./env";

/** Minimum number of products backed by real (non-demo) offers for a programmatic page to be indexable. */
export const MIN_REAL_PRODUCTS = 6;

/** "Best <category> under $X" caps we link to internally and list in the sitemap. Other caps still render. */
export const BEST_UNDER_CAPS = [100, 250, 500, 1000];

/** Root layout appends ` · <brand>` via the title template; keep the page part short enough for ~60 chars total. */
export const TITLE_MAX = 60 - ` · ${brand.name}`.length;
export const DESCRIPTION_MAX = 158;

type Json = Record<string, unknown>;

/** Truncates at a word boundary and adds an ellipsis. Collapses whitespace. */
export function clampText(input: string, max: number): string {
  const s = input.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "") + "…";
}

export const metaTitle = (s: string) => clampText(s, TITLE_MAX);
export const metaDescription = (s: string) => clampText(s, DESCRIPTION_MAX);

export function usd(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

/** schema.org decimal price string ("1299.00"). Input is integer minor units. */
export const schemaPrice = (cents: number) => (cents / 100).toFixed(2);

const AVAILABILITY: Record<StockStatus, string> = {
  in_stock: "https://schema.org/InStock",
  low_stock: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
  preorder: "https://schema.org/PreOrder",
  unknown: "",
};

const CONDITION: Record<string, string> = {
  new: "https://schema.org/NewCondition",
  used: "https://schema.org/UsedCondition",
  refurbished: "https://schema.org/RefurbishedCondition",
  open_box: "https://schema.org/UsedCondition",
};

export const realOffers = (offers: Offer[]) => offers.filter((o) => o.source !== "demo");

/* ------------------------------------------------------------------ */
/* Site-wide entities                                                  */
/* ------------------------------------------------------------------ */

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export function organizationJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: brand.name,
    legalName: brand.legalEntity,
    url: SITE_URL,
    logo: absoluteUrl("/brand/icon-512.png"),
    description: brand.description,
    areaServed: { "@type": "Country", name: "United States" },
    // Placeholder addresses live in brand.ts until launch; the contact page states that plainly.
    contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: brand.supportEmail, availableLanguage: ["en"] }],
    publishingPrinciples: absoluteUrl("/editorial-policy"),
  };
}

/** WebSite + SearchAction (sitelinks search box; Google retired the visual box in 2024 but the entity still helps other engines). */
export function websiteJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: brand.name,
    url: SITE_URL,
    inLanguage: "en-US",
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/* ------------------------------------------------------------------ */
/* Product                                                             */
/* ------------------------------------------------------------------ */

export function productJsonLd(d: ProductDetailResponse): Json {
  const p = d.product;
  const gtin = p.identifiers.find((i) => i.type === "GTIN" || i.type === "UPC" || i.type === "EAN");
  const url = absoluteUrl(`/products/${p.slug}`);
  const data: Json = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.title,
    url,
    image: p.images.length ? p.images.map((i) => i.url) : undefined,
    description: p.description ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand.name, url: absoluteUrl(`/brands/${p.brand.slug}`) } : undefined,
    category: p.breadcrumbs.length ? p.breadcrumbs.map((b) => b.name).join(" > ") : undefined,
    mpn: p.mpn ?? undefined,
    model: p.model ?? undefined,
    gtin: gtin?.value,
    sku: p.mpn ?? gtin?.value ?? undefined,
    itemCondition: CONDITION[p.condition],
  };
  // Variant siblings (storage/colour) are separate SKUs with their own prices → each keeps a self canonical;
  // the shared group is expressed with isVariantOf so engines can cluster them.
  if (p.variants.length > 1) {
    const groupSlug = [...p.variants].sort((a, b) => a.slug.localeCompare(b.slug))[0]!.slug;
    data.isVariantOf = {
      "@type": "ProductGroup",
      "@id": absoluteUrl(`/products/${groupSlug}#group`),
      productGroupID: groupSlug,
      name: p.brand ? `${p.brand.name} ${p.model ?? p.title}` : (p.model ?? p.title),
      variesBy: Array.from(new Set(p.variants.flatMap((v) => Object.keys(v.attributes)))).map((k) => `https://schema.org/${k === "color" ? "color" : "size"}`),
    };
  }
  const real = realOffers(d.offers);
  if (real.length) {
    const prices = real.map((o) => o.priceCents);
    const anyInStock = real.some((o) => o.stock === "in_stock" || o.stock === "low_stock");
    const allOut = real.every((o) => o.stock === "out_of_stock");
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: real[0]!.currency,
      lowPrice: schemaPrice(Math.min(...prices)),
      highPrice: schemaPrice(Math.max(...prices)),
      offerCount: real.length,
      availability: anyInStock ? AVAILABILITY.in_stock : allOut ? AVAILABILITY.out_of_stock : undefined,
      offers: real.map((o) => offerJsonLd(o, url)),
    };
  }
  return data;
}

function offerJsonLd(o: Offer, productUrl: string): Json {
  const shippingKnown = o.shipping.kind === "free" || (o.shipping.kind === "paid" && o.shipping.costCents !== null);
  return {
    "@type": "Offer",
    price: schemaPrice(o.priceCents),
    priceCurrency: o.currency,
    availability: AVAILABILITY[o.stock] || undefined,
    itemCondition: CONDITION[o.condition],
    url: productUrl,
    seller: { "@type": "Organization", name: o.retailer.name },
    shippingDetails: shippingKnown
      ? {
          "@type": "OfferShippingDetails",
          shippingRate: { "@type": "MonetaryAmount", value: schemaPrice(o.shipping.kind === "free" ? 0 : o.shipping.costCents!), currency: o.currency },
          shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
        }
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Lists / collections                                                 */
/* ------------------------------------------------------------------ */

/** ItemList of product URLs. Deliberately no prices: list items may be demo data, and a URL list makes no price claim. */
export function itemListJsonLd(name: string, products: Array<Pick<ProductCard, "slug" | "title">>, startPosition = 1): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: products.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: products.map((p, i) => ({ "@type": "ListItem", position: startPosition + i, url: absoluteUrl(`/products/${p.slug}`), name: p.title })),
  };
}

export function collectionPageJsonLd(opts: { name: string; path: string; description: string; dateModified?: string | null; about?: string }): Json {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    url: absoluteUrl(opts.path),
    description: opts.description,
    inLanguage: "en-US",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    dateModified: opts.dateModified ?? undefined,
    about: opts.about ? { "@type": "Thing", name: opts.about } : undefined,
  };
}

export function webPageJsonLd(opts: { type?: "WebPage" | "AboutPage" | "ContactPage"; name: string; path: string; description: string; dateModified: string }): Json {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    name: opts.name,
    url: absoluteUrl(opts.path),
    description: opts.description,
    inLanguage: "en-US",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    author: { "@id": ORG_ID },
    dateModified: opts.dateModified,
  };
}

export function faqJsonLd(items: Array<{ q: string; a: string }>): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/* ------------------------------------------------------------------ */
/* Programmatic page facts (answer-first copy from real data)          */
/* ------------------------------------------------------------------ */

export interface ListFacts {
  total: number;
  /** Products in the sample whose offers are all real (not demo). */
  realCount: number;
  minCents: number | null;
  maxCents: number | null;
  topBrands: string[];
  recentDrops: number;
  inStock: number;
  lastUpdated: string | null;
}

export function listFacts(items: ProductCard[], total: number): ListFacts {
  const prices = items.map((p) => p.lowestPriceCents).filter((c): c is number => c !== null);
  const brandCounts = new Map<string, number>();
  for (const p of items) if (p.brand) brandCounts.set(p.brand.name, (brandCounts.get(p.brand.name) ?? 0) + 1);
  const lastUpdated = items.reduce<string | null>((max, p) => (!max || p.updatedAt > max ? p.updatedAt : max), null);
  return {
    total,
    realCount: items.filter((p) => !p.hasDemoData).length,
    minCents: prices.length ? Math.min(...prices) : null,
    maxCents: prices.length ? Math.max(...prices) : null,
    topBrands: [...brandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n),
    recentDrops: items.filter((p) => p.previousPriceCents != null).length,
    inStock: items.filter((p) => p.inStock).length,
    lastUpdated,
  };
}

/** One- or two-sentence factual summary for the top of a list page (answer-first, AI-overview friendly). */
export function listSummary(subject: string, f: ListFacts): string {
  if (!f.total) return `We don't track any ${subject} yet.`;
  const parts = [`We compare ${f.total.toLocaleString("en-US")} ${subject} across US stores`];
  if (f.minCents !== null && f.maxCents !== null && f.minCents !== f.maxCents) parts[0] += `, with lowest prices from ${usd(f.minCents)} to ${usd(f.maxCents)} in this list`;
  let s = parts[0] + ".";
  if (f.topBrands.length > 1) s += ` Most-listed brands here: ${f.topBrands.join(", ")}.`;
  if (f.recentDrops) s += ` ${f.recentDrops} ${f.recentDrops === 1 ? "has" : "have"} a price cut in the last 7 days.`;
  return s;
}

/* ------------------------------------------------------------------ */
/* Listing canonical / robots policy                                   */
/* ------------------------------------------------------------------ */

type Params = Record<string, string | string[] | undefined>;
const firstOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** Keys that narrow the result set (facets). Mirrors FILTER_KEYS in search-params.ts minus the order-only keys sort/view/page. */
const NARROWING_KEYS = ["q", "category", "brand", "retailer", "minPrice", "maxPrice", "condition", "inStock", "freeShipping", "minDiscount", "spec"];

export function pageParam(sp: Params): number {
  const n = Number(firstOf(sp.page) ?? "1");
  return Number.isSafeInteger(n) && n > 1 ? n : 1;
}

/**
 * Canonical + robots for a listing URL (category / brand / store):
 * - no params or sort/view only   → canonical = clean URL (+ ?page=N for N>1), indexable
 * - exactly one brand on a category, and a curated brand+category page exists → canonical to it
 *   (indexable only when that page clears MIN_REAL_PRODUCTS)
 * - any other narrowing facet     → noindex,follow (thin combos), canonical = clean URL
 */
export function listingSeo(basePath: string, sp: Params, curated?: { brandPath: (brand: string) => string; indexable: boolean }) {
  const page = pageParam(sp);
  const clean = basePath + (page > 1 ? `?page=${page}` : "");
  const narrowing = NARROWING_KEYS.filter((k) => {
    const v = firstOf(sp[k]);
    return v !== undefined && v !== "";
  });
  if (!narrowing.length) return { canonical: clean, robots: undefined, noindex: false };
  const brand = firstOf(sp.brand);
  if (curated && narrowing.length === 1 && narrowing[0] === "brand" && brand && !brand.includes(",")) {
    const target = curated.brandPath(brand) + (page > 1 ? `?page=${page}` : "");
    return curated.indexable ? { canonical: target, robots: undefined, noindex: false } : { canonical: target, robots: { index: false, follow: true }, noindex: true };
  }
  return { canonical: clean, robots: { index: false, follow: true }, noindex: true };
}
