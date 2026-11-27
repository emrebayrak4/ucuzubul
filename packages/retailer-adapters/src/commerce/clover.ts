/**
 * Clover — REST API v3.
 * Docs: https://docs.clover.com/dev/reference/inventorygetitems
 *       https://docs.clover.com/dev/reference/merchantgetmerchant
 *   GET /v3/merchants/{mId}/items?expand=itemStock&limit=&offset=   (price in cents; offset pagination)
 *   GET /v3/merchants/{mId}?expand=address,properties               (single location + default currency)
 * Bearer token. Items with VARIABLE / PER_UNIT pricing or no price are skipped (no invented prices).
 *
 * Config: merchantId, accessToken; optional region ("us" default → api.clover.com, "sandbox" →
 * apisandbox.dev.clover.com), defaultCondition.
 */
import { ResponseShapeError } from "../errors";
import { arr, cleanGtin, get, isObject, str } from "../util";
import { BaseCommerceConnector, clampLimit, integerCents, parseQuantity, stockFromQuantity } from "./base";
import type { CommerceInventory, CommerceLocation, CommerceProduct, CommerceSyncOptions, CommerceSyncResult } from "./types";

export class CloverConnector extends BaseCommerceConnector {
  readonly provider = "clover" as const;
  readonly requiredConfig = ["merchantId", "accessToken"];
  private currency: string | null = null;

  private get apiBase(): string {
    const region = this.cfg("region") ?? "us";
    if (region === "sandbox") return "https://apisandbox.dev.clover.com";
    if (region === "us") return "https://api.clover.com";
    throw new RangeError(`unsupported Clover region: ${region}`);
  }

  protected async fetchPage(opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">> {
    const mId = this.required("merchantId");
    if (!/^[A-Za-z0-9]+$/.test(mId)) throw new RangeError("invalid merchantId");
    const base = `${this.apiBase}/v3/merchants/${mId}`;
    const headers = { Authorization: `Bearer ${this.required("accessToken")}` };
    const offset = opts.cursor ? Number(opts.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError("invalid cursor");
    const limit = clampLimit(opts.limit, 100, 1000);

    let locations: CommerceLocation[] = [];
    if (offset === 0 || !this.currency) {
      const m = await this.http.json<unknown>({ url: `${base}?expand=address,properties`, headers });
      this.currency = str(get(m, "properties.defaultCurrency")) ?? str(get(m, "currency"));
      if (offset === 0) {
        locations = [
          {
            externalId: mId,
            name: str(get(m, "name")) ?? mId,
            address1: str(get(m, "address.address1")),
            city: str(get(m, "address.city")),
            state: str(get(m, "address.state")),
            zip: str(get(m, "address.zip")),
            lat: null,
            lng: null,
            phone: str(get(m, "phoneNumber")),
          },
        ];
      }
    }
    // api.clover.com serves North American merchants; fall back to USD only for the US/sandbox hosts.
    const currency = this.currency ?? "USD";

    const params = new URLSearchParams({ expand: "itemStock", limit: String(limit), offset: String(offset) });
    const res = await this.http.json<unknown>({ url: `${base}/items?${params.toString()}`, headers });
    if (!isObject(res)) throw new ResponseShapeError("commerce:clover", "items response is not an object");
    const elements = arr(res.elements);
    const products = elements.map((e) => this.mapItem(e, mId, currency)).filter((p): p is CommerceProduct => p !== null);
    return { products, locations, nextCursor: elements.length === limit ? String(offset + limit) : null };
  }

  mapItem(raw: unknown, merchantId: string, currency: string): CommerceProduct | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const title = str(raw.name);
    if (!id || !title) return null;
    const priceType = str(raw.priceType) ?? "FIXED";
    if (priceType !== "FIXED") return null;
    const priceCents = integerCents(raw.price);
    if (priceCents === null || priceCents <= 0) return null;
    const quantity = parseQuantity(get(raw, "itemStock.quantity")) ?? parseQuantity(get(raw, "itemStock.stockCount"));
    const inventory: CommerceInventory[] = [
      {
        locationExternalId: merchantId,
        quantity,
        stock: quantity !== null ? stockFromQuantity(quantity) : raw.available === false ? "out_of_stock" : "unknown",
      },
    ];
    return {
      externalId: id,
      sku: str(raw.sku),
      title,
      description: str(raw.alternateName),
      brand: null,
      gtin: cleanGtin(raw.code),
      mpn: null,
      priceCents,
      listPriceCents: null,
      currency,
      url: null,
      imageUrl: null,
      condition: this.defaultCondition,
      inventory,
    };
  }
}
