import { z } from "zod";
import {
  Cents,
  DataSource,
  Id,
  IntegrationStatus,
  IsoDateTime,
  PaginationQuery,
  ProductCondition,
  Slug,
  StockStatus,
  paginated,
} from "./common";
import { Coupon } from "./coupons";

/* ------------------------------------------------------------------ */
/* Categories / Brands / Retailers                                     */
/* ------------------------------------------------------------------ */

export const CategorySummary = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  parentId: Id.nullable(),
  icon: z.string().nullable(),
  productCount: z.number().int().nonnegative(),
});
export type CategorySummary = z.infer<typeof CategorySummary>;

export type CategoryNode = CategorySummary & { children: CategoryNode[] };
export const CategoryNode: z.ZodType<CategoryNode> = CategorySummary.extend({
  children: z.lazy(() => z.array(CategoryNode)),
});

export const CategoryTreeResponse = z.object({ items: z.array(CategoryNode) });
export type CategoryTreeResponse = z.infer<typeof CategoryTreeResponse>;

export const Breadcrumb = z.object({ name: z.string(), slug: Slug });
export type Breadcrumb = z.infer<typeof Breadcrumb>;

export const CategoryDetailResponse = z.object({
  category: CategorySummary.extend({ description: z.string().nullable() }),
  breadcrumbs: z.array(Breadcrumb),
  children: z.array(CategorySummary),
  topBrands: z.array(z.object({ slug: Slug, name: z.string(), productCount: z.number().int() })),
});
export type CategoryDetailResponse = z.infer<typeof CategoryDetailResponse>;

export const BrandSummary = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  logoUrl: z.string().url().nullable(),
  productCount: z.number().int().nonnegative(),
});
export type BrandSummary = z.infer<typeof BrandSummary>;

export const BrandDetailResponse = z.object({
  brand: BrandSummary.extend({ description: z.string().nullable(), website: z.string().url().nullable() }),
  categories: z.array(CategorySummary),
});
export type BrandDetailResponse = z.infer<typeof BrandDetailResponse>;

export const RetailerSummary = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  domain: z.string(),
  logoUrl: z.string().url().nullable(),
  /** Hex color used for the text-logo tile when no logo image is licensed. */
  brandColor: z.string().nullable(),
  integrationStatus: IntegrationStatus,
  offerCount: z.number().int().nonnegative(),
  /** Free-shipping threshold in cents, if the retailer publishes one. */
  freeShippingThresholdCents: Cents.nullable(),
  /** Membership program name (e.g. "Prime", "Walmart+"), if any. */
  membershipName: z.string().nullable(),
});
export type RetailerSummary = z.infer<typeof RetailerSummary>;

export const RetailerListResponse = z.object({ items: z.array(RetailerSummary) });
export type RetailerListResponse = z.infer<typeof RetailerListResponse>;

export const RetailerDetailResponse = z.object({
  retailer: RetailerSummary.extend({
    websiteUrl: z.string().url(),
    returnPolicyUrl: z.string().url().nullable(),
    affiliateDisclosure: z.string().nullable(),
  }),
  topCategories: z.array(CategorySummary),
});
export type RetailerDetailResponse = z.infer<typeof RetailerDetailResponse>;

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export const ProductImage = z.object({
  url: z.string().url(),
  alt: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ProductImage = z.infer<typeof ProductImage>;

export const ProductIdentifierType = z.enum(["UPC", "EAN", "GTIN", "ISBN", "MPN", "ASIN", "SKU"]);
export type ProductIdentifierType = z.infer<typeof ProductIdentifierType>;

export const ProductIdentifier = z.object({
  type: ProductIdentifierType,
  value: z.string(),
  retailerSlug: Slug.nullable(),
});
export type ProductIdentifier = z.infer<typeof ProductIdentifier>;

export const ProductAttribute = z.object({
  group: z.string().nullable(),
  name: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
});
export type ProductAttribute = z.infer<typeof ProductAttribute>;

/** Card-sized product used in grids, rails, search results. */
/** Logos are trademarks of their owners, used nominatively; null when none is stored. */
export const LogoSource = z.enum(["official_site", "admin_upload", "logo_provider"]);
export type LogoSource = z.infer<typeof LogoSource>;

export const BrandRef = z.object({ slug: Slug, name: z.string(), logoUrl: z.string().url().nullable() });
export type BrandRef = z.infer<typeof BrandRef>;

export const ProductCard = z.object({
  id: Id,
  slug: Slug,
  title: z.string(),
  brand: BrandRef.nullable(),
  category: z.object({ slug: Slug, name: z.string() }).nullable(),
  condition: ProductCondition,
  image: ProductImage.nullable(),
  lowestPriceCents: Cents.nullable(),
  /** Lowest estimated total (price + shipping, excl. tax) in cents. */
  lowestTotalCents: Cents.nullable(),
  currency: z.string().length(3),
  storeCount: z.number().int().nonnegative(),
  inStock: z.boolean(),
  /** Drop vs 30-day median, as a ratio (0.12 = 12% below). null when insufficient history. */
  dropRatio: z.number().nullable(),
  dealScore: z.number().int().min(0).max(100).nullable(),
  /** True if any offer is demo data → UI must label "Demo data". */
  hasDemoData: z.boolean(),
  sponsored: z.boolean().default(false),
  updatedAt: IsoDateTime,
});
export type ProductCard = z.infer<typeof ProductCard>;

export const ShippingInfo = z.object({
  costCents: Cents.nullable(),
  /** "free" | "paid" | "unknown" | "threshold" (free above retailer threshold) */
  kind: z.enum(["free", "paid", "unknown", "threshold"]),
  estimatedDaysMin: z.number().int().nullable(),
  estimatedDaysMax: z.number().int().nullable(),
  pickupAvailable: z.boolean(),
});
export type ShippingInfo = z.infer<typeof ShippingInfo>;

export const TaxEstimate = z.object({
  /** null when ZIP is unknown. */
  amountCents: Cents.nullable(),
  rateBasisPoints: z.number().int().nullable(),
  status: z.enum(["estimated", "unknown_set_zip", "included", "not_applicable"]),
});
export type TaxEstimate = z.infer<typeof TaxEstimate>;

export const Offer = z.object({
  id: Id,
  retailer: z.object({
    id: Id,
    slug: Slug,
    name: z.string(),
    logoUrl: z.string().url().nullable(),
    brandColor: z.string().nullable(),
  }),
  title: z.string(),
  condition: ProductCondition,
  priceCents: Cents,
  listPriceCents: Cents.nullable(),
  currency: z.string().length(3),
  shipping: ShippingInfo,
  tax: TaxEstimate,
  /** price + shipping + estimated tax (tax 0 when unknown; see tax.status). */
  estimatedTotalCents: Cents,
  stock: StockStatus,
  couponCode: z.string().nullable(),
  couponDescription: z.string().nullable(),
  /** Relative path to outbound redirect: /v1/go/:offerId. Never the raw retailer URL. */
  goUrl: z.string(),
  isAffiliate: z.boolean(),
  source: DataSource,
  sponsored: z.boolean(),
  lastCheckedAt: IsoDateTime,
});
export type Offer = z.infer<typeof Offer>;

export const PriceStats = z.object({
  currentLowestCents: Cents.nullable(),
  allTimeLowCents: Cents.nullable(),
  allTimeLowAt: IsoDateTime.nullable(),
  allTimeHighCents: Cents.nullable(),
  avg30Cents: Cents.nullable(),
  median30Cents: Cents.nullable(),
  avg90Cents: Cents.nullable(),
  median90Cents: Cents.nullable(),
  min90Cents: Cents.nullable(),
  max90Cents: Cents.nullable(),
  /** Coefficient of variation over 90 days (stddev/mean). */
  volatility90: z.number().nullable(),
  /** Change vs 30 days ago as ratio (negative = cheaper). */
  change30Ratio: z.number().nullable(),
  /** Number of real observations backing the stats. */
  sampleSize: z.number().int().nonnegative(),
  firstObservedAt: IsoDateTime.nullable(),
});
export type PriceStats = z.infer<typeof PriceStats>;

export const DealTier = z.enum(["exceptional", "great", "good", "average", "poor"]);
export type DealTier = z.infer<typeof DealTier>;

export const DealScoreReason = z.object({
  factor: z.enum(["vs_median_90d", "near_all_time_low", "vs_other_stores", "retailer_trust", "freshness", "stock"]),
  /** Points contributed (0..weight). */
  points: z.number(),
  weight: z.number(),
  message: z.string(),
});
export type DealScoreReason = z.infer<typeof DealScoreReason>;

export const DealScore = z.object({
  score: z.number().int().min(0).max(100),
  tier: DealTier,
  /** 0..1 — low when history is short or few stores. */
  confidence: z.number().min(0).max(1),
  reasons: z.array(DealScoreReason),
});
export type DealScore = z.infer<typeof DealScore>;

export const FakeDiscount = z.object({
  flag: z.boolean(),
  /** Neutral wording, e.g. "Advertised 40% off, but only 8% below the 90-day median." */
  message: z.string().nullable(),
  advertisedDiscountRatio: z.number().nullable(),
  actualVsMedian90Ratio: z.number().nullable(),
});
export type FakeDiscount = z.infer<typeof FakeDiscount>;

export const ProductVariantLink = z.object({
  slug: Slug,
  label: z.string(),
  attributes: z.record(z.string(), z.string()),
  condition: ProductCondition,
  lowestPriceCents: Cents.nullable(),
  current: z.boolean(),
});
export type ProductVariantLink = z.infer<typeof ProductVariantLink>;

export const ProductDetail = z.object({
  id: Id,
  slug: Slug,
  title: z.string(),
  description: z.string().nullable(),
  brand: BrandRef.nullable(),
  category: z.object({ slug: Slug, name: z.string() }).nullable(),
  breadcrumbs: z.array(z.object({ name: z.string(), slug: Slug })),
  model: z.string().nullable(),
  mpn: z.string().nullable(),
  condition: ProductCondition,
  images: z.array(ProductImage),
  identifiers: z.array(ProductIdentifier),
  attributes: z.array(ProductAttribute),
  variants: z.array(ProductVariantLink),
  releasedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type ProductDetail = z.infer<typeof ProductDetail>;

export const ProductDetailQuery = z.object({ zip: z.string().optional() });

export const ProductDetailResponse = z.object({
  product: ProductDetail,
  offers: z.array(Offer),
  lowestOfferId: Id.nullable(),
  storeCount: z.number().int().nonnegative(),
  priceStats: PriceStats,
  dealScore: DealScore.nullable(),
  fakeDiscount: FakeDiscount,
  hasDemoData: z.boolean(),
  /** Active coupons that apply (store-wide, or scoped to this product/category) at the stores carrying it. */
  coupons: z.array(Coupon),
  related: z.array(ProductCard),
  lastUpdatedAt: IsoDateTime,
});
export type ProductDetailResponse = z.infer<typeof ProductDetailResponse>;

export const HistoryRange = z.enum(["7d", "30d", "90d", "180d", "365d", "all"]);
export type HistoryRange = z.infer<typeof HistoryRange>;

export const ProductHistoryQuery = z.object({
  range: HistoryRange.default("90d"),
  retailer: Slug.optional(),
});
export type ProductHistoryQuery = z.infer<typeof ProductHistoryQuery>;

/** A real observation. No interpolation: gaps stay gaps. */
export const PriceHistoryPoint = z.object({
  t: IsoDateTime,
  priceCents: Cents,
  shippingCents: Cents.nullable(),
  stock: StockStatus,
});
export type PriceHistoryPoint = z.infer<typeof PriceHistoryPoint>;

export const PriceHistorySeries = z.object({
  retailer: z.object({ slug: Slug, name: z.string(), brandColor: z.string().nullable() }),
  offerId: Id,
  source: DataSource,
  points: z.array(PriceHistoryPoint),
});
export type PriceHistorySeries = z.infer<typeof PriceHistorySeries>;

export const ProductHistoryResponse = z.object({
  productId: Id,
  range: HistoryRange,
  currency: z.string().length(3),
  series: z.array(PriceHistorySeries),
  /** Daily lowest across retailers, only days with observations. */
  lowest: z.array(z.object({ t: IsoDateTime, priceCents: Cents })),
  stats: PriceStats,
});
export type ProductHistoryResponse = z.infer<typeof ProductHistoryResponse>;

export const CompareQuery = z.object({
  ids: z
    .string()
    .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(Id).min(2).max(4)),
});
export type CompareQuery = z.infer<typeof CompareQuery>;

export const CompareResponse = z.object({
  products: z.array(
    z.object({
      card: ProductCard,
      attributes: z.array(ProductAttribute),
      priceStats: PriceStats,
      dealScore: DealScore.nullable(),
    }),
  ),
  /** Union of attribute names in display order. */
  attributeKeys: z.array(z.object({ group: z.string().nullable(), name: z.string() })),
});
export type CompareResponse = z.infer<typeof CompareResponse>;

/* ------------------------------------------------------------------ */
/* Deals / price drops                                                 */
/* ------------------------------------------------------------------ */

export const DealsQuery = PaginationQuery.extend({
  sort: z.enum(["score", "drop", "newest", "price_asc"]).default("score"),
  category: Slug.optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
});
export type DealsQuery = z.infer<typeof DealsQuery>;

export const DealItem = z.object({
  product: ProductCard,
  offer: Offer,
  dealScore: DealScore,
  fakeDiscount: FakeDiscount,
});
export type DealItem = z.infer<typeof DealItem>;

export const DealsResponse = paginated(DealItem);
export type DealsResponse = z.infer<typeof DealsResponse>;

export const PriceDropsQuery = PaginationQuery.extend({
  category: Slug.optional(),
  window: z.enum(["24h", "7d", "30d"]).default("7d"),
  minDropRatio: z.coerce.number().min(0).max(1).optional(),
});
export type PriceDropsQuery = z.infer<typeof PriceDropsQuery>;

export const PriceDropItem = z.object({
  product: ProductCard,
  previousPriceCents: Cents,
  currentPriceCents: Cents,
  dropCents: Cents,
  dropRatio: z.number(),
  retailer: z.object({ slug: Slug, name: z.string() }),
  droppedAt: IsoDateTime,
  source: DataSource,
});
export type PriceDropItem = z.infer<typeof PriceDropItem>;

export const PriceDropsResponse = paginated(PriceDropItem);
export type PriceDropsResponse = z.infer<typeof PriceDropsResponse>;
