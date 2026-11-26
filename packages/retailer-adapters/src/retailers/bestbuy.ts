/**
 * Best Buy — Products API. Docs: https://bestbuyapis.github.io/api-documentation/
 * GET https://api.bestbuy.com/v1/products(<filters>)?apiKey=...&format=json&show=...&pageSize=&page=
 * Limits (developer.bestbuy.com/legal): 5 calls/second, 50,000/day; data cache max 72 hours.
 * LEGAL NOTE: the API terms restrict using Best Buy content to analyze Best Buy pricing for third
 * parties — get a legal read before using this adapter for price comparison (see DATA_SOURCES.md).
 */
import { BaseRetailerAdapter } from "../base";
import type { AffiliateLinkOptions, FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, cleanGtin, compactAttrs, get, isObject, mapCondition, str, toCents } from "../util";

const BASE = "https://api.bestbuy.com/v1";
export const BESTBUY_SHOW_FIELDS = [
  "sku", "name", "salePrice", "regularPrice", "onSale", "onlineAvailability", "inStoreAvailability", "upc",
  "manufacturer", "modelNumber", "url", "image", "affiliateUrl", "addToCartUrl", "condition", "freeShipping",
  "shippingCost", "categoryPath.name", "color", "shortDescription",
].join(",");

/** Sanitize free text into Best Buy's products(search=...&search=...) syntax. */
export function bestBuySearchFilter(keywords: string): string {
  const words = keywords
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.map((w) => `search=${encodeURIComponent(w)}`).join("&");
}

export class BestBuyAdapter extends BaseRetailerAdapter {
  readonly id = "bestbuy";
  readonly name = "Best Buy";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["BESTBUY_API_KEY"] as const;
  protected readonly source = "api" as const;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 5 };
  // Terms cap caching at 72h; refresh much more often for prices.
  protected override ttlSeconds = 3600;

  private async query(filter: string, page = 1, pageSize = 25): Promise<unknown> {
    const env = this.requireEnv();
    const qs = new URLSearchParams({
      apiKey: env.BESTBUY_API_KEY as string,
      format: "json",
      show: BESTBUY_SHOW_FIELDS,
      pageSize: String(Math.min(100, Math.max(1, pageSize))),
      page: String(Math.max(1, page)),
    });
    return this.guard(() => this.http.json({ url: `${BASE}/products(${filter})?${qs.toString()}` }));
  }

  async fetchProducts(q: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    this.requireEnv();
    const parts: string[] = [];
    if (q.retailerSkus?.length) parts.push(`sku in(${q.retailerSkus.filter((s) => /^\d+$/.test(s)).slice(0, 100).join(",")})`);
    else if (q.gtin) {
      const g = cleanGtin(q.gtin);
      if (!g) throw new RangeError("invalid GTIN");
      parts.push(`upc=${g.length === 13 && g.startsWith("0") ? g.slice(1) : g}`);
    } else if (q.keywords) parts.push(bestBuySearchFilter(q.keywords));
    else throw new RangeError("keywords, gtin or retailerSkus required");
    if (q.minPriceCents !== undefined) parts.push(`salePrice>=${(q.minPriceCents / 100).toFixed(2)}`);
    if (q.maxPriceCents !== undefined) parts.push(`salePrice<=${(q.maxPriceCents / 100).toFixed(2)}`);
    const res = await this.query(parts.join("&"), q.page, q.pageSize);
    const listings = arr(get(res, "products"))
      .map((p) => this.normalizeProduct(p))
      .filter((l): l is NormalizedListing => l !== null);
    return this.result(listings, this.source);
  }

  async fetchProductDetails(sku: string): Promise<FetchResult<NormalizedListing | null>> {
    const r = await this.fetchProducts({ retailerSkus: [sku] });
    return { ...r, data: r.data[0] ?? null };
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const sku = str(raw.sku);
    const title = str(raw.name);
    if (!sku || !title) return null;
    const url = str(raw.url);
    const priceCents = toCents(raw.salePrice);
    const regular = toCents(raw.regularPrice);
    const categoryPath = arr(raw.categoryPath).map((c) => str(get(c, "name"))).filter((x): x is string => !!x);
    const product = {
      retailerId: this.id,
      retailerSku: sku,
      title,
      brand: str(raw.manufacturer),
      mpn: str(raw.modelNumber),
      model: str(raw.modelNumber),
      gtin: cleanGtin(raw.upc),
      imageUrl: str(raw.image),
      productUrl: url,
      categoryPath,
      description: str(raw.shortDescription),
      attributes: compactAttrs({ color: str(raw.color) }),
    };
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: sku,
            priceCents,
            listPriceCents: regular !== null && regular > priceCents ? regular : null,
            currency: "USD",
            availability: raw.onlineAvailability === true ? ("in_stock" as const) : raw.onlineAvailability === false ? ("out_of_stock" as const) : ("unknown" as const),
            condition: mapCondition(str(raw.condition)),
            productUrl: url,
            affiliateUrl: url ? this.generateAffiliateLink(str(raw.affiliateUrl) ?? url) : null,
            shippingCents: raw.freeShipping === true ? 0 : typeof raw.shippingCost === "number" ? toCents(raw.shippingCost) : null,
            sellerName: "Best Buy",
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  /**
   * Best Buy affiliate links run on Impact. With BESTBUY_AFFILIATE_LINK_TEMPLATE (an Impact
   * deep link containing "{url}" and optionally "{subId}") we wrap the URL;
   * otherwise no affiliate link is produced.
   */
  override generateAffiliateLink(productUrl: string, opts: AffiliateLinkOptions = {}): string | null {
    const tpl = this.envValue("BESTBUY_AFFILIATE_LINK_TEMPLATE");
    if (!tpl) return null;
    return tpl.replace("{url}", encodeURIComponent(productUrl)).replace("{subId}", encodeURIComponent(opts.subId ?? ""));
  }

  protected async ping(): Promise<void> {
    await this.query("sku=0", 1, 1);
  }
}
