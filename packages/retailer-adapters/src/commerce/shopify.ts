/**
 * Shopify — OAuth (authorization code grant) helpers + Admin GraphQL API 2025-10.
 * Docs: https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 *       https://shopify.dev/docs/api/admin-graphql/2025-10
 *
 * Sync queries the `productVariants` connection (one CommerceProduct per variant) with the parent
 * product, barcode (GTIN), price / compareAtPrice and inventoryItem.inventoryLevels → quantities
 * named "available" per location. A flat variant connection keeps the calculated query cost low
 * (first ≤ 100 variants × 10 inventory levels) versus products → variants → levels nesting.
 * Locations + shop currency are fetched on the first page only.
 *
 * Config: shopDomain, accessToken (sync); apiKey, apiSecret (OAuth helpers); optional defaultCondition.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ResponseShapeError } from "../errors";
import { HttpClient, type FetchLike } from "../http";
import { arr, cleanGtin, get, isObject, str, toCents } from "../util";
import { BaseCommerceConnector, clampLimit, parseQuantity, plainText, stockFromQuantity } from "./base";
import type { CommerceInventory, CommerceLocation, CommerceProduct, CommerceSyncOptions, CommerceSyncResult } from "./types";

export const SHOPIFY_API_VERSION = "2025-10";
export const SHOPIFY_SCOPES = ["read_products", "read_inventory", "read_locations"] as const;

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Validate and normalize a shop domain; only `*.myshopify.com` is accepted. Throws RangeError otherwise. */
export function validateShopDomain(shop: string): string {
  const s = shop.trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/+$/, "");
  if (!SHOP_RE.test(s)) throw new RangeError("shop domain must be <name>.myshopify.com");
  return s;
}

export function isValidShopDomain(shop: string): boolean {
  try {
    validateShopDomain(shop);
    return true;
  } catch {
    return false;
  }
}

export interface ShopifyAuthorizeUrlParams {
  shop: string;
  apiKey: string;
  redirectUri: string;
  /** Unguessable nonce stored server-side and checked on the callback. */
  state: string;
  scopes?: readonly string[];
}

/** Build the merchant-facing install/authorize URL. */
export function buildShopifyAuthorizeUrl(p: ShopifyAuthorizeUrlParams): string {
  const shop = validateShopDomain(p.shop);
  if (!p.state.trim()) throw new RangeError("state is required");
  if (!/^https:\/\//.test(p.redirectUri)) throw new RangeError("redirectUri must be https");
  const q = new URLSearchParams({
    client_id: p.apiKey,
    scope: (p.scopes ?? SHOPIFY_SCOPES).join(","),
    redirect_uri: p.redirectUri,
    state: p.state,
  });
  return `https://${shop}/admin/oauth/authorize?${q.toString()}`;
}

export type ShopifyCallbackQuery = URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>;

function queryEntries(query: ShopifyCallbackQuery): [string, string][] {
  const out: [string, string][] = [];
  if (query instanceof URLSearchParams) {
    query.forEach((v, k) => out.push([k, v]));
    return out;
  }
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (typeof v === "string") out.push([k, v]);
    else for (const item of v) out.push([k, item]);
  }
  return out;
}

/** The message Shopify signs: all params except hmac/signature, sorted by key, URL-encoded. */
export function shopifyHmacMessage(query: ShopifyCallbackQuery): string {
  const entries = queryEntries(query)
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return new URLSearchParams(entries).toString();
}

/** Verify the `hmac` of an OAuth callback / app-launch query with the app secret (timing-safe). */
export function verifyShopifyHmac(query: ShopifyCallbackQuery, apiSecret: string): boolean {
  if (!apiSecret) return false;
  const provided = queryEntries(query).find(([k]) => k === "hmac")?.[1];
  if (!provided || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", apiSecret).update(shopifyHmacMessage(query)).digest();
  const given = Buffer.from(provided.toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface ShopifyTokenExchangeParams {
  shop: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}

export interface ShopifyAccessToken {
  accessToken: string;
  scope: string[];
}

/** Exchange the callback `code` for an offline access token (POST https://{shop}/admin/oauth/access_token). */
export async function exchangeShopifyCode(p: ShopifyTokenExchangeParams, opts: { fetch?: FetchLike } = {}): Promise<ShopifyAccessToken> {
  const shop = validateShopDomain(p.shop);
  const http = new HttpClient({ adapterId: "commerce:shopify", ...(opts.fetch ? { fetch: opts.fetch } : {}), retry: { retries: 0 } });
  const res = await http.json<unknown>({
    url: `https://${shop}/admin/oauth/access_token`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: p.apiKey, client_secret: p.apiSecret, code: p.code }),
    retries: 0,
  });
  const accessToken = str(get(res, "access_token"));
  if (!accessToken) throw new ResponseShapeError("commerce:shopify", "token response without access_token");
  const scope = (str(get(res, "scope")) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { accessToken, scope };
}

const LOCATIONS_FRAGMENT = `
  shop { currencyCode }
  locations(first: 100) {
    nodes { id name isActive address { address1 city provinceCode zip latitude longitude phone } }
  }`;

export function shopifySyncQuery(includeLocations: boolean): string {
  return `query WhichLessSync($first: Int!, $after: String) {
  productVariants(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id sku barcode price compareAtPrice title
      image { url }
      product {
        id title description vendor status onlineStoreUrl
        featuredMedia { preview { image { url } } }
      }
      inventoryItem {
        tracked
        inventoryLevels(first: 10) {
          nodes { location { id } quantities(names: ["available"]) { name quantity } }
        }
      }
    }
  }${includeLocations ? LOCATIONS_FRAGMENT : ""}
}`;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export class ShopifyConnector extends BaseCommerceConnector {
  readonly provider = "shopify" as const;
  readonly requiredConfig = ["shopDomain", "accessToken"];
  /** Remembered from the first page; later pages fall back to config `currency` or USD. */
  private currency: string | null = null;

  protected async fetchPage(opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">> {
    const shop = validateShopDomain(this.required("shopDomain"));
    const first = clampLimit(opts.limit, 50, 100);
    const includeLocations = !opts.cursor;
    const res = await this.http.json<unknown>({
      url: `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": this.required("accessToken") },
      body: JSON.stringify({ query: shopifySyncQuery(includeLocations), variables: { first, after: opts.cursor ?? null } }),
    });
    const errors = arr(get(res, "errors"));
    if (errors.length > 0) {
      const msg = errors.map((e) => str(get(e, "message")) ?? "unknown error").join("; ");
      throw new ResponseShapeError("commerce:shopify", `GraphQL errors: ${msg}`);
    }
    const data = get(res, "data");
    const conn = get(data, "productVariants");
    if (!isObject(conn)) throw new ResponseShapeError("commerce:shopify", "missing data.productVariants");

    if (includeLocations) this.currency = str(get(data, "shop.currencyCode"));
    const currency = this.currency ?? this.cfg("currency") ?? "USD";
    const locations = includeLocations
      ? arr(get(data, "locations.nodes"))
          .filter((l) => get(l, "isActive") !== false)
          .map((l) => this.mapLocation(l))
          .filter((l): l is CommerceLocation => l !== null)
      : [];
    const products = arr(get(conn, "nodes"))
      .map((v) => this.mapVariant(v, currency))
      .filter((p): p is CommerceProduct => p !== null);
    const hasNext = get(conn, "pageInfo.hasNextPage") === true;
    return { products, locations, nextCursor: hasNext ? str(get(conn, "pageInfo.endCursor")) : null };
  }

  private mapLocation(raw: unknown): CommerceLocation | null {
    const id = str(get(raw, "id"));
    if (!id) return null;
    return {
      externalId: id,
      name: str(get(raw, "name")) ?? id,
      address1: str(get(raw, "address.address1")),
      city: str(get(raw, "address.city")),
      state: str(get(raw, "address.provinceCode")),
      zip: str(get(raw, "address.zip")),
      lat: num(get(raw, "address.latitude")),
      lng: num(get(raw, "address.longitude")),
      phone: str(get(raw, "address.phone")),
    };
  }

  mapVariant(raw: unknown, currency: string): CommerceProduct | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const productTitle = str(get(raw, "product.title"));
    if (!id || !productTitle) return null;
    const status = str(get(raw, "product.status"));
    if (status && status !== "ACTIVE") return null;
    const priceCents = toCents(raw.price);
    if (priceCents === null || priceCents <= 0) return null;
    const compareAt = toCents(raw.compareAtPrice);
    const variantTitle = str(raw.title);
    const title = variantTitle && variantTitle !== "Default Title" ? `${productTitle} - ${variantTitle}` : productTitle;
    const storeUrl = str(get(raw, "product.onlineStoreUrl"));
    const numericVariantId = /(\d+)$/.exec(id)?.[1];
    const url = storeUrl && numericVariantId ? `${storeUrl}${storeUrl.includes("?") ? "&" : "?"}variant=${numericVariantId}` : storeUrl;
    const tracked = get(raw, "inventoryItem.tracked") !== false;
    const inventory: CommerceInventory[] = tracked
      ? arr(get(raw, "inventoryItem.inventoryLevels.nodes")).flatMap((lvl): CommerceInventory[] => {
          const loc = str(get(lvl, "location.id"));
          if (!loc) return [];
          const avail = arr(get(lvl, "quantities")).find((q) => get(q, "name") === "available");
          const quantity = parseQuantity(get(avail, "quantity"));
          return [{ locationExternalId: loc, quantity, stock: stockFromQuantity(quantity) }];
        })
      : [{ locationExternalId: null, quantity: null, stock: "unknown" }];
    return {
      externalId: id,
      sku: str(raw.sku),
      title,
      description: plainText(get(raw, "product.description")),
      brand: str(get(raw, "product.vendor")),
      gtin: cleanGtin(raw.barcode),
      mpn: null,
      priceCents,
      listPriceCents: compareAt !== null && compareAt > priceCents ? compareAt : null,
      currency,
      url,
      imageUrl: str(get(raw, "image.url")) ?? str(get(raw, "product.featuredMedia.preview.image.url")),
      condition: this.defaultCondition,
      inventory,
    };
  }
}
