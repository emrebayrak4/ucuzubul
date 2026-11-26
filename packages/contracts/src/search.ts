import { z } from "zod";
import { CsvList, MAX_PAGE_SIZE, ProductCondition, QueryBoolean, Slug } from "./common";
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
  condition: CsvList.pipe(z.array(ProductCondition)).optional(),
  inStock: QueryBoolean.optional(),
  freeShipping: QueryBoolean.optional(),
  pickup: QueryBoolean.optional(),
  minDiscount: z.coerce.number().min(0).max(1).optional(),
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
});
export type FacetBucket = z.infer<typeof FacetBucket>;

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
  }),
  inStockCount: z.number().int().nonnegative(),
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
  items: z.array(ProductCard),
  facets: SearchFacets,
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().nonnegative(),
  /** true when Meilisearch is unreachable and Postgres fallback served the results. */
  degraded: z.boolean(),
  parsed: ParsedQuery.nullable(),
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
  }),
  z.object({ type: z.literal("category"), text: z.string(), slug: Slug }),
  z.object({ type: z.literal("brand"), text: z.string(), slug: Slug }),
]);
export type Suggestion = z.infer<typeof Suggestion>;

export const SuggestResponse = z.object({ items: z.array(Suggestion), degraded: z.boolean() });
export type SuggestResponse = z.infer<typeof SuggestResponse>;

export const TrendingResponse = z.object({
  queries: z.array(z.object({ text: z.string(), count: z.number().int().nonnegative() })),
  products: z.array(ProductCard),
});
export type TrendingResponse = z.infer<typeof TrendingResponse>;
