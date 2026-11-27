import { z } from "zod";
import { Cents, DataSource, Email, Id, IsoDateTime, Slug, UsZip } from "./common";
import { LocalStock, UnitPrice } from "./grocery";

/* ------------------------------------------------------------------ */
/* Store locations (chains + local sellers)                            */
/* ------------------------------------------------------------------ */

export const RetailerKind = z.enum(["national", "marketplace", "local"]);
export type RetailerKind = z.infer<typeof RetailerKind>;

/** How precise the coordinates are. zip_centroid = approximate (Census ZCTA internal point). */
export const GeoPrecision = z.enum(["zip_centroid", "provider", "source"]);
export type GeoPrecision = z.infer<typeof GeoPrecision>;

const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

/** Opening hours, one entry per open day (0 = Sunday). Missing day = closed / unknown. */
export const StoreHours = z.array(z.object({ day: z.number().int().min(0).max(6), open: HHMM, close: HHMM })).max(14);
export type StoreHours = z.infer<typeof StoreHours>;

export const VerificationState = z.enum(["unverified", "pending", "verified", "rejected"]);
export type VerificationState = z.infer<typeof VerificationState>;

export const StoreLocationPublic = z.object({
  id: Id,
  name: z.string(),
  retailer: z.object({ slug: Slug, name: z.string(), kind: RetailerKind, logoUrl: z.string().nullable(), brandColor: z.string().nullable() }),
  address1: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string(),
  lat: z.number(),
  lng: z.number(),
  geoPrecision: GeoPrecision,
  phone: z.string().nullable(),
  hours: StoreHours.nullable(),
  pickup: z.boolean(),
  deliveryRadiusMiles: z.number().int().nullable(),
  pickupMinimumCents: Cents.nullable(),
  deliveryMinimumCents: Cents.nullable(),
  source: DataSource,
  verified: z.boolean(),
});
export type StoreLocationPublic = z.infer<typeof StoreLocationPublic>;

/** Availability of one product at one store. */
export const NearbyAvailability = z.object({
  location: StoreLocationPublic,
  distanceMi: z.number().nonnegative(),
  stock: LocalStock,
  /** Store price when the source provides it (null = ask the store / see online price). */
  priceCents: Cents.nullable(),
  currency: z.string().length(3),
  unitPrice: UnitPrice.nullable(),
  pickupToday: z.boolean(),
  /** Within the store's delivery radius from the shopper's ZIP centroid. */
  deliversToYou: z.boolean(),
  source: DataSource,
  lastCheckedAt: IsoDateTime,
  /** Promoted listing — rendered separately with a "Sponsored" label; never re-orders organic results. */
  sponsored: z.boolean(),
});
export type NearbyAvailability = z.infer<typeof NearbyAvailability>;

export const ZipOrigin = z.object({ zip: z.string(), city: z.string().nullable(), state: z.string().nullable(), lat: z.number(), lng: z.number() });
export type ZipOrigin = z.infer<typeof ZipOrigin>;

export const ProductNearbyQuery = z.object({
  zip: UsZip.optional(),
  radius: z.coerce.number().int().min(1).max(100).default(25),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type ProductNearbyQuery = z.infer<typeof ProductNearbyQuery>;

export const ProductNearbyResponse = z.object({
  /** ok | set_zip (no ZIP known → prompt) | unknown_zip (not in our ZCTA table). */
  status: z.enum(["ok", "set_zip", "unknown_zip"]),
  origin: ZipOrigin.nullable(),
  radiusMi: z.number().int(),
  /** Organic results ordered by distance (in-stock first within ~1 mi ties). */
  items: z.array(NearbyAvailability),
  /** Promoted local listings, labeled "Sponsored" (max 1). Never part of `items`. */
  sponsored: z.array(NearbyAvailability),
  /** Lowest online/national price for comparison (new condition), when any. */
  online: z.object({ priceCents: Cents, retailerName: z.string(), source: DataSource }).nullable(),
  /** Store-level / local-pickup sources and whether they are connected (honest pending states). */
  sources: z.array(z.object({ id: z.string(), name: z.string(), status: z.enum(["live", "pending_configuration", "error"]), note: z.string().nullable() })).optional(),
  /** Marketplace listings offering local pickup near the ZIP (eBay Browse API), only when that source is live. */
  marketplacePickup: z
    .array(
      z.object({
        source: z.literal("ebay"),
        title: z.string(),
        priceCents: Cents,
        currency: z.string().length(3),
        condition: z.string(),
        sellerName: z.string().nullable(),
        city: z.string().nullable(),
        state: z.string().nullable(),
        postalCode: z.string().nullable(),
        url: z.string().url().nullable(),
      }),
    )
    .optional(),
  hasDemoData: z.boolean(),
});
export type ProductNearbyResponse = z.infer<typeof ProductNearbyResponse>;

export const LocalStoresQuery = z.object({
  zip: UsZip.optional(),
  radius: z.coerce.number().int().min(1).max(100).default(25),
  kind: RetailerKind.optional(),
  retailer: Slug.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});
export type LocalStoresQuery = z.infer<typeof LocalStoresQuery>;

export const LocalStoresResponse = z.object({
  status: z.enum(["ok", "set_zip", "unknown_zip"]),
  origin: ZipOrigin.nullable(),
  radiusMi: z.number().int(),
  items: z.array(StoreLocationPublic.extend({ distanceMi: z.number().nonnegative(), productCount: z.number().int().nonnegative() })),
  hasDemoData: z.boolean(),
});
export type LocalStoresResponse = z.infer<typeof LocalStoresResponse>;

/* ------------------------------------------------------------------ */
/* Local seller onboarding (merchant portal)                           */
/* ------------------------------------------------------------------ */

export const BusinessCategory = z.enum(["grocery", "convenience", "pharmacy", "hardware", "electronics", "pet", "beauty", "home", "sporting", "books", "general"]);
export type BusinessCategory = z.infer<typeof BusinessCategory>;

export const StoreLocationInput = z.object({
  name: z.string().trim().min(2).max(120),
  address1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2).toUpperCase(),
  zip: UsZip.transform((z) => z.slice(0, 5)),
  phone: z.string().trim().max(30).optional(),
  hours: StoreHours.optional(),
  pickup: z.boolean().default(true),
  deliveryRadiusMiles: z.number().int().min(0).max(100).optional(),
  pickupMinimumCents: z.number().int().min(0).max(1_000_000).optional(),
  deliveryMinimumCents: z.number().int().min(0).max(1_000_000).optional(),
});
export type StoreLocationInput = z.infer<typeof StoreLocationInput>;
export type StoreLocationInputRaw = z.input<typeof StoreLocationInput>;

export const LocalSellerApplyRequest = z.object({
  companyName: z.string().trim().min(2).max(120),
  legalName: z.string().trim().min(2).max(160),
  contactEmail: Email,
  businessPhone: z.string().trim().min(7).max(30),
  website: z.string().trim().url().max(300).optional(),
  businessCategory: BusinessCategory,
  /** Last 4 digits of the EIN (optional verification hint). Never send the full EIN. */
  einLast4: z.string().regex(/^\d{4}$/).optional(),
  location: StoreLocationInput,
  /** Must be true — seller terms + listing policy (free listing; promoted listings are labeled Sponsored). */
  acceptTerms: z.literal(true),
});
export type LocalSellerApplyRequest = z.infer<typeof LocalSellerApplyRequest>;

export const MerchantLocation = StoreLocationPublic.extend({
  verificationStatus: VerificationState,
  isActive: z.boolean(),
  inventoryCount: z.number().int().nonnegative(),
  createdAt: IsoDateTime,
});
export type MerchantLocation = z.infer<typeof MerchantLocation>;

export const MerchantLocationListResponse = z.object({ items: z.array(MerchantLocation) });
export type MerchantLocationListResponse = z.infer<typeof MerchantLocationListResponse>;

export const UpdateStoreLocationRequest = StoreLocationInput.partial().extend({ isActive: z.boolean().optional() });
export type UpdateStoreLocationRequest = z.infer<typeof UpdateStoreLocationRequest>;

export const MerchantInventoryUpsertRequest = z.object({
  items: z
    .array(
      z.object({
        offerId: Id,
        stock: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]),
        quantity: z.number().int().min(0).max(100_000).optional(),
        priceCents: z.number().int().min(1).max(10_000_000).optional(),
        pickupToday: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type MerchantInventoryUpsertRequest = z.infer<typeof MerchantInventoryUpsertRequest>;

/** Per-location stock view: every offer in the merchant's catalog with this store's stock (null = not set yet). */
export const MerchantLocationInventoryResponse = z.object({
  location: z.object({ id: Id, name: z.string(), verificationStatus: VerificationState }),
  items: z.array(
    z.object({
      offerId: Id,
      productSlug: Slug,
      title: z.string(),
      sizeLabel: z.string().nullable(),
      onlinePriceCents: Cents,
      offerActive: z.boolean(),
      storePriceCents: Cents.nullable(),
      stock: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).nullable(),
      quantity: z.number().int().nullable(),
      pickupToday: z.boolean(),
      lastCheckedAt: IsoDateTime.nullable(),
    }),
  ),
  /** Listings waiting for catalog matching (no GTIN match yet) — shown so merchants know why items are missing. */
  pendingMatches: z.number().int().nonnegative(),
});
export type MerchantLocationInventoryResponse = z.infer<typeof MerchantLocationInventoryResponse>;

export const MerchantInventoryUpsertResponse = z.object({ updated: z.number().int().nonnegative(), skipped: z.array(z.object({ offerId: z.string(), reason: z.string() })) });
export type MerchantInventoryUpsertResponse = z.infer<typeof MerchantInventoryUpsertResponse>;

export const ChecklistItem = z.object({ key: z.string(), label: z.string(), done: z.boolean(), hint: z.string().nullable() });
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const LocalSellerStatusResponse = z.object({
  merchant: z.object({
    id: Id,
    companyName: z.string(),
    legalName: z.string().nullable(),
    businessCategory: z.string().nullable(),
    verificationStatus: VerificationState,
    isLocalSeller: z.boolean(),
    submittedAt: IsoDateTime.nullable(),
    reviewedAt: IsoDateTime.nullable(),
    reviewNote: z.string().nullable(),
  }),
  retailer: z.object({ id: Id, slug: Slug, name: z.string(), isActive: z.boolean() }).nullable(),
  /** Listing is free. Promoted listings (Sponsored) are optional and never change organic ranking or Deal Score. */
  freeListing: z.literal(true),
  checklist: z.array(ChecklistItem),
});
export type LocalSellerStatusResponse = z.infer<typeof LocalSellerStatusResponse>;

/* ------------------------------------------------------------------ */
/* Store-platform connectors                                           */
/* ------------------------------------------------------------------ */

export const CommerceProviderId = z.enum(["shopify", "woocommerce", "square", "clover", "google_merchant"]);
export type CommerceProviderId = z.infer<typeof CommerceProviderId>;

export const CommerceProviderInfo = z.object({
  id: CommerceProviderId,
  name: z.string(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), secret: z.boolean(), placeholder: z.string().nullable() })),
  supportsLocations: z.boolean(),
  docsUrl: z.string().url().nullable(),
  /** e.g. Shopify needs app credentials on our side before merchants can connect. */
  platformStatus: z.enum(["available", "pending_configuration"]),
  note: z.string().nullable(),
});
export type CommerceProviderInfo = z.infer<typeof CommerceProviderInfo>;

export const CommerceConnectionDto = z.object({
  id: Id,
  provider: CommerceProviderId,
  status: z.enum(["live", "pending_configuration", "error", "disabled"]),
  /** Non-secret settings only. */
  config: z.record(z.string(), z.string()),
  /** Secret field keys that are stored (values never returned). */
  storedSecrets: z.array(z.string()),
  lastSyncAt: IsoDateTime.nullable(),
  nextSyncAt: IsoDateTime.nullable(),
  lastError: z.string().nullable(),
  itemsSynced: z.number().int().nullable(),
});
export type CommerceConnectionDto = z.infer<typeof CommerceConnectionDto>;

export const MerchantConnectionsResponse = z.object({ providers: z.array(CommerceProviderInfo), items: z.array(CommerceConnectionDto) });
export type MerchantConnectionsResponse = z.infer<typeof MerchantConnectionsResponse>;

export const UpsertCommerceConnectionRequest = z.object({
  provider: CommerceProviderId,
  config: z.record(z.string().max(40), z.string().max(500)).default({}),
  secrets: z.record(z.string().max(40), z.string().max(2000)).optional(),
});
export type UpsertCommerceConnectionRequest = z.infer<typeof UpsertCommerceConnectionRequest>;

export const CommerceProviderParam = z.object({ provider: CommerceProviderId });

export const CommerceSyncResponse = z.object({
  status: z.enum(["ok", "pending_configuration", "error", "queued"]),
  message: z.string().nullable(),
  products: z.number().int().nonnegative(),
  locations: z.number().int().nonnegative(),
});
export type CommerceSyncResponse = z.infer<typeof CommerceSyncResponse>;

/* ------------------------------------------------------------------ */
/* Admin: moderation + coverage                                        */
/* ------------------------------------------------------------------ */

export const DataQualityFlag = z.object({
  code: z.enum([
    "zip_not_found",
    "approximate_location",
    "missing_hours",
    "missing_phone",
    "missing_website",
    "feed_rejected_rows",
    "feed_missing_gtin",
    "no_inventory",
    "stale_inventory",
    "duplicate_address",
    "connector_error",
  ]),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
});
export type DataQualityFlag = z.infer<typeof DataQualityFlag>;

export const AdminLocalMerchantQuery = z.object({
  status: z.enum(["pending", "verified", "rejected", "unverified", "all"]).default("pending"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(20),
});
export type AdminLocalMerchantQuery = z.infer<typeof AdminLocalMerchantQuery>;

export const AdminLocalMerchant = z.object({
  id: Id,
  companyName: z.string(),
  legalName: z.string().nullable(),
  contactEmail: z.string(),
  businessPhone: z.string().nullable(),
  website: z.string().nullable(),
  businessCategory: z.string().nullable(),
  einLast4: z.string().nullable(),
  verificationStatus: VerificationState,
  submittedAt: IsoDateTime.nullable(),
  reviewedAt: IsoDateTime.nullable(),
  reviewNote: z.string().nullable(),
  retailer: z.object({ id: Id, slug: Slug, name: z.string(), isActive: z.boolean() }).nullable(),
  locations: z.array(
    z.object({
      id: Id,
      name: z.string(),
      address1: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string(),
      geoPrecision: GeoPrecision,
      verificationStatus: VerificationState,
      zipKnown: z.boolean(),
      /** City/state from our ZIP table, for comparing with what the merchant typed. */
      zipCity: z.string().nullable(),
      zipState: z.string().nullable(),
      inventoryCount: z.number().int().nonnegative(),
      flags: z.array(DataQualityFlag),
    }),
  ),
  feeds: z.array(
    z.object({
      id: Id,
      name: z.string(),
      status: z.string(),
      reviewStatus: VerificationState,
      rowsTotal: z.number().int().nullable(),
      rowsAccepted: z.number().int().nullable(),
      rowsRejected: z.number().int().nullable(),
      uploadedAt: IsoDateTime,
    }),
  ),
  connections: z.array(z.object({ provider: z.string(), status: z.string(), lastSyncAt: IsoDateTime.nullable(), lastError: z.string().nullable() })),
  flags: z.array(DataQualityFlag),
});
export type AdminLocalMerchant = z.infer<typeof AdminLocalMerchant>;

export const AdminLocalMerchantListResponse = z.object({
  items: z.array(AdminLocalMerchant),
  counts: z.object({ pending: z.number().int(), verified: z.number().int(), rejected: z.number().int(), unverified: z.number().int() }),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type AdminLocalMerchantListResponse = z.infer<typeof AdminLocalMerchantListResponse>;

export const AdminReviewMerchantRequest = z.object({ decision: z.enum(["verified", "rejected", "pending"]), note: z.string().trim().max(1000).optional() });
export type AdminReviewMerchantRequest = z.infer<typeof AdminReviewMerchantRequest>;

export const AdminReviewLocationRequest = z.object({ verificationStatus: z.enum(["verified", "rejected", "pending", "unverified"]) });
export type AdminReviewLocationRequest = z.infer<typeof AdminReviewLocationRequest>;

export const AdminReviewFeedRequest = z.object({ reviewStatus: z.enum(["verified", "rejected", "pending"]) });
export type AdminReviewFeedRequest = z.infer<typeof AdminReviewFeedRequest>;

export const CoverageCount = z.object({ key: z.string(), label: z.string(), value: z.number().int().nonnegative() });
export type CoverageCount = z.infer<typeof CoverageCount>;

export const AdminCoverageResponse = z.object({
  generatedAt: IsoDateTime,
  totals: z.object({
    retailers: z.number().int(),
    activeRetailers: z.number().int(),
    storeLocations: z.number().int(),
    verifiedLocations: z.number().int(),
    approximateLocations: z.number().int(),
    products: z.number().int(),
    offers: z.number().int(),
    storeInventoryRows: z.number().int(),
    demoOffers: z.number().int(),
    liveOffers: z.number().int(),
  }),
  /** Retailers by kind (national / marketplace / local). */
  retailersByKind: z.array(CoverageCount),
  /** Active offers by data source (api / feed / affiliate / merchant_upload / demo). */
  offersBySource: z.array(CoverageCount),
  /** Store locations by source and by state (top 15). */
  locationsBySource: z.array(CoverageCount),
  locationsByState: z.array(CoverageCount),
  offersByCategory: z.array(z.object({ slug: Slug, name: z.string(), products: z.number().int(), offers: z.number().int(), retailers: z.number().int(), demoShare: z.number().min(0).max(1) })),
  /** Offer freshness by lastCheckedAt age. */
  freshness: z.array(CoverageCount),
  connectors: z.array(z.object({ provider: z.string(), connections: z.number().int(), live: z.number().int(), errors: z.number().int() })),
  adapters: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), status: z.string() })),
  hasDemoData: z.boolean(),
});
export type AdminCoverageResponse = z.infer<typeof AdminCoverageResponse>;

