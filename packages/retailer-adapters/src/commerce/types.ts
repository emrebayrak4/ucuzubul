/**
 * Normalized shapes for merchant store-platform connectors (Shopify, WooCommerce, Square, Clover,
 * Google Merchant feeds). Money is integer minor units (cents) + ISO 4217 currency.
 *
 * Config is passed per merchant as a plain object (credentials decrypted by the API). Connectors
 * never read secrets from files or env. Missing required fields => status "pending_configuration"
 * and sync() returns an empty result WITHOUT any network call.
 */

export type CommerceProvider = "shopify" | "woocommerce" | "square" | "clover" | "google_merchant";

export interface CommerceLocation {
  externalId: string;
  name: string;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
}

export type CommerceStock = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface CommerceInventory {
  /** null = online / total (not tied to a physical location). */
  locationExternalId: string | null;
  quantity: number | null;
  /** low_stock when 1–3 units. */
  stock: CommerceStock;
}

export type CommerceCondition = "new" | "refurbished" | "used" | "unknown";

export interface CommerceProduct {
  externalId: string;
  sku: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  priceCents: number;
  listPriceCents: number | null;
  currency: string;
  url: string | null;
  imageUrl: string | null;
  condition: CommerceCondition;
  inventory: CommerceInventory[];
}

export type CommerceSyncStatus = "ok" | "pending_configuration" | "error";

export interface CommerceSyncResult {
  provider: CommerceProvider;
  status: CommerceSyncStatus;
  message?: string;
  products: CommerceProduct[];
  /** Locations are returned on the first page only (cursor null/undefined); later pages return []. */
  locations: CommerceLocation[];
  /** Opaque cursor for the next page; null/undefined when there is no next page. */
  nextCursor?: string | null;
}

export interface CommerceSyncOptions {
  cursor?: string | null;
  limit?: number;
}

export type CommerceConfig = Readonly<Record<string, string | undefined>>;

export interface CommerceConnector {
  readonly provider: CommerceProvider;
  /** Names of the config/credential fields that must be non-empty. */
  readonly requiredConfig: string[];
  status(): "live" | "pending_configuration";
  /** Required config fields that are missing/empty. */
  missingConfig(): string[];
  sync(opts?: CommerceSyncOptions): Promise<CommerceSyncResult>;
}
