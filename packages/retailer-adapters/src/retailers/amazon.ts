/**
 * Amazon — Creators API (successor of PA-API 5, which was deprecated in 2026 and now returns 403).
 * Docs: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
 *
 * Auth: OAuth2 client credentials. Token endpoint depends on the credential version:
 *   v3.x (Login with Amazon, JSON body, scope "creatorsapi::default"): 3.1 NA / 3.2 EU / 3.3 FE
 *   v2.x (Cognito, form body + Basic auth, scope "creatorsapi/default"): 2.1 NA / 2.2 EU / 2.3 FE
 * Calls: POST https://creatorsapi.amazon/catalog/v1/{searchItems|getItems}
 *   headers: Authorization: Bearer <token>, x-marketplace: www.amazon.com
 *   body (lowerCamelCase): partnerTag, marketplace, resources[], keywords | itemIds
 * NOTE: getItems path is confirmed in Amazon's curl guide; the searchItems path is inferred from
 * the migration guide (UNVERIFIED exact path) — verify against a live sandbox before go-live.
 * Access requires an approved Associates account with 10 qualifying sales in the last 30 days.
 */
import { BaseRetailerAdapter, type AdapterOptions } from "../base";
import { ResponseShapeError } from "../errors";
import { TokenCache } from "../oauth";
import type { AffiliateLinkOptions, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, base64, cleanGtin, get, isObject, mapAvailability, mapCondition, str, toCents } from "../util";

const API_BASE = "https://creatorsapi.amazon/catalog/v1";

const TOKEN_ENDPOINTS: Record<string, { url: string; style: "lwa" | "cognito" }> = {
  "3.1": { url: "https://api.amazon.com/auth/o2/token", style: "lwa" },
  "3.2": { url: "https://api.amazon.co.uk/auth/o2/token", style: "lwa" },
  "3.3": { url: "https://api.amazon.co.jp/auth/o2/token", style: "lwa" },
  "2.1": { url: "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token", style: "cognito" },
  "2.2": { url: "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token", style: "cognito" },
  "2.3": { url: "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token", style: "cognito" },
};

export const AMAZON_RESOURCES = [
  "itemInfo.title",
  "itemInfo.byLineInfo",
  "itemInfo.externalIds",
  "itemInfo.manufactureInfo",
  "itemInfo.classifications",
  "images.primary.large",
  "offersV2.listings.price",
  "offersV2.listings.availability",
  "offersV2.listings.condition",
  "offersV2.listings.merchantInfo",
  "offersV2.listings.isBuyBoxWinner",
] as const;

export class AmazonCreatorsAdapter extends BaseRetailerAdapter {
  readonly id = "amazon";
  readonly name = "Amazon";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = [
    "AMAZON_CREATORS_CREDENTIAL_ID",
    "AMAZON_CREATORS_CREDENTIAL_SECRET",
    "AMAZON_CREATORS_CREDENTIAL_VERSION",
    "AMAZON_ASSOCIATE_TAG",
  ] as const;
  protected readonly source = "api" as const;
  // New credentials: 1 TPS / 8,640 TPD for the first 30 days.
  protected override defaultRateLimit = { capacity: 1, refillPerSecond: 1 };
  protected override ttlSeconds = 3600;
  private readonly tokens: TokenCache;

  constructor(options: AdapterOptions = {}) {
    super(options);
    this.tokens = new TokenCache(this.clock);
  }

  private get marketplace(): string {
    return this.envValue("AMAZON_MARKETPLACE") ?? "www.amazon.com";
  }

  private async token(): Promise<string> {
    const env = this.requireEnv();
    const version = env.AMAZON_CREATORS_CREDENTIAL_VERSION as string;
    const ep = TOKEN_ENDPOINTS[version];
    if (!ep) throw new ResponseShapeError(this.id, `unsupported credential version "${version}" (expected one of ${Object.keys(TOKEN_ENDPOINTS).join(", ")})`);
    return this.tokens.get(async () => {
      const id = env.AMAZON_CREATORS_CREDENTIAL_ID as string;
      const secret = env.AMAZON_CREATORS_CREDENTIAL_SECRET as string;
      const res =
        ep.style === "lwa"
          ? await this.http.json<Record<string, unknown>>({
              url: ep.url,
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "creatorsapi::default" }),
            })
          : await this.http.json<Record<string, unknown>>({
              url: ep.url,
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${base64(`${id}:${secret}`)}` },
              body: "grant_type=client_credentials&scope=creatorsapi%2Fdefault",
            });
      const accessToken = str(res.access_token);
      if (!accessToken) throw new ResponseShapeError(this.id, "token response without access_token");
      return { accessToken, expiresInSec: typeof res.expires_in === "number" ? res.expires_in : 3600 };
    });
  }

  private async call(operation: "searchItems" | "getItems", body: Record<string, unknown>): Promise<unknown> {
    const env = this.requireEnv();
    const token = await this.token();
    return this.guard(() =>
      this.http.json({
        url: `${API_BASE}/${operation}`,
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-marketplace": this.marketplace },
        body: JSON.stringify({ partnerTag: env.AMAZON_ASSOCIATE_TAG, marketplace: this.marketplace, resources: AMAZON_RESOURCES, ...body }),
      }),
    );
  }

  async fetchProducts(query: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    this.requireEnv();
    if (query.retailerSkus?.length) {
      const res = await this.call("getItems", { itemIds: query.retailerSkus.slice(0, 10), itemIdType: "ASIN" });
      return this.result(this.mapItems(get(res, "itemsResult.items")), this.source);
    }
    const keywords = query.gtin ?? query.keywords;
    if (!keywords) throw new RangeError("keywords, gtin or retailerSkus required");
    const body: Record<string, unknown> = {
      keywords,
      searchIndex: "All",
      itemCount: Math.min(10, Math.max(1, query.pageSize ?? 10)),
      itemPage: Math.max(1, query.page ?? 1),
    };
    if (query.brand) body.brand = query.brand;
    // Creators API takes min/max price in the lowest currency denomination (cents).
    if (query.minPriceCents !== undefined) body.minPrice = query.minPriceCents;
    if (query.maxPriceCents !== undefined) body.maxPrice = query.maxPriceCents;
    const res = await this.call("searchItems", body);
    return this.result(this.mapItems(get(res, "searchResult.items")), this.source);
  }

  async fetchProductDetails(asin: string): Promise<FetchResult<NormalizedListing | null>> {
    const r = await this.fetchProducts({ retailerSkus: [asin] });
    return { ...r, data: r.data[0] ?? null };
  }

  private mapItems(items: unknown): NormalizedListing[] {
    return arr(items)
      .map((i) => this.normalizeProduct(i))
      .filter((l): l is NormalizedListing => l !== null);
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const asin = str(raw.asin);
    const title = str(get(raw, "itemInfo.title.displayValue"));
    if (!asin || !title) return null;
    const listings = arr(get(raw, "offersV2.listings"));
    const listing = listings.find((l) => get(l, "isBuyBoxWinner") === true) ?? listings[0];
    const gtin = cleanGtin(get(raw, "itemInfo.externalIds.upcs.displayValues.0")) ?? cleanGtin(get(raw, "itemInfo.externalIds.eans.displayValues.0"));
    const url = str(raw.detailPageURL);
    const product = {
      retailerId: this.id,
      retailerSku: asin,
      title,
      brand: str(get(raw, "itemInfo.byLineInfo.brand.displayValue")) ?? str(get(raw, "itemInfo.byLineInfo.manufacturer.displayValue")),
      mpn: str(get(raw, "itemInfo.manufactureInfo.itemPartNumber.displayValue")),
      model: str(get(raw, "itemInfo.manufactureInfo.model.displayValue")),
      gtin,
      imageUrl: str(get(raw, "images.primary.large.url")),
      productUrl: url,
      categoryPath: [str(get(raw, "itemInfo.classifications.productGroup.displayValue"))].filter((x): x is string => !!x),
      description: null,
      attributes: {},
    };
    const priceCents = listing ? toCents(get(listing, "price.money.amount")) : null;
    const offer =
      listing && priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: asin,
            priceCents,
            listPriceCents: toCents(get(listing, "price.savingBasis.money.amount")),
            currency: str(get(listing, "price.money.currency")) ?? "USD",
            availability: mapAvailability(str(get(listing, "availability.type"))),
            condition: mapCondition(str(get(listing, "condition.value"))),
            productUrl: url,
            // detailPageURL returned by the API already carries the partner tag
            affiliateUrl: url,
            shippingCents: null,
            sellerName: str(get(listing, "merchantInfo.name")),
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  override generateAffiliateLink(productUrl: string, opts: AffiliateLinkOptions = {}): string | null {
    const tag = this.envValue("AMAZON_ASSOCIATE_TAG");
    if (!tag) return null;
    let u: URL;
    try {
      u = new URL(productUrl);
    } catch {
      return null;
    }
    if (!(u.hostname === "amazon.com" || u.hostname.endsWith(".amazon.com"))) return null;
    const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u.pathname)?.[1];
    const out = new URL(asin ? `https://www.amazon.com/dp/${asin.toUpperCase()}` : `https://www.amazon.com${u.pathname}`);
    out.searchParams.set("tag", tag);
    if (opts.subId) out.searchParams.set("ascsubtag", opts.subId);
    return out.toString();
  }

  protected async ping(): Promise<void> {
    await this.token();
  }
}
