import { z } from "zod";
import {
  Cents,
  DataSource,
  Email,
  Id,
  IsoDateTime,
  PaginationQuery,
  ProductCondition,
  Slug,
  StockStatus,
  paginated,
} from "./common";

export const MerchantProfile = z.object({
  id: Id,
  companyName: z.string(),
  contactEmail: Email,
  website: z.string().url().nullable(),
  retailer: z.object({ id: Id, slug: Slug, name: z.string() }).nullable(),
  verificationStatus: z.enum(["unverified", "pending", "verified", "rejected"]),
  createdAt: IsoDateTime,
});
export type MerchantProfile = z.infer<typeof MerchantProfile>;

export const UpdateMerchantProfileRequest = z.object({
  companyName: z.string().min(2).max(120).optional(),
  contactEmail: Email.optional(),
  website: z.string().url().nullable().optional(),
});
export type UpdateMerchantProfileRequest = z.infer<typeof UpdateMerchantProfileRequest>;

export const FeedFormat = z.enum(["csv", "xml", "json"]);

export const MerchantFeed = z.object({
  id: Id,
  name: z.string(),
  format: FeedFormat,
  status: z.enum(["queued", "processing", "completed", "failed"]),
  rowsTotal: z.number().int().nullable(),
  rowsAccepted: z.number().int().nullable(),
  rowsRejected: z.number().int().nullable(),
  errors: z.array(z.object({ row: z.number().int(), field: z.string().nullable(), message: z.string() })),
  uploadedAt: IsoDateTime,
  completedAt: IsoDateTime.nullable(),
});
export type MerchantFeed = z.infer<typeof MerchantFeed>;
export const MerchantFeedListResponse = paginated(MerchantFeed);
export type MerchantFeedListResponse = z.infer<typeof MerchantFeedListResponse>;

/** Columns expected in a merchant CSV feed (header row). Prices as decimal strings, converted to cents server-side. */
export const MERCHANT_FEED_COLUMNS = [
  "sku",
  "title",
  "brand",
  "gtin",
  "mpn",
  "condition",
  "price",
  "list_price",
  "shipping",
  "stock",
  "url",
  "image_url",
  "category",
] as const;

/** One parsed feed row after validation. */
export const MerchantFeedRow = z.object({
  sku: z.string().min(1).max(100),
  title: z.string().min(2).max(300),
  brand: z.string().max(100).optional(),
  gtin: z.string().regex(/^\d{8,14}$/).optional(),
  mpn: z.string().max(100).optional(),
  condition: ProductCondition.default("new"),
  priceCents: Cents.positive(),
  listPriceCents: Cents.positive().optional(),
  shippingCents: Cents.nonnegative().optional(),
  stock: StockStatus.default("in_stock"),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  category: z.string().max(200).optional(),
});
export type MerchantFeedRow = z.infer<typeof MerchantFeedRow>;

/** Multipart upload metadata (file sent as `file` field). */
export const MerchantFeedUploadRequest = z.object({
  name: z.string().min(1).max(120),
  format: FeedFormat.default("csv"),
});
export type MerchantFeedUploadRequest = z.infer<typeof MerchantFeedUploadRequest>;

export const MerchantOffer = z.object({
  id: Id,
  sku: z.string().nullable(),
  title: z.string(),
  productSlug: Slug.nullable(),
  matchStatus: z.enum(["matched", "pending_review", "unmatched"]),
  priceCents: Cents,
  shippingCents: Cents.nullable(),
  stock: StockStatus,
  condition: ProductCondition,
  source: DataSource,
  isActive: z.boolean(),
  updatedAt: IsoDateTime,
});
export type MerchantOffer = z.infer<typeof MerchantOffer>;
export const MerchantOfferListResponse = paginated(MerchantOffer);
export type MerchantOfferListResponse = z.infer<typeof MerchantOfferListResponse>;
export const MerchantOfferListQuery = PaginationQuery.extend({ q: z.string().max(200).optional() });

export const UpdateMerchantOfferRequest = z.object({
  priceCents: Cents.positive().optional(),
  shippingCents: Cents.nonnegative().nullable().optional(),
  stock: StockStatus.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateMerchantOfferRequest = z.infer<typeof UpdateMerchantOfferRequest>;

export const MerchantAnalyticsResponse = z.object({
  range: z.enum(["7d", "30d", "90d"]),
  impressions: z.number().int(),
  clicks: z.number().int(),
  ctr: z.number(),
  conversions: z.number().int(),
  revenueCents: Cents,
  topProducts: z.array(z.object({ productSlug: Slug, title: z.string(), clicks: z.number().int() })),
  series: z.array(z.object({ t: IsoDateTime, clicks: z.number().int(), impressions: z.number().int() })),
});
export type MerchantAnalyticsResponse = z.infer<typeof MerchantAnalyticsResponse>;

export const ApiKeySummary = z.object({
  id: Id,
  name: z.string(),
  /** First chars only, e.g. "pk_live_ab12". The full key is shown once at creation. */
  prefix: z.string(),
  scopes: z.array(z.string()),
  lastUsedAt: IsoDateTime.nullable(),
  revokedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type ApiKeySummary = z.infer<typeof ApiKeySummary>;
export const ApiKeyListResponse = z.object({ items: z.array(ApiKeySummary) });
export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponse>;
export const CreateApiKeyRequest = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(["offers:read", "offers:write", "feeds:write", "analytics:read"])).min(1),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;
export const CreateApiKeyResponse = z.object({ key: ApiKeySummary, secret: z.string() });
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponse>;
