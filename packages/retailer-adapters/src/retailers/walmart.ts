/**
 * Walmart — Affiliate API (walmart.io). Docs: https://walmart.io/apidocs/affiliates/quickstart
 * Base: https://developer.api.walmart.com/api-proxy/service/affil/product/v2
 * Auth: RSA-SHA256 signature headers
 *   WM_CONSUMER.ID, WM_CONSUMER.INTIMESTAMP (epoch ms), WM_SEC.KEY_VERSION,
 *   WM_SEC.AUTH_SIGNATURE = base64(sign(consumerId + "\n" + timestamp + "\n" + keyVersion + "\n"))
 * Endpoints: search?query=..., items?ids=a,b | items?upc=...
 * Links must use `productTrackingUrl` (affiliate tracked) per Walmart's display terms.
 * Requires an approved Walmart affiliate (Impact) account + uploaded public key.
 */
import { createSign } from "node:crypto";
import { BaseRetailerAdapter } from "../base";
import type { FetchResult, NormalizedListing, ProductQuery } from "../types";
import { arr, cleanGtin, compactAttrs, get, isObject, mapAvailability, mapCondition, str, toCents } from "../util";

const BASE = "https://developer.api.walmart.com/api-proxy/service/affil/product/v2";

/** Build Walmart's signature headers. Exported for testing. */
export function walmartAuthHeaders(consumerId: string, privateKeyPem: string, keyVersion: string, timestampMs: number): Record<string, string> {
  const ts = String(timestampMs);
  const payload = `${consumerId}\n${ts}\n${keyVersion}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(payload);
  signer.end();
  const signature = signer.sign(normalizePem(privateKeyPem), "base64");
  return {
    "WM_CONSUMER.ID": consumerId,
    "WM_CONSUMER.INTIMESTAMP": ts,
    "WM_SEC.KEY_VERSION": keyVersion,
    "WM_SEC.AUTH_SIGNATURE": signature,
  };
}

/** Env vars often carry PEMs with literal "\n"; also accept bare base64 PKCS#8 bodies. */
export function normalizePem(pem: string): string {
  const p = pem.replace(/\\n/g, "\n").trim();
  if (p.includes("-----BEGIN")) return p;
  const body = p.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

export class WalmartAffiliateAdapter extends BaseRetailerAdapter {
  readonly id = "walmart";
  readonly name = "Walmart";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["WALMART_CONSUMER_ID", "WALMART_PRIVATE_KEY", "WALMART_KEY_VERSION"] as const;
  protected readonly source = "api" as const;
  // Default quota reported as 5,000 calls/day (UNVERIFIED officially); stay well under per-second bursts.
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 2 };

  private async call(path: string, params: Record<string, string>): Promise<unknown> {
    const env = this.requireEnv();
    const qs = new URLSearchParams(params);
    const publisherId = this.envValue("WALMART_PUBLISHER_ID");
    if (publisherId) qs.set("publisherId", publisherId);
    const headers = walmartAuthHeaders(env.WALMART_CONSUMER_ID as string, env.WALMART_PRIVATE_KEY as string, env.WALMART_KEY_VERSION as string, this.clock.now());
    return this.guard(() => this.http.json({ url: `${BASE}/${path}?${qs.toString()}`, headers }));
  }

  async fetchProducts(query: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    this.requireEnv();
    let res: unknown;
    if (query.retailerSkus?.length) res = await this.call("items", { ids: query.retailerSkus.slice(0, 20).join(",") });
    else if (query.gtin) res = await this.call("items", { upc: query.gtin });
    else if (query.keywords) {
      const pageSize = Math.min(25, Math.max(1, query.pageSize ?? 25));
      res = await this.call("search", {
        query: query.keywords,
        numItems: String(pageSize),
        start: String((Math.max(1, query.page ?? 1) - 1) * pageSize + 1),
      });
    } else throw new RangeError("keywords, gtin or retailerSkus required");
    const listings = arr(get(res, "items"))
      .map((i) => this.normalizeProduct(i))
      .filter((l): l is NormalizedListing => l !== null)
      .filter((l) => inRange(l, query));
    return this.result(listings, this.source);
  }

  async fetchProductDetails(itemId: string): Promise<FetchResult<NormalizedListing | null>> {
    const r = await this.fetchProducts({ retailerSkus: [itemId] });
    return { ...r, data: r.data[0] ?? null };
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (!isObject(raw)) return null;
    const itemId = str(raw.itemId);
    const title = str(raw.name);
    if (!itemId || !title) return null;
    const tracking = str(raw.productTrackingUrl);
    const productUrl = str(raw.productUrl) ?? `https://www.walmart.com/ip/${itemId}`;
    const priceCents = toCents(raw.salePrice);
    const stock = str(raw.stock);
    const product = {
      retailerId: this.id,
      retailerSku: itemId,
      title,
      brand: str(raw.brandName),
      mpn: null,
      model: str(raw.modelNumber),
      gtin: cleanGtin(raw.upc),
      imageUrl: str(raw.largeImage) ?? str(raw.mediumImage) ?? str(raw.thumbnailImage),
      productUrl,
      categoryPath: (str(raw.categoryPath) ?? "").split("/").map((s) => s.trim()).filter(Boolean),
      description: str(raw.shortDescription),
      attributes: compactAttrs({ color: str(raw.color) }),
    };
    const shipRate = raw.standardShipRate;
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.id,
            retailerSku: itemId,
            priceCents,
            listPriceCents: toCents(raw.msrp),
            currency: "USD",
            availability: raw.availableOnline === false ? ("out_of_stock" as const) : mapAvailability(stock),
            condition: mapCondition(str(raw.condition) ?? "new"),
            productUrl,
            affiliateUrl: tracking,
            shippingCents: typeof shipRate === "number" ? toCents(shipRate) : raw.freeShippingOver35Dollars === true && priceCents >= 3500 ? 0 : null,
            sellerName: str(get(raw, "sellerInfo")) ?? (raw.marketplace === true ? null : "Walmart.com"),
            source: this.source,
            observedAt: this.nowIso(),
          }
        : null;
    return { product, offer };
  }

  protected async ping(): Promise<void> {
    await this.call("taxonomy", {});
  }
}

function inRange(l: NormalizedListing, q: ProductQuery): boolean {
  const p = l.offer?.priceCents;
  if (p === undefined) return q.minPriceCents === undefined && q.maxPriceCents === undefined;
  if (q.minPriceCents !== undefined && p < q.minPriceCents) return false;
  if (q.maxPriceCents !== undefined && p > q.maxPriceCents) return false;
  return true;
}
