/**
 * Typed analytics event catalog. Properties are deliberately PII-free:
 * no emails, names, phone numbers, addresses, IPs, raw search text, passwords or tokens.
 * Identifiers are internal opaque ids (product/offer/retailer ids), never user identity.
 */

export type AuthMethod = "email" | "google" | "apple";
export type SearchKind = "text" | "gtin" | "url" | "empty";
export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type DataSource = "api" | "feed" | "merchant_upload" | "affiliate" | "demo";

export interface EventMap {
  page_viewed: { route: string; referrerType?: "internal" | "external" | "direct" };
  search_performed: {
    kind: SearchKind;
    /** Length of the query string, never the query itself. */
    queryLength: number;
    termCount: number;
    resultCount: number;
    hasPriceFilter: boolean;
    categoryHint?: string | null;
    sort?: string | null;
    degraded: boolean;
  };
  search_suggestion_clicked: { position: number; suggestionType: "product" | "category" | "brand" | "query" };
  filter_applied: { filter: string; valueCount: number };
  sort_changed: { sort: string };
  product_viewed: { productId: string; categorySlug?: string | null; offerCount: number; hasDealScore: boolean; source: DataSource };
  offer_clicked: {
    offerId: string;
    productId: string;
    retailerId: string;
    position: number;
    priceCents: number;
    isSponsored: boolean;
    source: DataSource;
  };
  price_history_viewed: { productId: string; range: "7d" | "30d" | "90d" | "180d" | "365d" | "all" };
  compare_viewed: { productCount: number };
  favorite_added: { productId: string };
  favorite_removed: { productId: string };
  list_created: { itemCount: number };
  alert_created: {
    alertType: "below_price" | "drop_percent" | "back_in_stock" | "new_cheaper_store" | "all_time_low" | "coupon" | "flight_price" | "hotel_price";
    productId?: string | null;
    channel: "email" | "push" | "in_app";
  };
  alert_deleted: { alertType: string };
  alert_notification_opened: { alertType: string; channel: "email" | "push" | "in_app" };
  basket_optimized: { itemCount: number; scenarioCount: number; bestStoreCount: number; savingsCents: number; method: "exact" | "heuristic" };
  scan_performed: { result: "found" | "not_found" | "invalid"; codeType: "UPC-A" | "EAN-13" | "GTIN-8" | "GTIN-14" | "unknown" };
  deal_viewed: { productId: string; dealTier: "Exceptional" | "Great" | "Good" | "Average" | "Poor" };
  flight_search: {
    /** IATA airport codes are public locations, not PII. */
    origin: string;
    destination: string;
    tripType: "one_way" | "round_trip";
    cabin: CabinClass;
    passengers: number;
    daysToDeparture: number;
    providerCount: number;
    resultCount: number;
  };
  flight_offer_clicked: { provider: string; position: number; totalCents: number; stops: number };
  hotel_search: { destinationType: "city" | "coordinates" | "hotel_ids"; nights: number; guests: number; rooms: number; resultCount: number; providerCount: number };
  hotel_offer_clicked: { provider: string; hotelId: string; position: number; totalCents: number };
  signup: { method: AuthMethod };
  login: { method: AuthMethod; success: boolean };
  logout: Record<string, never>;
  password_reset_requested: Record<string, never>;
  account_deleted: Record<string, never>;
  data_exported: Record<string, never>;
  assistant_query: { queryLength: number; grounded: boolean; latencyMs: number };
  merchant_feed_uploaded: { format: "csv" | "xml"; rowCount: number; validRowCount: number };
  outbound_redirect: { kind: "offer" | "flight" | "hotel"; retailerOrProvider: string };
}

export type EventName = keyof EventMap;

export const EVENT_NAMES: readonly EventName[] = [
  "page_viewed", "search_performed", "search_suggestion_clicked", "filter_applied", "sort_changed", "product_viewed",
  "offer_clicked", "price_history_viewed", "compare_viewed", "favorite_added", "favorite_removed", "list_created",
  "alert_created", "alert_deleted", "alert_notification_opened", "basket_optimized", "scan_performed", "deal_viewed",
  "flight_search", "flight_offer_clicked", "hotel_search", "hotel_offer_clicked", "signup", "login", "logout",
  "password_reset_requested", "account_deleted", "data_exported", "assistant_query", "merchant_feed_uploaded",
  "outbound_redirect",
];

export function isEventName(name: string): name is EventName {
  return (EVENT_NAMES as readonly string[]).includes(name);
}
