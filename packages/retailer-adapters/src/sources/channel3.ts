/**
 * Channel3 — multi-retailer product search API (channel3.ai, docs: docs.trychannel3.com).
 * One canonical product carries offers from many stores (macys.com, bestbuy.com, …); price and the
 * attributed buy link live on each offer. Buy links are Channel3-attributed (commission is paid through
 * Channel3), so they are stored as `affiliateUrl`; the retailer landing URL is not exposed.
 *
 * Search:  POST https://api.trychannel3.com/v1/search  {query, limit?, page_token?, filters?}  (1 credit/request;
 *          1,000 free per month, then $0.007 per search — docs.trychannel3.com/pricing)
 * Detail:  GET  /v1/products/{id}   (free; refresh price/offers before display)
 * Health:  GET  /v1/websites/search?query=  (free)
 * Auth:    header `x-api-key`.
 * Offer price shape observed 2026-11-27: {price, compare_at_price, currency}; docs examples also show {amount, currency}.
 * Products carry no GTIN, so matching relies on brand/title.
 */
import { AdapterCore } from "../base";
import { AdapterHttpError } from "../errors";
import type { Page } from "../networks/types";
import type { Availability, Condition, NormalizedListing } from "../types";
import { arr, get, isObject, mapCondition, str, toCents } from "../util";

const BASE = "https://api.trychannel3.com/v1";

/** Store domain → our adapter/retailer id (ADAPTER_REGISTRY ids). Unknown domains map to null. */
const DOMAIN_RETAILER: Readonly<Record<string, string>> = {
  "amazon.com": "amazon",
  "walmart.com": "walmart",
  "bestbuy.com": "bestbuy",
  "ebay.com": "ebay",
  "kroger.com": "kroger",
  "target.com": "target",
  "costco.com": "costco",
  "homedepot.com": "homedepot",
  "lowes.com": "lowes",
  "newegg.com": "newegg",
  "bhphotovideo.com": "bhphoto",
  "adorama.com": "adorama",
  "macys.com": "macys",
  "kohls.com": "kohls",
  "wayfair.com": "wayfair",
  "staples.com": "staples",
  "officedepot.com": "officedepot",
  "walgreens.com": "walgreens",
  "cvs.com": "cvs",
  "gamestop.com": "gamestop",
  "samsclub.com": "samsclub",
  "chewy.com": "chewy",
};

function cleanDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** Our retailer id for a Channel3 offer domain, or null when we don't track that store. */
export function channel3RetailerId(domain: string): string | null {
  return DOMAIN_RETAILER[cleanDomain(domain)] ?? null;
}

const AVAILABILITY: Readonly<Record<string, Availability>> = {
  InStock: "in_stock",
  LimitedAvailability: "limited",
  OutOfStock: "out_of_stock",
  SoldOut: "out_of_stock",
  PreOrder: "preorder",
  BackOrder: "backorder",
};

/** Conditions that get their own SKU (a different item from the new one). */
const SECOND_HAND: ReadonlySet<Condition> = new Set<Condition>(["used", "refurbished", "open_box", "for_parts"]);

export interface Channel3SearchQuery {
  query: string;
  limit?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  /** Store domains (e.g. "macys.com") or Channel3 website ids. */
  websites?: string[];
  /** Only products with at least one in-stock or limited offer. */
  inStockOnly?: boolean;
}

export interface Channel3Offer {
  /** Normalized store domain (no "www."). */
  domain: string;
  /** Our retailer id when we track the store, else null. */
  retailerId: string | null;
  priceCents: number;
  /** compare_at price, only when above the current price. */
  listPriceCents: number | null;
  currency: string;
  availability: Availability;
  condition: Condition;
  /** Channel3-attributed buy link. */
  affiliateUrl: string;
  /** Max commission rate (0.08 = 8%). */
  maxCommissionRate: number;
}

export interface Channel3Product {
  id: string;
  title: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  categoryPath: string[];
  attributes: Record<string, string>;
  offers: Channel3Offer[];
}

export class Channel3Client extends AdapterCore {
  readonly id = "channel3";
  readonly name = "Channel3";
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["CHANNEL3_API_KEY"] as const;
  protected override ttlSeconds = 3600;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 2 };

  private headers(): Record<string, string> {
    const env = this.requireEnv();
    return { "x-api-key": env.CHANNEL3_API_KEY as string, "Content-Type": "application/json" };
  }

  async search(q: Channel3SearchQuery, pageToken?: string | null): Promise<Page<Channel3Product>> {
    const headers = this.headers();
    const filters: Record<string, unknown> = {};
    if (q.minPriceCents !== undefined || q.maxPriceCents !== undefined) {
      filters.price = {
        ...(q.minPriceCents !== undefined ? { min_price: q.minPriceCents / 100 } : {}),
        ...(q.maxPriceCents !== undefined ? { max_price: q.maxPriceCents / 100 } : {}),
      };
    }
    if (q.websites?.length) filters.website_ids = q.websites;
    if (q.inStockOnly) filters.availability = ["InStock", "LimitedAvailability"];
    const body = {
      query: q.query,
      ...(q.limit !== undefined ? { limit: q.limit } : {}),
      ...(pageToken ? { page_token: pageToken } : {}),
      ...(Object.keys(filters).length ? { filters } : {}),
    };
    // No retry: every search request costs a credit, and a timed-out POST may already have been billed.
    const res = await this.guard(() => this.http.json({ url: `${BASE}/search`, method: "POST", headers, body: JSON.stringify(body), retries: 0 }));
    const warnings: string[] = [];
    const items: Channel3Product[] = [];
    for (const raw of arr(get(res, "products"))) {
      const p = this.normalize(raw, warnings);
      const label = str(get(raw, "id")) ?? "without id";
      if (!p) warnings.push(`Channel3 product ${label}: dropped (missing id or title)`);
      else if (!p.offers.length) warnings.push(`Channel3 product ${label}: dropped (no priced offer)`);
      else items.push(p);
    }
    return { items, next: str(get(res, "next_page_token")), warnings };
  }

  /** Free detail call: current offers for one product; null when Channel3 no longer has it. */
  async getProduct(id: string): Promise<Channel3Product | null> {
    const headers = this.headers();
    try {
      const res = await this.guard(() => this.http.json({ url: `${BASE}/products/${encodeURIComponent(id)}`, headers }));
      return this.normalize(res, []);
    } catch (err) {
      if (err instanceof AdapterHttpError && err.status === 404) return null;
      throw err;
    }
  }

  /**
   * One normalized listing per (retailer, SKU), keyed by our retailer id (or the store domain when untracked).
   * The SKU only carries the condition for second-hand offers, so a missing/added `condition` field never
   * changes the key of a new item. Several offers from one store under one key keep the cheapest
   * (the offer keeps its own condition, so "unknown" never counts as new).
   */
  toListings(p: Channel3Product): NormalizedListing[] {
    const observedAt = new Date(this.clock.now()).toISOString();
    const best = new Map<string, { retailerId: string; retailerSku: string; offer: Channel3Offer }>();
    for (const o of p.offers) {
      const retailerId = o.retailerId ?? o.domain;
      const retailerSku = SECOND_HAND.has(o.condition) ? `c3:${p.id}:${o.condition}` : `c3:${p.id}`;
      const key = `${retailerId}\u0000${retailerSku}`;
      const prev = best.get(key);
      if (!prev || o.priceCents < prev.offer.priceCents) best.set(key, { retailerId, retailerSku, offer: o });
    }
    return [...best.values()].map(({ retailerId, retailerSku, offer: o }) => {
      return {
        product: {
          retailerId,
          retailerSku,
          title: p.title,
          brand: p.brand,
          mpn: null,
          model: null,
          gtin: null,
          imageUrl: p.imageUrl,
          productUrl: null,
          categoryPath: p.categoryPath,
          description: p.description,
          attributes: p.attributes,
        },
        offer: {
          retailerId,
          retailerSku,
          priceCents: o.priceCents,
          listPriceCents: o.listPriceCents,
          currency: o.currency,
          availability: o.availability,
          condition: o.condition,
          productUrl: null,
          affiliateUrl: o.affiliateUrl,
          shippingCents: null,
          sellerName: o.domain,
          source: "affiliate",
          observedAt,
        },
      };
    });
  }

  private normalize(raw: unknown, warnings: string[]): Channel3Product | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const title = str(raw.title);
    if (!id || !title || title.length < 3) return null;
    const images = arr(raw.images);
    const main = images.find((i) => get(i, "is_main_image") === true) ?? images[0];
    const path = arr(get(raw, "category.path")).map((x) => str(x)).filter((x): x is string => !!x);
    const categoryTitle = str(get(raw, "category.title"));
    const attributes: Record<string, string> = {};
    const sa = raw.structured_attributes;
    if (isObject(sa)) for (const [k, v] of Object.entries(sa)) if (typeof v === "string" && v.trim()) attributes[k] = v.trim();
    const offers: Channel3Offer[] = [];
    for (const o of arr(raw.offers)) {
      const offer = this.normalizeOffer(o);
      if (offer) offers.push(offer);
      else warnings.push(`Channel3 ${id}: dropped offer without a valid price (${str(get(o, "domain")) ?? "unknown domain"})`);
    }
    return {
      id,
      title,
      brand: str(get(raw, "brands.0.name")),
      description: str(raw.description),
      imageUrl: str(get(main, "url")),
      categoryPath: path.length ? path : categoryTitle ? [categoryTitle] : [],
      attributes,
      offers,
    };
  }

  private normalizeOffer(raw: unknown): Channel3Offer | null {
    if (!isObject(raw)) return null;
    const domainRaw = str(raw.domain);
    const url = str(raw.url);
    const priceCents = toCents(get(raw, "price.price") ?? get(raw, "price.amount"));
    const currency = (str(get(raw, "price.currency")) ?? "USD").toUpperCase();
    if (!domainRaw || !url || priceCents === null || priceCents <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
    const compareAt = toCents(get(raw, "price.compare_at_price"));
    const domain = cleanDomain(domainRaw);
    const rate = raw.max_commission_rate;
    return {
      domain,
      retailerId: channel3RetailerId(domain),
      priceCents,
      listPriceCents: compareAt !== null && compareAt > priceCents ? compareAt : null,
      currency,
      availability: AVAILABILITY[str(raw.availability) ?? ""] ?? "unknown",
      condition: mapCondition(raw.condition),
      affiliateUrl: url,
      maxCommissionRate: typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 0,
    };
  }

  protected async ping(): Promise<void> {
    const headers = this.headers();
    await this.http.json({ url: `${BASE}/websites/search?query=${encodeURIComponent("best buy")}`, headers });
  }
}
