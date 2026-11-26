import { z } from "zod";
import { Cents, Id, IsoDateTime, MAX_PAGE_SIZE, PaginationQuery, Slug, paginated } from "./common";

export const CouponDiscountType = z.enum(["percent", "amount", "free_shipping", "bogo", "other"]);
export type CouponDiscountType = z.infer<typeof CouponDiscountType>;
export const CouponSource = z.enum(["api", "feed", "affiliate", "merchant", "community", "admin", "demo"]);
export type CouponSource = z.infer<typeof CouponSource>;
export const CouponStatus = z.enum(["active", "expired", "unverified", "reported", "pending_approval", "rejected"]);
export type CouponStatus = z.infer<typeof CouponStatus>;
export const CouponChannel = z.enum(["web", "extension", "mobile"]);
export type CouponChannel = z.infer<typeof CouponChannel>;

export const CouponRetailer = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  logoUrl: z.string().url().nullable(),
  brandColor: z.string().nullable(),
});

export const Coupon = z.object({
  id: Id,
  retailer: CouponRetailer,
  /** null for deal-type promos (no code needed). `source: "demo"` codes are prefixed DEMO and are not real. */
  code: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  discountType: CouponDiscountType,
  /** Basis points for percent, cents for amount; null otherwise. */
  discountValue: z.number().int().nullable(),
  minSpendCents: Cents.nullable(),
  scope: z.object({ categorySlug: Slug.nullable(), productSlug: Slug.nullable() }),
  startsAt: IsoDateTime.nullable(),
  expiresAt: IsoDateTime.nullable(),
  source: CouponSource,
  status: CouponStatus,
  /** Stats from real usage reports only (null = no data yet). */
  stats: z.object({
    successRate: z.number().min(0).max(1).nullable(),
    successCount: z.number().int(),
    failCount: z.number().int(),
    lastWorkedAt: IsoDateTime.nullable(),
    lastVerifiedAt: IsoDateTime.nullable(),
    avgSavingsCents: Cents.nullable(),
  }),
  /** Relative outbound redirect /v1/coupons/:id/go. */
  goUrl: z.string(),
  createdAt: IsoDateTime,
});
export type Coupon = z.infer<typeof Coupon>;

export const CouponListQuery = PaginationQuery.extend({
  retailer: Slug.optional(),
  category: Slug.optional(),
  sort: z.enum(["newest", "expiring", "popular", "success_rate"]).default("newest"),
  status: z.enum(["active", "unverified", "expired", "all_live"]).default("all_live"),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});
export type CouponListQuery = z.infer<typeof CouponListQuery>;
export const RetailerCouponQuery = CouponListQuery.omit({ retailer: true });

export const CouponListResponse = paginated(Coupon);
export type CouponListResponse = z.infer<typeof CouponListResponse>;

/** Community submission (signed-in users). Duplicate retailer+code returns the existing coupon. */
export const SubmitCouponRequest = z.object({
  retailerSlug: Slug,
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).nullable(),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().max(1000).optional(),
  discountType: CouponDiscountType,
  discountValue: z.number().int().positive().nullable().optional(),
  minSpendCents: Cents.nonnegative().nullable().optional(),
  expiresAt: IsoDateTime.nullable().optional(),
});
export type SubmitCouponRequest = z.infer<typeof SubmitCouponRequest>;

export const CouponResultRequest = z.object({
  worked: z.boolean(),
  orderTotalCents: Cents.nonnegative().optional(),
  savingsCents: Cents.nonnegative().optional(),
  source: CouponChannel.default("web"),
  /** Stable per-install random id (extension/mobile); hashed server-side, never stored raw. */
  deviceId: z.string().min(8).max(128).optional(),
});
export type CouponResultRequest = z.infer<typeof CouponResultRequest>;

export const CouponResultResponse = z.object({
  recorded: z.boolean(),
  /** Why a report was ignored (e.g. duplicate from the same device within 24 h). */
  reason: z.string().nullable(),
  coupon: Coupon,
});
export type CouponResultResponse = z.infer<typeof CouponResultResponse>;

export const CouponVoteRequest = z.object({ worked: z.boolean() });

export const RetailerCouponStats = z.object({
  retailer: CouponRetailer,
  activeCount: z.number().int(),
  unverifiedCount: z.number().int(),
  /** Average savings of successful reports in the last 90 days (null = none). */
  avgSavingsCents: Cents.nullable(),
  successRate90d: z.number().min(0).max(1).nullable(),
  reports30d: z.object({ worked: z.number().int(), failed: z.number().int() }),
  lastWorkedAt: IsoDateTime.nullable(),
  bestRecent: Coupon.nullable(),
  history: z.array(z.object({ type: z.enum(["created", "activated", "worked", "failed", "expired", "reported", "status_changed"]), couponId: Id.nullable(), at: IsoDateTime })),
});
export type RetailerCouponStats = z.infer<typeof RetailerCouponStats>;

export const CouponFollow = z.object({ retailer: CouponRetailer, activeCoupons: z.number().int(), createdAt: IsoDateTime });
export type CouponFollow = z.infer<typeof CouponFollow>;
export const CouponFollowListResponse = z.object({ items: z.array(CouponFollow) });
export type CouponFollowListResponse = z.infer<typeof CouponFollowListResponse>;
export const CreateCouponFollowRequest = z.object({ retailerSlug: Slug });
export const RetailerSlugParam = z.object({ retailerSlug: Slug });

/* Admin / merchant */
export const AdminCouponListQuery = PaginationQuery.extend({
  q: z.string().max(200).optional(),
  status: CouponStatus.optional(),
  retailer: Slug.optional(),
  source: CouponSource.optional(),
});
export type AdminCouponListQuery = z.infer<typeof AdminCouponListQuery>;

export const AdminCoupon = Coupon.extend({
  createdBy: z.object({ id: Id, email: z.string() }).nullable(),
  merchantAccountId: Id.nullable(),
  affiliateUrl: z.string().nullable(),
});
export type AdminCoupon = z.infer<typeof AdminCoupon>;
export const AdminCouponListResponse = paginated(AdminCoupon);
export type AdminCouponListResponse = z.infer<typeof AdminCouponListResponse>;

export const UpsertCouponFields = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  discountType: CouponDiscountType,
  discountValue: z.number().int().positive().nullable().optional(),
  minSpendCents: Cents.nonnegative().nullable().optional(),
  categoryId: Id.nullable().optional(),
  productId: Id.nullable().optional(),
  startsAt: IsoDateTime.nullable().optional(),
  expiresAt: IsoDateTime.nullable().optional(),
  affiliateUrl: z.string().url().nullable().optional(),
});
export const AdminCreateCouponRequest = UpsertCouponFields.extend({
  retailerId: Id,
  status: CouponStatus.default("active"),
});
export type AdminCreateCouponRequest = z.infer<typeof AdminCreateCouponRequest>;
export const AdminUpdateCouponRequest = UpsertCouponFields.partial().extend({ status: CouponStatus.optional() });
export type AdminUpdateCouponRequest = z.infer<typeof AdminUpdateCouponRequest>;
export const MerchantCreateCouponRequest = UpsertCouponFields;
export type MerchantCreateCouponRequest = z.infer<typeof MerchantCreateCouponRequest>;

/* Browser extension */
export const CheckoutConfig = z.object({
  retailerSlug: Slug,
  retailerName: z.string(),
  hostPatterns: z.array(z.string()),
  checkoutUrlPatterns: z.array(z.string()),
  couponInputSelector: z.string().nullable(),
  applyButtonSelector: z.string().nullable(),
  totalSelector: z.string().nullable(),
  successIndicatorSelector: z.string().nullable(),
  errorIndicatorSelector: z.string().nullable(),
  removeButtonSelector: z.string().nullable(),
  version: z.number().int(),
});
export type CheckoutConfig = z.infer<typeof CheckoutConfig>;
export const ExtensionConfigResponse = z.object({ version: z.string(), configs: z.array(CheckoutConfig), generatedAt: IsoDateTime });
export type ExtensionConfigResponse = z.infer<typeof ExtensionConfigResponse>;

export const ExtensionCouponsQuery = z.object({ host: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+$/).max(253) });
export const ExtensionCouponsResponse = z.object({ retailer: CouponRetailer.nullable(), coupons: z.array(Coupon) });
export type ExtensionCouponsResponse = z.infer<typeof ExtensionCouponsResponse>;

export const AdminCheckoutConfig = CheckoutConfig.extend({ id: Id, retailerId: Id, enabled: z.boolean(), updatedAt: IsoDateTime });
export type AdminCheckoutConfig = z.infer<typeof AdminCheckoutConfig>;
export const AdminCheckoutConfigListResponse = z.object({ items: z.array(AdminCheckoutConfig) });
export const AdminUpsertCheckoutConfigRequest = z.object({
  hostPatterns: z.array(z.string().regex(/^[a-z0-9.*-]+$/).max(253)).max(20).optional(),
  checkoutUrlPatterns: z.array(z.string().max(300)).max(20).optional(),
  couponInputSelector: z.string().max(300).nullable().optional(),
  applyButtonSelector: z.string().max(300).nullable().optional(),
  totalSelector: z.string().max(300).nullable().optional(),
  successIndicatorSelector: z.string().max(300).nullable().optional(),
  errorIndicatorSelector: z.string().max(300).nullable().optional(),
  removeButtonSelector: z.string().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type AdminUpsertCheckoutConfigRequest = z.infer<typeof AdminUpsertCheckoutConfigRequest>;
