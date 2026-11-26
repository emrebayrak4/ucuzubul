/**
 * Kroger — Public Products API (developer.kroger.com).
 * Token: POST https://api.kroger.com/v1/connect/oauth2/token (Basic client:secret,
 *        grant_type=client_credentials, scope=product.compact)
 * Search: GET /v1/products?filter.term=&filter.locationId=&filter.start=&filter.limit=
 * Details: GET /v1/products/{productId}?filter.locationId=
 * Price/inventory are only returned when filter.locationId (a store) is supplied, so
 * KROGER_LOCATION_ID is required: prices are store-specific.
 * Quota: 10,000 calls/day per client (mirrored docs).
 */
import { BaseRetailerAdapter, type AdapterOptions } from "../base";
import { ResponseShapeError } from "../errors";
import { TokenCache } from "../oauth";
import type { Availability, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, base64, cleanGtin, compactAttrs, get, isObject, str, toCents } from "../util";

const BASE = "https://api.kroger.com/v1";

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

  private async token(): Promise<string> {
    const env = this.requireEnv();
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

  private async call(path: string, params: Record<string, string>): Promise<unknown> {
    const env = this.requireEnv();
    const token = await this.token();
    const qs = new URLSearchParams({ "filter.locationId": env.KROGER_LOCATION_ID as string, ...params });
    return this.guard(() => this.http.json({ url: `${BASE}${path}?${qs.toString()}`, headers: { Authorization: `Bearer ${token}` } }));
  }

  async fetchProducts(q: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    this.requireEnv();
    if (q.retailerSkus?.length) {
      const out: NormalizedListing[] = [];
      for (const id of q.retailerSkus.slice(0, 20)) {
        const r = await this.fetchProductDetails(id);
        if (r.data) out.push(r.data);
      }
      return this.result(out, this.source);
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
    const res = await this.call("/products", params);
    const listings = arr(get(res, "data"))
      .map((p) => this.normalizeProduct(p))
      .filter((l): l is NormalizedListing => l !== null);
    return this.result(listings, this.source);
  }

  async fetchProductDetails(productId: string): Promise<FetchResult<NormalizedListing | null>> {
    const res = await this.call(`/products/${encodeURIComponent(productId)}`, {});
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
    const stock = str(get(item, "inventory.stockLevel"));
    const availability: Availability = stock === "HIGH" ? "in_stock" : stock === "LOW" ? "limited" : stock === "TEMPORARILY_OUT_OF_STOCK" ? "out_of_stock" : "unknown";
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
