/**
 * Etsy — Open API v3 (public listings, API-key auth).
 * Docs: https://developers.etsy.com/documentation/reference#operation/findAllListingsActive
 *   Search: GET /v3/application/listings/active?keywords=&limit=&offset=&min_price=&max_price=
 *   Enrich: GET /v3/application/listings/batch?listing_ids=&includes=Images,Shop   (images + shop name)
 *   Item:   GET /v3/application/listings/{listing_id}?includes=Images,Shop
 *   Ping:   GET /v3/application/openapi-ping
 * Header `x-api-key`: the app keystring, or "keystring:shared_secret" when ETSY_SHARED_SECRET is set
 * (Etsy's newer key format). Price is { amount, divisor, currency_code } → exact integer cents.
 * Condition: handmade / made-to-order / supplies → "new"; vintage (when_made before 2006, Etsy's
 * 20-year vintage rule) → "used" with attribute etsyType=vintage. Only USD offers are emitted.
 * Affiliate commissions run through Awin (not wired here) — generateAffiliateLink returns null.
 */
import { BaseRetailerAdapter } from "../base";
import type { Availability, Condition, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, compactAttrs, get, isObject, str } from "../util";

/** Etsy Money {amount, divisor} → integer cents (half-up when divisor is finer than cents). */
export function etsyPriceToCents(price: unknown): number | null {
  const amount = get(price, "amount");
  const divisor = get(price, "divisor");
  if (typeof amount !== "number" || typeof divisor !== "number") return null;
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(divisor) || amount < 0 || divisor <= 0) return null;
  const scaled = amount * 100;
  if (!Number.isSafeInteger(scaled)) return null;
  const whole = Math.floor(scaled / divisor);
  const rem = scaled - whole * divisor;
  return rem * 2 >= divisor ? whole + 1 : whole;
}

const NEW_WHEN_MADE = /^(made_to_order|20(0[6-9]|1\d|2\d)_20\d\d)$/;

export function etsyIsVintage(whenMade: unknown): boolean {
  return typeof whenMade === "string" && whenMade !== "" && !NEW_WHEN_MADE.test(whenMade);
}

export class EtsyAdapter extends BaseRetailerAdapter {
  readonly id = "etsy";
  readonly name = "Etsy";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["ETSY_API_KEY"] as const;
  protected readonly source = "api" as const;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 5 };
  protected override ttlSeconds = 3600;
  private readonly apiBase = "https://openapi.etsy.com/v3/application";

  private headers(): Record<string, string> {
    const env = this.requireEnv();
    const secret = this.envValue("ETSY_SHARED_SECRET");
    return { "x-api-key": secret ? `${env.ETSY_API_KEY}:${secret}` : (env.ETSY_API_KEY as string) };
  }

  async fetchProducts(q: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    const headers = this.headers();
    if (q.retailerSkus?.length) {
      const ids = q.retailerSkus.filter((s) => /^\d+$/.test(s)).slice(0, 100);
      return this.result(await this.batch(ids, headers), this.source);
    }
    if (!q.keywords) throw new RangeError("keywords or retailerSkus required (Etsy has no GTIN search)");
    const limit = Math.min(100, Math.max(1, q.pageSize ?? 25));
    const params = new URLSearchParams({ keywords: q.keywords, limit: String(limit), offset: String((Math.max(1, q.page ?? 1) - 1) * limit) });
    if (q.minPriceCents !== undefined) params.set("min_price", (q.minPriceCents / 100).toFixed(2));
    if (q.maxPriceCents !== undefined) params.set("max_price", (q.maxPriceCents / 100).toFixed(2));
    const res = await this.guard(() => this.http.json({ url: `${this.apiBase}/listings/active?${params.toString()}`, headers }));
    const ids = arr(get(res, "results"))
      .map((r) => str(get(r, "listing_id")))
      .filter((x): x is string => !!x);
    // Enrich with images + shop name (listings/active does not support `includes`).
    const enriched = ids.length ? await this.batch(ids, headers) : [];
    const byId = new Map(enriched.map((l) => [l.product.retailerSku, l]));
    const listings = arr(get(res, "results"))
      .map((r) => byId.get(str(get(r, "listing_id")) ?? "") ?? this.normalizeProduct(r))
      .filter((l): l is NormalizedListing => l !== null);
    return this.result(listings, this.source);
  }

  private async batch(ids: string[], headers: Record<string, string>): Promise<NormalizedListing[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({ listing_ids: ids.join(","), includes: "Images,Shop" });
    const res = await this.guard(() => this.http.json({ url: `${this.apiBase}/listings/batch?${params.toString()}`, headers }));
    return arr(get(res, "results"))
      .map((r) => this.normalizeProduct(r))
      .filter((l): l is NormalizedListing => l !== null);
  }

  async fetchProductDetails(listingId: string): Promise<FetchResult<NormalizedListing | null>> {
    const headers = this.headers();
    if (!/^\d+$/.test(listingId)) return this.result(null, this.source, ["invalid Etsy listing id"]);
    const res = await this.guard(() => this.http.json({ url: `${this.apiBase}/listings/${listingId}?includes=Images,Shop`, headers }));
    return this.result(this.normalizeProduct(res), this.source);
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const id = str(raw.listing_id);
    const title = str(raw.title);
    if (!id || !title) return null;
    const currency = str(get(raw, "price.currency_code")) ?? "USD";
    const priceCents = currency === "USD" ? etsyPriceToCents(raw.price) : null;
    const url = str(raw.url);
    const vintage = etsyIsVintage(raw.when_made);
    const condition: Condition = vintage ? "used" : "new";
    const qty = typeof raw.quantity === "number" ? raw.quantity : null;
    const state = str(raw.state);
    const availability: Availability =
      state && state !== "active" ? "out_of_stock" : qty === null ? "unknown" : qty <= 0 ? "out_of_stock" : qty <= 3 ? "limited" : "in_stock";
    const images = arr(raw.images);
    const product = {
      retailerId: this.id,
      retailerSku: id,
      title,
      brand: null,
      mpn: null,
      model: null,
      gtin: null,
      imageUrl: str(get(images[0], "url_570xN")) ?? str(get(images[0], "url_fullxfull")),
      productUrl: url,
      categoryPath: [],
      description: str(raw.description),
      attributes: compactAttrs({
        etsyType: vintage ? "vintage" : raw.is_supply === true ? "supply" : "handmade",
        whenMade: str(raw.when_made),
        whoMade: str(raw.who_made),
        shopId: str(raw.shop_id),
      }),
    };
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: id,
            priceCents,
            listPriceCents: null,
            currency,
            availability,
            condition,
            productUrl: url,
            affiliateUrl: null,
            shippingCents: null,
            sellerName: str(get(raw, "shop.shop_name")),
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  protected async ping(): Promise<void> {
    await this.http.json({ url: `${this.apiBase}/openapi-ping`, headers: this.headers() });
  }
}
