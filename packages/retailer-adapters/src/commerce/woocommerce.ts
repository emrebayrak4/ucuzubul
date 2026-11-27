/**
 * WooCommerce — REST API v3.
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/#list-all-products
 *   GET {storeUrl}/wp-json/wc/v3/products?per_page=&page=&status=publish   (X-WP-TotalPages header)
 *   GET {storeUrl}/wp-json/wc/v3/data/currencies/current                    (store currency, first page)
 * Auth: consumer key/secret as HTTP Basic — https only (http URLs are rejected), plus the SSRF guard
 * (store URL is merchant-supplied and fetched server-side).
 * Inventory is online-only (no locations). Variable products are synced at the parent level
 * (`price` = current/lowest price); variations are not expanded.
 *
 * Config: storeUrl, consumerKey, consumerSecret; optional defaultCondition.
 */
import { ResponseShapeError } from "../errors";
import { arr, base64, cleanGtin, get, isObject, str, toCents } from "../util";
import { BaseCommerceConnector, clampLimit, parseQuantity, plainText, stockFromQuantity, type CommerceConnectorOptions } from "./base";
import type { CommerceConfig, CommerceProduct, CommerceStock, CommerceSyncOptions, CommerceSyncResult } from "./types";
import { assertPublicHttpsUrl, type HostResolver } from "./urlGuard";

export interface WooCommerceConnectorOptions extends CommerceConnectorOptions {
  resolveHost?: HostResolver;
}

function wooStock(status: string | null, quantity: number | null): CommerceStock {
  if (quantity !== null) return stockFromQuantity(quantity);
  if (status === "instock") return "in_stock";
  if (status === "outofstock") return "out_of_stock";
  return "unknown"; // onbackorder / missing
}

export class WooCommerceConnector extends BaseCommerceConnector {
  readonly provider = "woocommerce" as const;
  readonly requiredConfig = ["storeUrl", "consumerKey", "consumerSecret"];
  private currency: string | null = null;

  constructor(config: CommerceConfig, protected readonly wooOptions: WooCommerceConnectorOptions = {}) {
    super(config, wooOptions);
  }

  private async baseUrl(): Promise<string> {
    const u = await assertPublicHttpsUrl(this.required("storeUrl"), this.wooOptions.resolveHost);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  }

  protected async fetchPage(opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">> {
    const base = await this.baseUrl();
    const headers = { Authorization: `Basic ${base64(`${this.required("consumerKey")}:${this.required("consumerSecret")}`)}` };
    const page = opts.cursor ? Number(opts.cursor) : 1;
    if (!Number.isSafeInteger(page) || page < 1) throw new RangeError("invalid cursor");
    const perPage = clampLimit(opts.limit, 50, 100);

    if (page === 1 || !this.currency) {
      const cur = await this.http.json<unknown>({ url: `${base}/wp-json/wc/v3/data/currencies/current`, headers });
      this.currency = str(get(cur, "code"));
    }
    const currency = this.currency ?? "USD";

    const params = new URLSearchParams({ per_page: String(perPage), page: String(page), status: "publish" });
    const res = await this.http.request({ url: `${base}/wp-json/wc/v3/products?${params.toString()}`, headers: { Accept: "application/json", ...headers } });
    let body: unknown;
    try {
      body = JSON.parse(res.text);
    } catch {
      throw new ResponseShapeError("commerce:woocommerce", "products response is not JSON");
    }
    if (!Array.isArray(body)) throw new ResponseShapeError("commerce:woocommerce", "products response is not an array");
    const totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    const products = body.map((p) => this.mapProduct(p, currency)).filter((p): p is CommerceProduct => p !== null);
    return { products, locations: [], nextCursor: Number.isFinite(totalPages) && page < totalPages ? String(page + 1) : null };
  }

  mapProduct(raw: unknown, currency: string): CommerceProduct | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const title = str(raw.name);
    if (!id || !title) return null;
    const regular = toCents(raw.regular_price);
    const sale = toCents(raw.sale_price);
    const current = toCents(raw.price) ?? sale ?? regular;
    if (current === null || current <= 0) return null;
    const manage = raw.manage_stock === true;
    const quantity = manage ? parseQuantity(raw.stock_quantity) : null;
    const brand = str(get(raw, "brands.0.name"));
    return {
      externalId: id,
      sku: str(raw.sku),
      title,
      description: plainText(raw.short_description) ?? plainText(raw.description),
      brand,
      gtin: cleanGtin(raw.global_unique_id),
      mpn: null,
      priceCents: current,
      listPriceCents: regular !== null && regular > current ? regular : null,
      currency,
      url: str(raw.permalink),
      imageUrl: str(get(arr(raw.images)[0], "src")),
      condition: this.defaultCondition,
      inventory: [{ locationExternalId: null, quantity, stock: wooStock(str(raw.stock_status), quantity) }],
    };
  }
}
