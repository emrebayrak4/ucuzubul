/**
 * Kroger — Public Products API (developer.kroger.com).
 * Token: POST https://api.kroger.com/v1/connect/oauth2/token (Basic client:secret,
 *        grant_type=client_credentials, scope=product.compact)
 * Search: GET /v1/products?filter.term=&filter.locationId=&filter.start=&filter.limit=
 * Details: GET /v1/products/{productId}?filter.locationId=
 * Price/inventory are only returned when filter.locationId (a store) is supplied, so
 * KROGER_LOCATION_ID is required: prices are store-specific.
 * Quota: 10,000 calls/day per client (mirrored docs).
 *
 * Per-store:
 *   Locations: GET /v1/locations?filter.zipCode.near=&filter.radiusInMiles=&filter.limit=  (same token)
 *   fetchProducts / fetchProductDetails accept an optional locationId overriding KROGER_LOCATION_ID;
 *   fetchProductsAtLocation() returns per-store price, stock bucket and fulfillment flags.
 *   Store-scoped calls need only KROGER_CLIENT_ID / KROGER_CLIENT_SECRET (+ a locationId argument).
 */
import { BaseRetailerAdapter, type AdapterOptions } from "../base";
import type { CommerceLocation, CommerceStock } from "../commerce/types";
import { PendingConfigurationError, ResponseShapeError } from "../errors";
import { TokenCache } from "../oauth";
import type { Availability, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, base64, cleanGtin, compactAttrs, get, isObject, readEnv, str, toCents } from "../util";

const BASE = "https://api.kroger.com/v1";
const CREDENTIAL_ENV = ["KROGER_CLIENT_ID", "KROGER_CLIENT_SECRET"] as const;

export interface KrogerLocation extends CommerceLocation {
  /** Banner, e.g. "KROGER", "RALPHS", "FRED MEYER". */
  chain: string | null;
}

export interface KrogerFulfillment {
  curbside: boolean | null;
  instore: boolean | null;
  delivery: boolean | null;
  shipToHome: boolean | null;
}

export interface KrogerStoreListing extends NormalizedListing {
  locationId: string;
  stock: CommerceStock;
  fulfillment: KrogerFulfillment;
}

/** Kroger items[].inventory.stockLevel → stock bucket. */
export function krogerStock(level: unknown): CommerceStock {
  if (level === "HIGH") return "in_stock";
  if (level === "LOW") return "low_stock";
  if (level === "TEMPORARILY_OUT_OF_STOCK") return "out_of_stock";
  return "unknown";
}

function assertLocationId(id: string): string {
  const v = id.trim();
  if (!/^[A-Za-z0-9]{1,16}$/.test(v)) throw new RangeError("invalid Kroger locationId");
  return v;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Kroger's `upc` is commonly a 13-digit code WITHOUT the check digit (UNVERIFIED quirk observed in
 * public examples). Accept a valid GTIN as-is; otherwise treat 13 digits as a GTIN-14 body and
 * append the computed check digit.
 */
export function krogerGtin(value: unknown): string | null {
  const valid = cleanGtin(value);
  if (valid) return valid;
  if (typeof value !== "string" || !/^\d{13}$/.test(value)) return null;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += (value.charCodeAt(12 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return `${value}${(10 - (sum % 10)) % 10}`;
}

export class KrogerAdapter extends BaseRetailerAdapter {
  readonly id = "kroger";
  readonly name = "Kroger";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["KROGER_CLIENT_ID", "KROGER_CLIENT_SECRET", "KROGER_LOCATION_ID"] as const;
  protected readonly source = "api" as const;
  protected override defaultRateLimit = { capacity: 3, refillPerSecond: 1 };
  private readonly tokens: TokenCache;

  constructor(options: AdapterOptions = {}) {
    super(options);
    this.tokens = new TokenCache(this.clock);
  }

  /** Client credentials only (store-scoped calls supply their own locationId). Throws PendingConfigurationError. */
  private credentials(): Record<string, string> {
    const { values, missing } = readEnv(this.env, CREDENTIAL_ENV);
    if (missing.length > 0) throw new PendingConfigurationError(this.id, missing);
    return values;
  }

  private async token(): Promise<string> {
    const env = this.credentials();
    return this.tokens.get(async () => {
      const res = await this.http.json<Record<string, unknown>>({
        url: `${BASE}/connect/oauth2/token`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${base64(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`)}`,
        },
        body: "grant_type=client_credentials&scope=product.compact",
      });
      const accessToken = str(res.access_token);
      if (!accessToken) throw new ResponseShapeError(this.id, "token response without access_token");
      return { accessToken, expiresInSec: typeof res.expires_in === "number" ? res.expires_in : 1800 };
    });
  }

  /** locationId override, else KROGER_LOCATION_ID; throws PendingConfigurationError when neither (or credentials) is set. */
  private resolveLocation(locationId?: string): string {
    const missing = readEnv(this.env, CREDENTIAL_ENV).missing;
    const loc = locationId ?? this.envValue("KROGER_LOCATION_ID");
    if (missing.length > 0 || !loc) throw new PendingConfigurationError(this.id, loc ? missing : [...missing, "KROGER_LOCATION_ID"]);
    return assertLocationId(loc);
  }

  private async call(path: string, params: Record<string, string>, locationId?: string): Promise<unknown> {
    const loc = this.resolveLocation(locationId);
    const token = await this.token();
    const qs = new URLSearchParams({ "filter.locationId": loc, ...params });
    return this.guard(() => this.http.json({ url: `${BASE}${path}?${qs.toString()}`, headers: { Authorization: `Bearer ${token}` } }));
  }

  /** Kroger-family stores near a US ZIP (Locations API). */
  async locationsNear(zip: string, radiusMiles = 10, limit = 10): Promise<FetchResult<KrogerLocation[]>> {
    this.credentials();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) throw new RangeError("zip must be a 5-digit US ZIP code");
    if (!Number.isInteger(radiusMiles) || radiusMiles < 1 || radiusMiles > 100) throw new RangeError("radiusMiles must be an integer 1-100");
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError("limit must be an integer 1-200");
    const token = await this.token();
    const qs = new URLSearchParams({ "filter.zipCode.near": z, "filter.radiusInMiles": String(radiusMiles), "filter.limit": String(limit) });
    const res = await this.guard(() => this.http.json({ url: `${BASE}/locations?${qs.toString()}`, headers: { Authorization: `Bearer ${token}` } }));
    const locations = arr(get(res, "data")).flatMap((l): KrogerLocation[] => {
      const id = str(get(l, "locationId"));
      if (!id) return [];
      return [
        {
          externalId: id,
          name: str(get(l, "name")) ?? id,
          address1: str(get(l, "address.addressLine1")),
          city: str(get(l, "address.city")),
          state: str(get(l, "address.state")),
          zip: str(get(l, "address.zipCode")),
          lat: num(get(l, "geolocation.latitude")),
          lng: num(get(l, "geolocation.longitude")),
          phone: str(get(l, "phone")),
          chain: str(get(l, "chain")),
        },
      ];
    });
    return this.result(locations, this.source);
  }

  /** Products with this store's price, stock bucket and fulfillment flags. */
  async fetchProductsAtLocation(locationId: string, q: ProductQuery): Promise<FetchResult<KrogerStoreListing[]>> {
    const loc = this.resolveLocation(locationId);
    const raw = await this.searchRaw(q, loc);
    const out: KrogerStoreListing[] = [];
    for (const p of raw) {
      const l = this.normalizeProduct(p);
      if (!l) continue;
      const item = arr(get(p, "items"))[0];
      out.push({
        ...l,
        locationId: loc,
        stock: krogerStock(get(item, "inventory.stockLevel")),
        fulfillment: {
          curbside: bool(get(item, "fulfillment.curbside")),
          // Kroger documents `inStore`; accept the lowercase spelling too.
          instore: bool(get(item, "fulfillment.inStore")) ?? bool(get(item, "fulfillment.instore")),
          delivery: bool(get(item, "fulfillment.delivery")),
          shipToHome: bool(get(item, "fulfillment.shipToHome")),
        },
      });
    }
    return this.result(out, this.source);
  }

  private async searchRaw(q: ProductQuery, locationId?: string): Promise<unknown[]> {
    if (q.retailerSkus?.length) {
      const out: unknown[] = [];
      for (const id of q.retailerSkus.slice(0, 20)) {
        const res = await this.call(`/products/${encodeURIComponent(id)}`, {}, locationId);
        const d = get(res, "data");
        if (isObject(d)) out.push(d);
      }
      return out;
    }
    const term = q.gtin ?? q.keywords;
    if (!term) throw new RangeError("keywords, gtin or retailerSkus required");
    const limit = Math.min(50, Math.max(1, q.pageSize ?? 50));
    const params: Record<string, string> = {
      "filter.term": term,
      "filter.limit": String(limit),
      "filter.start": String((Math.max(1, q.page ?? 1) - 1) * limit + 1),
    };
    if (q.brand) params["filter.brand"] = q.brand;
    return arr(get(await this.call("/products", params, locationId), "data"));
  }

  async fetchProducts(q: ProductQuery, locationId?: string): Promise<FetchResult<NormalizedListing[]>> {
    this.resolveLocation(locationId);
    const listings = (await this.searchRaw(q, locationId))
      .map((p) => this.normalizeProduct(p))
      .filter((l): l is NormalizedListing => l !== null);
    return this.result(listings, this.source);
  }

  async fetchProductDetails(productId: string, locationId?: string): Promise<FetchResult<NormalizedListing | null>> {
    const res = await this.call(`/products/${encodeURIComponent(productId)}`, {}, locationId);
    return this.result(this.normalizeProduct(get(res, "data")), this.source);
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const productId = str(raw.productId);
    const title = str(raw.description);
    if (!productId || !title) return null;
    const item = arr(raw.items)[0];
    const regular = toCents(get(item, "price.regular"));
    const promo = toCents(get(item, "price.promo"));
    const priceCents = promo !== null && promo > 0 ? promo : regular;
    const stock = krogerStock(str(get(item, "inventory.stockLevel")));
    const availability: Availability = stock === "low_stock" ? "limited" : stock;
    const images = arr(raw.images);
    const front = images.find((i) => get(i, "perspective") === "front") ?? images[0];
    const sizes = arr(get(front, "sizes"));
    const image = sizes.find((s) => get(s, "size") === "large") ?? sizes.find((s) => get(s, "size") === "medium") ?? sizes[0];
    const uri = str(raw.productPageURI);
    const productUrl = uri ? (uri.startsWith("http") ? uri : `https://www.kroger.com${uri.startsWith("/") ? "" : "/"}${uri}`) : null;
    const size = str(get(item, "size"));
    const product = {
      retailerId: this.id,
      retailerSku: productId,
      title,
      brand: str(raw.brand),
      mpn: null,
      model: null,
      gtin: krogerGtin(raw.upc),
      imageUrl: str(get(image, "url")),
      productUrl,
      categoryPath: arr(raw.categories).map((c) => str(c)).filter((x): x is string => !!x),
      description: null,
      attributes: compactAttrs({ size }),
    };
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: productId,
            priceCents,
            listPriceCents: promo !== null && promo > 0 && regular !== null && regular > promo ? regular : null,
            currency: "USD",
            availability,
            condition: "new" as const,
            productUrl,
            affiliateUrl: null,
            shippingCents: null,
            sellerName: "Kroger",
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  protected async ping(): Promise<void> {
    await this.token();
  }
}
