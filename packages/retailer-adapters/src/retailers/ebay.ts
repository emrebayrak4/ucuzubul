/**
 * eBay — Buy Browse API v1 + eBay Partner Network (EPN).
 * Docs: https://developer.ebay.com/develop/api/buy/browse_api.md
 * Token: POST /identity/v1/oauth2/token (client credentials, scope https://api.ebay.com/oauth/api_scope)
 * Search: GET /buy/browse/v1/item_summary/search?q=&gtin=&limit=&offset=&filter=
 * Item:   GET /buy/browse/v1/item/{item_id}   (has gtin/brand/mpn and availability)
 * Headers: X-EBAY-C-MARKETPLACE-ID: EBAY_US, X-EBAY-C-ENDUSERCTX: affiliateCampaignId=<EPN campaign>
 * Commission requires sending buyers through `itemAffiliateWebUrl`.
 * Default Browse quota: 5,000 calls/day (raise via Application Growth Check).
 */
import { BaseRetailerAdapter, type AdapterOptions } from "../base";
import { ResponseShapeError } from "../errors";
import { TokenCache } from "../oauth";
import type { AffiliateLinkOptions, Availability, Condition, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, base64, cleanGtin, compactAttrs, get, isObject, mapCondition, str, toCents } from "../util";

/** eBay conditionId -> our condition enum. */
export function ebayCondition(conditionId: unknown, label: unknown): Condition {
  const id = Number(conditionId);
  if (Number.isFinite(id) && id > 0) {
    if (id === 1000) return "new";
    if (id === 1500 || id === 1750) return "open_box";
    if (id >= 2000 && id <= 2500) return "refurbished";
    if (id >= 2750) return "used";
  }
  return mapCondition(typeof label === "string" ? label : "");
}

export class EbayBrowseAdapter extends BaseRetailerAdapter {
  readonly id = "ebay";
  readonly name = "eBay";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_EPN_CAMPAIGN_ID"] as const;
  protected readonly source = "api" as const;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 2 };
  protected override ttlSeconds = 1800;
  private readonly tokens: TokenCache;

  constructor(options: AdapterOptions = {}) {
    super(options);
    this.tokens = new TokenCache(this.clock);
  }

  private get apiBase(): string {
    return this.envValue("EBAY_ENVIRONMENT") === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  }

  private async token(): Promise<string> {
    const env = this.requireEnv();
    return this.tokens.get(async () => {
      const res = await this.http.json<Record<string, unknown>>({
        url: `${this.apiBase}/identity/v1/oauth2/token`,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${base64(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`)}`,
        },
        body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
      });
      const accessToken = str(res.access_token);
      if (!accessToken) throw new ResponseShapeError(this.id, "token response without access_token");
      return { accessToken, expiresInSec: typeof res.expires_in === "number" ? res.expires_in : 7200 };
    });
  }

  private async headers(): Promise<Record<string, string>> {
    const env = this.requireEnv();
    const token = await this.token();
    const ctx = [`affiliateCampaignId=${env.EBAY_EPN_CAMPAIGN_ID}`];
    const ref = this.envValue("EBAY_EPN_REFERENCE_ID");
    if (ref) ctx.push(`affiliateReferenceId=${ref}`);
    return {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": ctx.join(","),
    };
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
    const params = new URLSearchParams();
    if (q.gtin) params.set("gtin", q.gtin);
    if (q.keywords) params.set("q", q.keywords);
    if (!q.gtin && !q.keywords) throw new RangeError("keywords, gtin or retailerSkus required");
    const limit = Math.min(200, Math.max(1, q.pageSize ?? 50));
    params.set("limit", String(limit));
    params.set("offset", String((Math.max(1, q.page ?? 1) - 1) * limit));
    const filters = ["buyingOptions:{FIXED_PRICE}", "priceCurrency:USD"];
    if (q.minPriceCents !== undefined || q.maxPriceCents !== undefined) {
      const lo = q.minPriceCents !== undefined ? (q.minPriceCents / 100).toFixed(2) : "";
      const hi = q.maxPriceCents !== undefined ? (q.maxPriceCents / 100).toFixed(2) : "";
      filters.push(`price:[${lo}..${hi}]`);
    }
    params.set("filter", filters.join(","));
    const headers = await this.headers();
    const res = await this.guard(() => this.http.json({ url: `${this.apiBase}/buy/browse/v1/item_summary/search?${params.toString()}`, headers }));
    const listings = arr(get(res, "itemSummaries"))
      .map((i) => this.normalizeProduct(i))
      .filter((l): l is NormalizedListing => l !== null);
    return this.result(listings, this.source);
  }

  async fetchProductDetails(itemId: string): Promise<FetchResult<NormalizedListing | null>> {
    const headers = await this.headers();
    const res = await this.guard(() => this.http.json({ url: `${this.apiBase}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, headers }));
    return this.result(this.normalizeProduct(res), this.source);
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const itemId = str(raw.itemId);
    const title = str(raw.title);
    if (!itemId || !title) return null;
    const currency = str(get(raw, "price.currency")) ?? "USD";
    const priceCents = currency === "USD" ? toCents(get(raw, "price.value")) : null;
    const webUrl = str(raw.itemWebUrl);
    const affiliate = str(raw.itemAffiliateWebUrl) ?? (webUrl ? this.generateAffiliateLink(webUrl) : null);
    const ship = arr(raw.shippingOptions)[0];
    const shipValue = get(ship, "shippingCost.value");
    const availStatus = str(get(raw, "estimatedAvailabilities.0.estimatedAvailabilityStatus"));
    const availability: Availability =
      availStatus === "IN_STOCK" ? "in_stock" : availStatus === "LIMITED_STOCK" ? "limited" : availStatus === "OUT_OF_STOCK" ? "out_of_stock" : priceCents ? "in_stock" : "unknown";
    const product = {
      retailerId: this.id,
      retailerSku: itemId,
      title,
      brand: str(raw.brand),
      mpn: str(raw.mpn),
      model: str(raw.mpn),
      gtin: cleanGtin(raw.gtin),
      imageUrl: str(get(raw, "image.imageUrl")),
      productUrl: webUrl,
      categoryPath: arr(raw.categories).map((c) => str(get(c, "categoryName"))).filter((x): x is string => !!x),
      description: str(raw.shortDescription),
      attributes: compactAttrs({ epid: str(raw.epid) }),
    };
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: itemId,
            priceCents,
            listPriceCents: toCents(get(raw, "marketingPrice.originalPrice.value")),
            currency,
            availability,
            condition: ebayCondition(raw.conditionId, raw.condition),
            productUrl: webUrl,
            affiliateUrl: affiliate,
            shippingCents: shipValue !== undefined ? toCents(shipValue) : null,
            sellerName: str(get(raw, "seller.username")),
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  /** EPN link parameters for US (rover-less "smart link" format). */
  override generateAffiliateLink(productUrl: string, opts: AffiliateLinkOptions = {}): string | null {
    const campaign = this.envValue("EBAY_EPN_CAMPAIGN_ID");
    if (!campaign) return null;
    let u: URL;
    try {
      u = new URL(productUrl);
    } catch {
      return null;
    }
    if (!(u.hostname === "ebay.com" || u.hostname.endsWith(".ebay.com"))) return null;
    u.searchParams.set("mkcid", "1");
    u.searchParams.set("mkrid", "711-53200-19255-0");
    u.searchParams.set("siteid", "0");
    u.searchParams.set("campid", campaign);
    u.searchParams.set("toolid", "10001");
    u.searchParams.set("mkevt", "1");
    if (opts.subId) u.searchParams.set("customid", opts.subId);
    return u.toString();
  }

  protected async ping(): Promise<void> {
    await this.token();
  }
}
