/**
 * Self-contained adapter types (intentionally not importing @pricora/contracts).
 * Money is always integer cents in `currency` (ISO 4217).
 */

export type AdapterStatus = "live" | "pending_configuration" | "error";
export type AdapterKind = "retailer" | "flight" | "hotel";
export type DataAccess = "official_api" | "affiliate_feed" | "partner_only";
export type Availability = "in_stock" | "limited" | "out_of_stock" | "preorder" | "backorder" | "unknown";
export type Condition = "new" | "refurbished" | "used" | "open_box";
/** Mirrors the DB `source` enum (minus "demo": adapters never produce demo data). */
export type OfferSource = "api" | "feed" | "merchant_upload" | "affiliate";

export type EnvLike = Readonly<Record<string, string | undefined>>;

export interface Freshness {
  provider: string;
  source: OfferSource;
  fetchedAt: string;
  ttlSeconds: number;
  expiresAt: string;
  /** True when served from an in-memory/provider cache rather than a fresh upstream call. */
  cached: boolean;
}

export interface FetchResult<T> {
  data: T;
  freshness: Freshness;
  warnings: string[];
}

export interface NormalizedProduct {
  retailerId: string;
  retailerSku: string;
  title: string;
  brand: string | null;
  mpn: string | null;
  model: string | null;
  /** GTIN digits (UPC-A / EAN-13 / GTIN-14). API adapters only emit valid codes; feed rows may carry an invalid one, which validateData() rejects. */
  gtin: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  categoryPath: string[];
  description: string | null;
  attributes: Record<string, string>;
}

export interface NormalizedOffer {
  retailerId: string;
  retailerSku: string;
  priceCents: number;
  listPriceCents: number | null;
  currency: string;
  availability: Availability;
  condition: Condition;
  productUrl: string | null;
  affiliateUrl: string | null;
  /** null = unknown, 0 = free. */
  shippingCents: number | null;
  sellerName: string | null;
  source: OfferSource;
  observedAt: string;
}

export interface NormalizedListing {
  product: NormalizedProduct;
  /** null when the listing has no valid price (never invented). */
  offer: NormalizedOffer | null;
}

export interface ProductQuery {
  keywords?: string;
  gtin?: string;
  retailerSkus?: string[];
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  page?: number;
  pageSize?: number;
}

export interface AvailabilityResult {
  retailerSku: string;
  availability: Availability;
  priceCents: number | null;
  observedAt: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface HealthCheckResult {
  adapterId: string;
  status: AdapterStatus;
  ok: boolean;
  latencyMs: number | null;
  message: string;
  checkedAt: string;
  missingEnv: string[];
}

export interface AffiliateLinkOptions {
  /** Opaque click/sub id for attribution (never PII). */
  subId?: string;
}

export interface RetailerAdapter {
  readonly id: string;
  readonly name: string;
  readonly kind: "retailer";
  readonly dataAccess: DataAccess;
  readonly requiredEnv: readonly string[];
  status(): AdapterStatus;
  /** Env vars from requiredEnv that are missing/empty. */
  missingEnv(): string[];
  fetchProducts(query: ProductQuery): Promise<FetchResult<NormalizedListing[]>>;
  fetchOffers(query: ProductQuery): Promise<FetchResult<NormalizedOffer[]>>;
  fetchProductDetails(retailerSku: string): Promise<FetchResult<NormalizedListing | null>>;
  fetchAvailability(retailerSkus: readonly string[]): Promise<FetchResult<AvailabilityResult[]>>;
  /** Map one raw provider record to a normalized listing; null if unusable. */
  normalizeProduct(raw: unknown): NormalizedListing | null;
  /** Parse a provider price value (number in major units or string like "$1,299.99") into cents. */
  normalizePrice(raw: unknown): number | null;
  validateData(listing: NormalizedListing): ValidationResult;
  generateAffiliateLink(productUrl: string, opts?: AffiliateLinkOptions): string | null;
  healthCheck(): Promise<HealthCheckResult>;
}

// ------------------------------------------------------------------ travel

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export interface FlightSearchParams {
  origin: string;
  destination: string;
  /** YYYY-MM-DD */
  departDate: string;
  returnDate?: string | null;
  adults: number;
  children?: number;
  infants?: number;
  cabin?: CabinClass;
  currency?: string;
  maxConnections?: number;
}

export interface FlightSegment {
  origin: string;
  destination: string;
  departAt: string;
  arriveAt: string;
  marketingCarrier: string | null;
  marketingFlightNumber: string | null;
  operatingCarrier: string | null;
  operatingCarrierName: string | null;
  durationMinutes: number | null;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  departAt: string;
  arriveAt: string | null;
  durationMinutes: number | null;
  stops: number;
  segments: FlightSegment[];
}

export interface FlightOffer {
  id: string;
  provider: string;
  totalCents: number;
  currency: string;
  baseCents: number | null;
  taxCents: number | null;
  ownerCode: string | null;
  ownerName: string | null;
  slices: FlightSlice[];
  /** True when the provider lets us book (Duffel); false for affiliate redirects / cached prices. */
  bookable: boolean;
  deepLink: string | null;
  expiresAt: string | null;
  source: OfferSource;
  /** True for provider-side cached prices (e.g. Travelpayouts Data API, up to 48h old). */
  cached: boolean;
  fetchedAt: string;
}

export type HotelDestination =
  | { type: "city"; value: string }
  | { type: "coordinates"; latitude: number; longitude: number; radiusKm?: number }
  | { type: "hotel_ids"; ids: string[] };

export interface HotelSearchParams {
  destination: HotelDestination;
  /** YYYY-MM-DD */
  checkin: string;
  checkout: string;
  adults: number;
  rooms: number;
  childrenAges?: number[];
  currency?: string;
  /** ISO 3166-1 alpha-2 country of the booker (required by some providers). Default "US". */
  bookerCountry?: string;
}

export interface HotelOffer {
  id: string;
  provider: string;
  hotelId: string;
  name: string | null;
  starRating: number | null;
  /** Total for the whole stay and all rooms. */
  totalCents: number;
  currency: string;
  /** "retail" = price the guest pays; "net" = wholesale (markup applied by us); "selling" = mandated minimum. */
  priceBasis: "retail" | "net" | "selling";
  roomName: string | null;
  boardName: string | null;
  refundable: boolean | null;
  deepLink: string | null;
  bookable: boolean;
  source: OfferSource;
  fetchedAt: string;
}

export interface TravelProviderBase {
  readonly id: string;
  readonly name: string;
  readonly dataAccess: DataAccess;
  readonly requiredEnv: readonly string[];
  status(): AdapterStatus;
  missingEnv(): string[];
  healthCheck(): Promise<HealthCheckResult>;
}

export interface FlightProvider extends TravelProviderBase {
  readonly kind: "flight";
  searchFlights(params: FlightSearchParams): Promise<FetchResult<FlightOffer[]>>;
}

export interface HotelProvider extends TravelProviderBase {
  readonly kind: "hotel";
  searchHotels(params: HotelSearchParams): Promise<FetchResult<HotelOffer[]>>;
}
