import { z } from "zod";
import { CsvList, MAX_PAGE_SIZE, QueryBoolean, Slug, UsZip } from "./common";
import { ZipOrigin } from "./local";
import { BrandSummary, CategorySummary, ProductCard } from "./catalog";

export const SearchSort = z.enum([
  "relevance",
  "lowest_total",
  "price_asc",
  "price_desc",
  "best_deal",
  "popular",
  "newest",
  "biggest_drop",
  /** Lowest price per unit (¢/oz, ¢/ct…); products without a known size go last. */
  "unit_price",
  /** Nearest store first (needs a ZIP). */
  "distance",
]);
export type SearchSort = z.infer<typeof SearchSort>;

/** GET /v1/search — all state is URL query params. Prices in cents. */
export const SearchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  category: Slug.optional(),
  brand: CsvList.optional(),
  retailer: CsvList.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  /**
   * Condition groups (default ["new"] when omitted — second-hand never wins "lowest price" by default).
   * "all" = every condition. Legacy values for_parts/unknown map to "used".
   */
  condition: CsvList.transform((list) => list.map((v) => (v === "for_parts" || v === "unknown" ? "used" : v))).pipe(z.array(z.enum(["new", "open_box", "refurbished", "used", "all"]))).optional(),
  inStock: QueryBoolean.optional(),
  freeShipping: QueryBoolean.optional(),
  pickup: QueryBoolean.optional(),
  /**
   * Pay over time: "payin4" = some store offers interest-free pay-in-4 for its total (computed estimate);
   * "any" = any BNPL / financing option. Legacy "true" means "any".
   */
  payOverTime: z.preprocess((v) => (v === "true" || v === true ? "any" : v), z.enum(["payin4", "any"])).optional(),
  minDiscount: z.coerce.number().min(0).max(1).optional(),
  /** Spec filters as `key.value-slug` items, e.g. `ram.16-gb,ram.32-gb,cpu-brand.intel` (OR within a key, AND across keys). */
  spec: CsvList.optional(),
  /** "Near me": only products in stock (or stock unknown) at a store within `radius` miles of `zip`. */
  near: QueryBoolean.optional(),
  /** Shopper ZIP for near-me / distance (falls back to the signed-in user's saved ZIP). */
  zip: UsZip.optional(),
  /** Miles (default 25). */
  radius: z.coerce.number().int().min(1).max(100).optional(),
  sort: SearchSort.default("relevance"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
/** Input shape (before coercion) — what clients send. */
export type SearchQueryInput = z.input<typeof SearchQuery>;

export const FacetBucket = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  selected: z.boolean(),
  /** Brand/store logo when stored (trademark of its owner, used nominatively). */
  logoUrl: z.string().nullable().optional(),
  /** Store brand color for text tiles. */
  color: z.string().nullable().optional(),
});
export type FacetBucket = z.infer<typeof FacetBucket>;

export const SpecFacet = z.object({ key: z.string(), label: z.string(), buckets: z.array(FacetBucket) });
export type SpecFacet = z.infer<typeof SpecFacet>;

export const PriceHistogramBin = z.object({ fromCents: z.number().int(), toCents: z.number().int(), count: z.number().int().nonnegative() });
export type PriceHistogramBin = z.infer<typeof PriceHistogramBin>;

export const SearchFacets = z.object({
  categories: z.array(FacetBucket),
  brands: z.array(FacetBucket),
  retailers: z.array(FacetBucket),
  conditions: z.array(FacetBucket),
  price: z.object({
    minCents: z.number().int().nullable(),
    maxCents: z.number().int().nullable(),
    buckets: z.array(
      z.object({ fromCents: z.number().int(), toCents: z.number().int().nullable(), count: z.number().int() }),
    ),
    /** Equal-width bins over the result set ignoring the price filter (slider histogram). */
    histogram: z.array(PriceHistogramBin),
  }),
  inStockCount: z.number().int().nonnegative(),
  freeShippingCount: z.number().int().nonnegative(),
  /** Products with any pay-over-time option at some store. */
  payOverTimeCount: z.number().int().nonnegative(),
  /** Products with an interest-free pay-in-4 estimate at some store. */
  payIn4Count: z.number().int().nonnegative(),
  /** Category spec filters (only when a category with facet definitions is selected). */
  specs: z.array(SpecFacet),
  /** Products available at a store within the radius (only when a ZIP is known). */
  nearbyCount: z.number().int().nonnegative().optional(),
});
export type SearchFacets = z.infer<typeof SearchFacets>;

/** What the parser understood from natural language ("best laptop under $800"). */
export const ParsedQuery = z.object({
  text: z.string(),
  maxPriceCents: z.number().int().nullable(),
  minPriceCents: z.number().int().nullable(),
  category: CategorySummary.pick({ slug: true, name: true }).nullable(),
  brand: BrandSummary.pick({ slug: true, name: true }).nullable(),
  identifier: z.object({ type: z.string(), value: z.string() }).nullable(),
  url: z.string().nullable(),
});
export type ParsedQuery = z.infer<typeof ParsedQuery>;

export const SearchResponse = z.object({
  /** ZIP used for near-me / distance (null when none known). */
  location: ZipOrigin.nullable().optional(),
  items: z.array(ProductCard),
  facets: SearchFacets,
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().nonnegative(),
  /** true when Meilisearch is unreachable and Postgres fallback served the results. */
  degraded: z.boolean(),
  parsed: ParsedQuery.nullable(),
  /** Spelling suggestion when the query looks misspelled (or returned nothing). */
  didYouMean: z.string().nullable(),
  tookMs: z.number().nonnegative(),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const SuggestQuery = z.object({ q: z.string().trim().min(1).max(100) });
export type SuggestQuery = z.infer<typeof SuggestQuery>;

export const Suggestion = z.discriminatedUnion("type", [
  z.object({ type: z.literal("query"), text: z.string() }),
  z.object({
    type: z.literal("product"),
    text: z.string(),
    slug: Slug,
    imageUrl: z.string().url().nullable(),
    lowestPriceCents: z.number().int().nullable(),
    storeCount: z.number().int().nonnegative().optional(),
    category: z.string().nullable().optional(),
    hasDemoData: z.boolean().optional(),
  }),
  z.object({ type: z.literal("category"), text: z.string(), slug: Slug, parent: z.string().nullable().optional(), count: z.number().int().optional() }),
  z.object({ type: z.literal("brand"), text: z.string(), slug: Slug, count: z.number().int().optional() }),
]);
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestResponse = z.object({ items: z.array(Suggestion), degraded: z.boolean() });
export type SuggestResponse = z.infer<typeof SuggestResponse>;

export const TrendingResponse = z.object({
  queries: z.array(z.object({ text: z.string(), count: z.number().int().nonnegative() })),
  products: z.array(ProductCard),
});
export type TrendingResponse = z.infer<typeof TrendingResponse>;
