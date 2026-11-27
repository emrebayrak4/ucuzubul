import { z } from "zod";
import {
  Cents,
  DataSource,
  Email,
  Id,
  IntegrationStatus,
  IsoDateTime,
  PaginationQuery,
  ProductCondition,
  Role,
  Slug,
  StockStatus,
  paginated,
} from "./common";

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export const AdminStatsQuery = z.object({ range: z.enum(["24h", "7d", "30d", "90d"]).default("7d") });
export type AdminStatsQuery = z.infer<typeof AdminStatsQuery>;

export const QueueStats = z.object({
  name: z.string(),
  waiting: z.number().int(),
  active: z.number().int(),
  failed: z.number().int(),
  delayed: z.number().int(),
  /** false when Redis is unreachable (counts are 0). */
  available: z.boolean(),
});
export type QueueStats = z.infer<typeof QueueStats>;

export const TimeSeriesPoint = z.object({ t: IsoDateTime, value: z.number() });

export const AdminStatsResponse = z.object({
  range: z.enum(["24h", "7d", "30d", "90d"]),
  totals: z.object({
    users: z.number().int(),
    newUsers: z.number().int(),
    products: z.number().int(),
    offers: z.number().int(),
    demoOffers: z.number().int(),
    retailers: z.number().int(),
    liveIntegrations: z.number().int(),
    activeAlerts: z.number().int(),
    searches: z.number().int(),
    affiliateClicks: z.number().int(),
    conversions: z.number().int(),
    commissionCents: Cents,
    pendingMatchReviews: z.number().int(),
    openIntegrationErrors: z.number().int(),
  }),
  series: z.object({
    searches: z.array(TimeSeriesPoint),
    clicks: z.array(TimeSeriesPoint),
    signups: z.array(TimeSeriesPoint),
  }),
  topSearches: z.array(z.object({ query: z.string(), count: z.number().int(), zeroResults: z.boolean() })),
  dataFreshness: z.object({
    newestOfferCheckAt: IsoDateTime.nullable(),
    oldestActiveOfferCheckAt: IsoDateTime.nullable(),
    staleOffers24h: z.number().int(),
  }),
  queues: z.array(QueueStats),
  generatedAt: IsoDateTime,
});
export type AdminStatsResponse = z.infer<typeof AdminStatsResponse>;

/* ------------------------------------------------------------------ */
/* Generic admin list query                                            */
/* ------------------------------------------------------------------ */

export const AdminListQuery = PaginationQuery.extend({
  q: z.string().trim().max(200).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type AdminListQuery = z.infer<typeof AdminListQuery>;

/* Users */
export const AdminUser = z.object({
  id: Id,
  email: Email,
  name: z.string().nullable(),
  role: Role,
  status: z.enum(["active", "suspended", "deleted"]),
  emailVerified: z.boolean(),
  createdAt: IsoDateTime,
  lastLoginAt: IsoDateTime.nullable(),
});
export type AdminUser = z.infer<typeof AdminUser>;
export const AdminUserListResponse = paginated(AdminUser);
export type AdminUserListResponse = z.infer<typeof AdminUserListResponse>;
export const AdminUpdateUserRequest = z.object({
  role: Role.optional(),
  status: z.enum(["active", "suspended"]).optional(),
  name: z.string().max(100).optional(),
});
export type AdminUpdateUserRequest = z.infer<typeof AdminUpdateUserRequest>;

/* Products */
export const AdminProduct = z.object({
  id: Id,
  slug: Slug,
  title: z.string(),
  brandName: z.string().nullable(),
  categorySlug: Slug.nullable(),
  condition: ProductCondition,
  status: z.enum(["active", "draft", "archived"]),
  offerCount: z.number().int(),
  lowestPriceCents: Cents.nullable(),
  isDemo: z.boolean(),
  brandId: Id.nullable(),
  categoryId: Id.nullable(),
  updatedAt: IsoDateTime,
});
export type AdminProduct = z.infer<typeof AdminProduct>;
export const AdminProductListResponse = paginated(AdminProduct);
export type AdminProductListResponse = z.infer<typeof AdminProductListResponse>;
export const AdminProductDetail = AdminProduct.extend({
  description: z.string().nullable(),
  model: z.string().nullable(),
  mpn: z.string().nullable(),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })),
  attributes: z.array(z.object({ group: z.string().nullable(), name: z.string(), value: z.string(), unit: z.string().nullable() })),
});
export type AdminProductDetail = z.infer<typeof AdminProductDetail>;

/* Brands */
export const AdminBrand = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  website: z.string().nullable(),
  productCount: z.number().int(),
  logoUrl: z.string().url().nullable(),
  logoSource: z.enum(["official_site", "admin_upload", "logo_provider"]).nullable(),
  logoUpdatedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type AdminBrand = z.infer<typeof AdminBrand>;
export const AdminBrandListResponse = paginated(AdminBrand);
export type AdminBrandListResponse = z.infer<typeof AdminBrandListResponse>;
export const AdminUpsertBrandRequest = z.object({
  name: z.string().min(1).max(100),
  slug: Slug.optional(),
  website: z.string().url().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type AdminUpsertBrandRequest = z.infer<typeof AdminUpsertBrandRequest>;

/* Categories (admin view incl. inactive) */
export const AdminCategory = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  parentId: Id.nullable(),
  path: z.string(),
  depth: z.number().int(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  productCount: z.number().int(),
});
export type AdminCategory = z.infer<typeof AdminCategory>;
export const AdminCategoryListResponse = z.object({ items: z.array(AdminCategory) });
export type AdminCategoryListResponse = z.infer<typeof AdminCategoryListResponse>;
export const AdminUpsertProductRequest = z.object({
  title: z.string().min(2).max(300),
  slug: Slug.optional(),
  brandId: Id.nullable().optional(),
  categoryId: Id.nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
  mpn: z.string().max(120).nullable().optional(),
  condition: ProductCondition.default("new"),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  attributes: z.array(z.object({ group: z.string().nullable().optional(), name: z.string(), value: z.string(), unit: z.string().nullable().optional() })).optional(),
});
export type AdminUpsertProductRequest = z.infer<typeof AdminUpsertProductRequest>;

/* Categories */
export const AdminUpsertCategoryRequest = z.object({
  name: z.string().min(1).max(80),
  slug: Slug.optional(),
  parentId: Id.nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export type AdminUpsertCategoryRequest = z.infer<typeof AdminUpsertCategoryRequest>;

/* Retailers */
export const AdminRetailer = z.object({
  id: Id,
  slug: Slug,
  name: z.string(),
  domain: z.string(),
  integrationStatus: IntegrationStatus,
  isActive: z.boolean(),
  offerCount: z.number().int(),
  lastIngestAt: IsoDateTime.nullable(),
  errorCount24h: z.number().int(),
  brandColor: z.string().nullable(),
  freeShippingThresholdCents: Cents.nullable(),
  allowedRedirectHosts: z.array(z.string()),
  logoUrl: z.string().url().nullable(),
  logoSource: z.enum(["official_site", "admin_upload", "logo_provider"]).nullable(),
  logoUpdatedAt: IsoDateTime.nullable(),
});
export type AdminRetailer = z.infer<typeof AdminRetailer>;
export const AdminRetailerListResponse = paginated(AdminRetailer);
export type AdminRetailerListResponse = z.infer<typeof AdminRetailerListResponse>;
export const AdminUpdateRetailerRequest = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  freeShippingThresholdCents: Cents.nullable().optional(),
  allowedRedirectHosts: z.array(z.string()).optional(),
});
export type AdminUpdateRetailerRequest = z.infer<typeof AdminUpdateRetailerRequest>;

/* Offers */
export const AdminOffer = z.object({
  id: Id,
  productSlug: Slug,
  productTitle: z.string(),
  retailerSlug: Slug,
  priceCents: Cents,
  shippingCents: Cents.nullable(),
  stock: StockStatus,
  condition: ProductCondition,
  source: DataSource,
  isActive: z.boolean(),
  lastCheckedAt: IsoDateTime,
});
export type AdminOffer = z.infer<typeof AdminOffer>;
export const AdminOfferListResponse = paginated(AdminOffer);
export type AdminOfferListResponse = z.infer<typeof AdminOfferListResponse>;
export const AdminOfferListQuery = AdminListQuery.extend({
  retailer: Slug.optional(),
  source: DataSource.optional(),
});
export type AdminOfferListQuery = z.infer<typeof AdminOfferListQuery>;

/* Matches */
export const MatchStatus = z.enum(["auto_matched", "pending_review", "approved", "rejected"]);
export type MatchStatus = z.infer<typeof MatchStatus>;
export const AdminMatch = z.object({
  id: Id,
  candidateTitle: z.string(),
  retailerSlug: Slug,
  productId: Id.nullable(),
  productTitle: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  method: z.enum(["gtin", "brand_mpn", "attributes", "semantic", "manual"]),
  status: MatchStatus,
  conflicts: z.array(z.string()),
  createdAt: IsoDateTime,
});
export type AdminMatch = z.infer<typeof AdminMatch>;
export const AdminMatchListResponse = paginated(AdminMatch);
export type AdminMatchListResponse = z.infer<typeof AdminMatchListResponse>;
export const AdminMatchListQuery = AdminListQuery.extend({ status: MatchStatus.optional() });
export type AdminMatchListQuery = z.infer<typeof AdminMatchListQuery>;
export const AdminReviewMatchRequest = z.object({
  /** split = detach the listing into a new canonical product (created from the candidate data). */
  decision: z.enum(["approve", "reject", "reassign", "split"]),
  productId: Id.optional(),
  note: z.string().max(1000).optional(),
});
export type AdminReviewMatchRequest = z.infer<typeof AdminReviewMatchRequest>;

/* Anomalies */
export const AdminAnomaly = z.object({
  id: Id,
  kind: z.enum(["price_spike", "price_drop_outlier", "stale_offer", "fake_discount", "feed_error"]),
  severity: z.enum(["low", "medium", "high"]),
  offerId: Id.nullable(),
  productSlug: Slug.nullable(),
  retailerSlug: Slug.nullable(),
  message: z.string(),
  detectedAt: IsoDateTime,
  resolvedAt: IsoDateTime.nullable(),
});
export type AdminAnomaly = z.infer<typeof AdminAnomaly>;
export const AdminAnomalyListResponse = paginated(AdminAnomaly);
export type AdminAnomalyListResponse = z.infer<typeof AdminAnomalyListResponse>;
export const AdminAnomalyListQuery = AdminListQuery.extend({ status: z.enum(["open", "resolved", "all"]).default("open") });
export type AdminAnomalyListQuery = z.infer<typeof AdminAnomalyListQuery>;
export const AdminResolveAnomalyRequest = z.object({ note: z.string().max(1000).optional() });
export type AdminResolveAnomalyRequest = z.infer<typeof AdminResolveAnomalyRequest>;
export const AdminUpdateOfferRequest = z.object({ isActive: z.boolean() });
export type AdminUpdateOfferRequest = z.infer<typeof AdminUpdateOfferRequest>;

/* Feature flags */
export const FeatureFlag = z.object({
  key: z.string().regex(/^[a-z0-9_.-]+$/),
  description: z.string().nullable(),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100),
  updatedAt: IsoDateTime,
});
export type FeatureFlag = z.infer<typeof FeatureFlag>;
export const FeatureFlagListResponse = z.object({ items: z.array(FeatureFlag) });
export type FeatureFlagListResponse = z.infer<typeof FeatureFlagListResponse>;
export const UpdateFeatureFlagRequest = z.object({
  enabled: z.boolean().optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});
export type UpdateFeatureFlagRequest = z.infer<typeof UpdateFeatureFlagRequest>;

/* Audit logs */
export const AuditLogEntry = z.object({
  id: Id,
  actor: z.object({ id: Id, email: Email }).nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  diff: z.unknown().nullable(),
  ip: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;
export const AuditLogListResponse = paginated(AuditLogEntry);
export type AuditLogListResponse = z.infer<typeof AuditLogListResponse>;

/* ------------------------------------------------------------------ */
/* Integrations (admin-managed credentials)                            */
/* ------------------------------------------------------------------ */

export const IntegrationGroup = z.enum(["retail", "affiliate", "travel_flight", "travel_hotel", "auth", "payments", "email", "ai", "monitoring", "branding"]);
export type IntegrationGroup = z.infer<typeof IntegrationGroup>;

export const AdminIntegrationField = z.object({
  key: z.string(),
  label: z.string(),
  secret: z.boolean(),
  required: z.boolean(),
  help: z.string().nullable(),
  isSet: z.boolean(),
  /** Where the effective value comes from. */
  source: z.enum(["db", "env"]).nullable(),
  /** Secret fields: "••••1234" (never the value). Non-secret fields: the value itself. null when unset. */
  masked: z.string().nullable(),
});
export type AdminIntegrationField = z.infer<typeof AdminIntegrationField>;

export const AdminIntegrationStatus = z.enum(["live", "configured", "pending_configuration", "error", "disabled"]);
export const IntegrationTestStatus = z.enum(["live", "unverified", "pending_configuration", "error"]);

export const AdminIntegration = z.object({
  id: z.string(),
  name: z.string(),
  group: IntegrationGroup,
  adapterId: z.string().nullable(),
  status: AdminIntegrationStatus,
  enabled: z.boolean(),
  hasStoredCredentials: z.boolean(),
  fields: z.array(AdminIntegrationField),
  docsUrl: z.string().nullable(),
  goLive: z.string(),
  notes: z.string(),
  lastTest: z
    .object({ at: IsoDateTime, status: IntegrationTestStatus, message: z.string().nullable(), latencyMs: z.number().int().nullable() })
    .nullable(),
  updatedAt: IsoDateTime.nullable(),
  updatedBy: z.object({ id: Id, email: Email }).nullable(),
  /** Error reading stored credentials (e.g. encryption key rotated). */
  error: z.string().nullable(),
});
export type AdminIntegration = z.infer<typeof AdminIntegration>;

export const AdminIntegrationListResponse = z.object({ items: z.array(AdminIntegration), encryptionConfigured: z.boolean() });
export type AdminIntegrationListResponse = z.infer<typeof AdminIntegrationListResponse>;

export const IntegrationIdParam = z.object({ id: z.string().regex(/^[a-z0-9_]+$/).max(64) });

/** Field semantics: omitted or "" = keep existing; null = clear the stored value (env fallback applies). */
export const AdminUpdateIntegrationRequest = z.object({
  fields: z.record(z.string(), z.string().max(8192).nullable()).default({}),
  enabled: z.boolean().optional(),
});
export type AdminUpdateIntegrationRequest = z.infer<typeof AdminUpdateIntegrationRequest>;

export const AdminIntegrationTestResponse = z.object({
  id: z.string(),
  status: IntegrationTestStatus,
  message: z.string(),
  latencyMs: z.number().int().nullable(),
  testedAt: IsoDateTime,
});
export type AdminIntegrationTestResponse = z.infer<typeof AdminIntegrationTestResponse>;

/* Logos (multipart upload, field `file`, ≤ 512 KB, PNG/WebP/ICO/SVG) */
export const AdminLogoUploadRequest = z.object({});
export const AdminLogoResponse = z.object({
  logoUrl: z.string().url().nullable(),
  logoSource: z.enum(["official_site", "admin_upload", "logo_provider"]).nullable(),
  logoUpdatedAt: IsoDateTime.nullable(),
});
export type AdminLogoResponse = z.infer<typeof AdminLogoResponse>;

/* Affiliate programs (network advertiser ↔ retailer mapping) + network ingestion runs */
export const AffiliateNetworkId = z.enum(["amazon_associates", "cj", "impact", "awin", "rakuten", "partnerize", "ebay_partner", "walmart", "travelpayouts", "booking", "expedia", "direct",
  // Added with migration markets_multi_market (DB enum values; no adapters).
  "tradedoubler", "adtraction", "webgains", "tradetracker", "daisycon", "effinity", "commission_factory", "valuecommerce", "a8net", "rakuten_jp", "moshimo", "admitad", "gelir_ortakligi", "lomadee", "afilio"]);
export const AdminAffiliateProgram = z.object({
  id: Id,
  network: AffiliateNetworkId,
  externalId: z.string().nullable(),
  name: z.string(),
  retailer: z.object({ id: Id, slug: z.string(), name: z.string() }).nullable(),
  status: IntegrationStatus,
  isActive: z.boolean(),
  commissionRateBp: z.number().int().nullable(),
  cookieDays: z.number().int().nullable(),
  conversions: z.number().int(),
  createdAt: IsoDateTime,
});
export type AdminAffiliateProgram = z.infer<typeof AdminAffiliateProgram>;
export const AdminAffiliateProgramListQuery = z.object({
  network: AffiliateNetworkId.optional(),
  unmapped: z.enum(["true", "false"]).optional(),
});
export const AdminAffiliateProgramListResponse = z.object({ items: z.array(AdminAffiliateProgram) });
export type AdminAffiliateProgramListResponse = z.infer<typeof AdminAffiliateProgramListResponse>;
export const AffiliateProgramIdParam = z.object({ id: Id });
/** retailerSlug null = unlink. Linking sets status live; unlinked programs stay pending_configuration. */
export const AdminUpdateAffiliateProgramRequest = z.object({
  retailerSlug: z.string().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
  commissionRateBp: z.number().int().min(0).max(10_000).nullable().optional(),
  cookieDays: z.number().int().min(0).max(365).nullable().optional(),
});
export type AdminUpdateAffiliateProgramRequest = z.infer<typeof AdminUpdateAffiliateProgramRequest>;
export const NetworkRunParam = z.object({ network: z.enum(["cj", "impact", "rakuten", "awin", "partnerize", "ebay_partner"]) });
export const AdminNetworkRunRequest = z.object({ kind: z.enum(["coupons", "products", "conversions"]) });
export const AdminNetworkRunResponse = z.object({ queued: z.boolean(), jobId: z.string().nullable(), message: z.string() });
export type AdminNetworkRunResponse = z.infer<typeof AdminNetworkRunResponse>;
