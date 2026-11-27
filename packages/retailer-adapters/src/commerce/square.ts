/**
 * Square — Catalog, Inventory and Locations APIs.
 * Docs: https://developer.squareup.com/reference/square/catalog-api/list-catalog
 *       https://developer.squareup.com/reference/square/inventory-api/batch-retrieve-inventory-counts
 *       https://developer.squareup.com/reference/square/locations-api/list-locations
 *
 * Catalog: `GET /v2/catalog/list?types=ITEM,IMAGE&cursor=` (chosen over search-catalog-items because
 * it returns ITEM objects with nested variations plus IMAGE objects in one paged stream; the page size
 * is fixed by Square, so `limit` is ignored). One CommerceProduct per ITEM_VARIATION with FIXED_PRICING.
 * Inventory: `POST /v2/inventory/counts/batch-retrieve` (IN_STOCK state, per location, cursor-paged).
 * Locations: `GET /v2/locations` (ACTIVE only). Money `price_money.amount` is already in cents.
 *
 * Config: accessToken; optional environment ("sandbox" → connect.squareupsandbox.com), squareVersion, defaultCondition.
 * Variations without any IN_STOCK count record report quantity null / "unknown" (no record ≠ proven zero).
 */
import { ResponseShapeError } from "../errors";
import { arr, cleanGtin, get, isObject, str } from "../util";
import { BaseCommerceConnector, integerCents, parseQuantity, plainText, stockFromQuantity } from "./base";
import type { CommerceInventory, CommerceLocation, CommerceProduct, CommerceSyncOptions, CommerceSyncResult } from "./types";

/** Default Square-Version header (override with config `squareVersion`). */
export const SQUARE_VERSION = "2025-01-23";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export class SquareConnector extends BaseCommerceConnector {
  readonly provider = "square" as const;
  readonly requiredConfig = ["accessToken"];

  private get apiBase(): string {
    return this.cfg("environment") === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.required("accessToken")}`, "Square-Version": this.cfg("squareVersion") ?? SQUARE_VERSION, "Content-Type": "application/json" };
  }

  protected async fetchPage(opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">> {
    const headers = this.headers();
    const locRes = await this.http.json<unknown>({ url: `${this.apiBase}/v2/locations`, headers });
    const locations = arr(get(locRes, "locations"))
      .filter((l) => str(get(l, "status")) !== "INACTIVE")
      .map(mapSquareLocation)
      .filter((l): l is CommerceLocation => l !== null);

    const params = new URLSearchParams({ types: "ITEM,IMAGE" });
    if (opts.cursor) params.set("cursor", opts.cursor);
    const cat = await this.http.json<unknown>({ url: `${this.apiBase}/v2/catalog/list?${params.toString()}`, headers });
    if (!isObject(cat)) throw new ResponseShapeError("commerce:square", "catalog response is not an object");
    const objects = arr(cat.objects);
    const images = new Map<string, string>();
    for (const o of objects) {
      if (get(o, "type") === "IMAGE") {
        const id = str(get(o, "id"));
        const url = str(get(o, "image_data.url"));
        if (id && url) images.set(id, url);
      }
    }
    const items = objects.filter((o) => get(o, "type") === "ITEM" && get(o, "is_deleted") !== true);
    const variationIds = items.flatMap((it) => arr(get(it, "item_data.variations")).map((v) => str(get(v, "id"))).filter((x): x is string => !!x));
    const counts = await this.inventory(variationIds, locations.map((l) => l.externalId), headers);

    const products = items.flatMap((it) => this.mapItem(it, images, counts));
    return { products, locations: opts.cursor ? [] : locations, nextCursor: str(cat.cursor) };
  }

  /** variationId -> locationId -> quantity (IN_STOCK). */
  private async inventory(ids: string[], locationIds: string[], headers: Record<string, string>): Promise<Map<string, Map<string, number>>> {
    const out = new Map<string, Map<string, number>>();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      let cursor: string | null = null;
      for (let guard = 0; guard < 50; guard++) {
        const body: Record<string, unknown> = { catalog_object_ids: chunk, states: ["IN_STOCK"] };
        if (locationIds.length) body.location_ids = locationIds;
        if (cursor) body.cursor = cursor;
        const res = await this.http.json<unknown>({ url: `${this.apiBase}/v2/inventory/counts/batch-retrieve`, method: "POST", headers, body: JSON.stringify(body) });
        for (const c of arr(get(res, "counts"))) {
          const obj = str(get(c, "catalog_object_id"));
          const loc = str(get(c, "location_id"));
          const qty = parseQuantity(get(c, "quantity"));
          if (!obj || !loc || qty === null || get(c, "state") !== "IN_STOCK") continue;
          const m = out.get(obj) ?? new Map<string, number>();
          m.set(loc, (m.get(loc) ?? 0) + qty);
          out.set(obj, m);
        }
        cursor = str(get(res, "cursor"));
        if (!cursor) break;
      }
    }
    return out;
  }

  mapItem(item: unknown, images: Map<string, string>, counts: Map<string, Map<string, number>>): CommerceProduct[] {
    const itemId = str(get(item, "id"));
    const name = str(get(item, "item_data.name"));
    if (!itemId || !name) return [];
    const imageId = str(get(item, "item_data.image_ids.0"));
    const description = str(get(item, "item_data.description_plain")) ?? plainText(get(item, "item_data.description"));
    const variations = arr(get(item, "item_data.variations"));
    return variations.flatMap((v): CommerceProduct[] => {
      const id = str(get(v, "id"));
      if (!id || get(v, "is_deleted") === true) return [];
      if (str(get(v, "item_variation_data.pricing_type")) !== "FIXED_PRICING") return [];
      const priceCents = integerCents(get(v, "item_variation_data.price_money.amount"));
      const currency = str(get(v, "item_variation_data.price_money.currency"));
      if (priceCents === null || priceCents <= 0 || !currency) return [];
      const vName = str(get(v, "item_variation_data.name"));
      const perLoc = counts.get(id);
      const inventory: CommerceInventory[] = perLoc
        ? [...perLoc.entries()].map(([loc, q]) => ({ locationExternalId: loc, quantity: q, stock: stockFromQuantity(q) }))
        : [{ locationExternalId: null, quantity: null, stock: "unknown" }];
      const vImage = str(get(v, "item_variation_data.image_ids.0"));
      return [
        {
          externalId: id,
          sku: str(get(v, "item_variation_data.sku")),
          title: vName && variations.length > 1 && vName !== "Regular" ? `${name} - ${vName}` : name,
          description,
          brand: null,
          gtin: cleanGtin(get(v, "item_variation_data.upc")),
          mpn: null,
          priceCents,
          listPriceCents: null,
          currency,
          url: str(get(item, "item_data.ecom_uri")),
          imageUrl: (vImage ? images.get(vImage) : undefined) ?? (imageId ? images.get(imageId) : undefined) ?? null,
          condition: this.defaultCondition,
          inventory,
        },
      ];
    });
  }
}

function mapSquareLocation(raw: unknown): CommerceLocation | null {
  const id = str(get(raw, "id"));
  if (!id) return null;
  return {
    externalId: id,
    name: str(get(raw, "name")) ?? str(get(raw, "business_name")) ?? id,
    address1: str(get(raw, "address.address_line_1")),
    city: str(get(raw, "address.locality")),
    state: str(get(raw, "address.administrative_district_level_1")),
    zip: str(get(raw, "address.postal_code")),
    lat: num(get(raw, "coordinates.latitude")),
    lng: num(get(raw, "coordinates.longitude")),
    phone: str(get(raw, "phone_number")),
  };
}
