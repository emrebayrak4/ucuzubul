/**
 * Generic product-feed adapter (CSV/TSV/XML, Google Merchant-style columns).
 *
 * Used for:
 *   1. Affiliate-network product feeds (CJ, Impact, Rakuten, Awin, Partnerize) — configure a feed
 *      URL via env (`<PREFIX>_FEED_URL`), optional auth header and affiliate link template.
 *   2. Merchant uploads — call `parseFeed(content)` directly; no env needed.
 *
 * Column aliases cover Google Merchant Center spec names (id, title, link, image_link, price,
 * sale_price, availability, condition, brand, gtin, mpn, shipping, product_type) plus common
 * network/merchant variants (sku, name, url, buy_url, upc, ean, manufacturer, model, stock...).
 */
import { BaseRetailerAdapter, type AdapterOptions } from "../base";
import { PendingConfigurationError } from "../errors";
import type {
  AffiliateLinkOptions,
  AvailabilityResult,
  DataAccess,
  FetchResult,
  NormalizedListing,
  OfferSource,
  ProductQuery,
  ValidationIssue,
} from "../types";
import { cleanGtin, currencyFromPriceString, mapAvailability, mapCondition, toCents } from "../util";
import { csvToRecords, detectFeedFormat, xmlToRecords, type FeedFormat } from "./parse";

export const FEED_COLUMN_ALIASES = {
  id: ["id", "sku", "item_id", "product_id", "merchant_sku", "offer_id", "item_group_id_sku", "catalog_item_id"],
  title: ["title", "name", "product_name", "item_name"],
  description: ["description", "short_description", "long_description"],
  productUrl: ["link", "url", "product_url", "producturl", "landing_page_url", "mobile_link"],
  affiliateUrl: ["affiliate_link", "tracking_link", "click_url", "buy_url", "buyurl", "deeplink", "deep_link", "tracking_url", "productlink"],
  imageUrl: ["image_link", "image_url", "imageurl", "image", "large_image", "main_image"],
  price: ["price", "regular_price", "retail_price", "list_price", "price_usd"],
  salePrice: ["sale_price", "saleprice", "current_price", "special_price", "price_sale"],
  salePriceEffectiveDate: ["sale_price_effective_date"],
  currency: ["currency", "price_currency", "currency_code"],
  availability: ["availability", "stock", "in_stock", "stock_status", "availability_status", "inventory_status"],
  condition: ["condition", "item_condition"],
  brand: ["brand", "manufacturer", "brand_name"],
  gtin: ["gtin", "upc", "ean", "isbn", "gtin13", "gtin12", "gtin14", "barcode"],
  mpn: ["mpn", "manufacturer_part_number", "part_number"],
  model: ["model", "model_number"],
  shipping: ["shipping.price", "shipping_price", "shipping_cost", "shipping", "shipping_rate"],
  category: ["product_type", "google_product_category", "category", "category_path", "merchant_category"],
  color: ["color", "colour"],
  size: ["size"],
} as const;

export type FeedField = keyof typeof FEED_COLUMN_ALIASES;

function pick(rec: Record<string, string>, field: FeedField): string | null {
  for (const alias of FEED_COLUMN_ALIASES[field]) {
    const v = rec[alias];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Google shipping attribute "US:CA:Ground:4.99 USD" or "US::Standard:0 USD" -> cents. */
export function parseShipping(value: string | null): number | null {
  if (value === null) return null;
  const parts = value.split(":");
  const last = parts.length >= 4 ? (parts[parts.length - 1] as string) : value;
  if (/^free$/i.test(last.trim())) return 0;
  return toCents(last);
}

/** True when `now` is within a Google "start/end" ISO-8601 interval (missing interval = active). */
export function saleActive(effective: string | null, now: number): boolean {
  if (!effective) return true;
  const [start, end] = effective.split("/");
  const s = start ? Date.parse(start) : NaN;
  const e = end ? Date.parse(end) : NaN;
  if (Number.isFinite(s) && now < s) return false;
  if (Number.isFinite(e) && now > e) return false;
  return true;
}

export interface FeedRowError {
  row: number;
  issues: ValidationIssue[];
}

export interface ParsedFeed {
  format: FeedFormat;
  listings: NormalizedListing[];
  errors: FeedRowError[];
  stats: { rows: number; valid: number; invalid: number; withoutPrice: number };
}

export interface FeedAdapterConfig {
  id: string;
  name: string;
  retailerId?: string;
  dataAccess?: DataAccess;
  affiliateNetwork?: string | null;
  /** Env var holding the feed URL. Omit for upload-only (merchant) usage. */
  feedUrlEnv?: string;
  /** Env var holding a full "Header-Name: value" auth header for the feed URL. */
  feedAuthHeaderEnv?: string;
  /** Env var holding an affiliate deep-link template containing {url} and optional {subId}. */
  affiliateLinkTemplateEnv?: string;
  source?: OfferSource;
  ttlSeconds?: number;
  defaultCurrency?: string;
}

export class AffiliateFeedAdapter extends BaseRetailerAdapter {
  readonly id: string;
  readonly name: string;
  readonly dataAccess: DataAccess;
  readonly requiredEnv: readonly string[];
  readonly affiliateNetwork: string | null;
  protected readonly source: OfferSource;
  protected override defaultRateLimit = { capacity: 2, refillPerSecond: 0.5 };
  private readonly config: FeedAdapterConfig;
  private cache: { at: number; feed: ParsedFeed } | null = null;

  constructor(config: FeedAdapterConfig, options: AdapterOptions = {}) {
    // Feeds are large single downloads: allow a generous timeout unless overridden.
    super({ ...options, http: { timeoutMs: 120_000, ...options.http } });
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.dataAccess = config.dataAccess ?? "affiliate_feed";
    this.affiliateNetwork = config.affiliateNetwork ?? null;
    this.requiredEnv = config.feedUrlEnv ? [config.feedUrlEnv] : [];
    this.source = config.source ?? "feed";
    this.ttlSeconds = config.ttlSeconds ?? 6 * 3600;
  }

  private get retailerId(): string {
    return this.config.retailerId ?? this.config.id;
  }

  /** Parse feed content (CSV/TSV/XML). Usable without any credentials (merchant uploads). */
  parseFeed(content: string, format?: FeedFormat): ParsedFeed {
    const fmt = format ?? detectFeedFormat(content);
    const records = fmt === "xml" ? xmlToRecords(content) : csvToRecords(content);
    const listings: NormalizedListing[] = [];
    const errors: FeedRowError[] = [];
    let withoutPrice = 0;
    records.forEach((rec, idx) => {
      const listing = this.normalizeProduct(rec);
      if (!listing) {
        errors.push({ row: idx + 1, issues: [{ field: "id/title", message: "row has no id or title", severity: "error" }] });
        return;
      }
      const v = this.validateData(listing);
      if (!v.valid) {
        errors.push({ row: idx + 1, issues: v.issues.filter((i) => i.severity === "error") });
        return;
      }
      if (!listing.offer) withoutPrice++;
      listings.push(listing);
    });
    return { format: fmt, listings, errors, stats: { rows: records.length, valid: listings.length, invalid: errors.length, withoutPrice } };
  }

  normalizeProduct(raw: unknown): NormalizedListing | null {
    if (typeof raw !== "object" || raw === null) return null;
    const rec = raw as Record<string, string>;
    const id = pick(rec, "id");
    const title = pick(rec, "title");
    if (!id || !title) return null;
    const now = this.clock.now();
    const priceRaw = pick(rec, "price");
    const saleRaw = pick(rec, "salePrice");
    const regular = toCents(priceRaw);
    const sale = toCents(saleRaw);
    const useSale = sale !== null && sale > 0 && saleActive(pick(rec, "salePriceEffectiveDate"), now) && (regular === null || sale <= regular);
    const priceCents = useSale ? sale : regular;
    const currency = (pick(rec, "currency") ?? currencyFromPriceString(saleRaw) ?? currencyFromPriceString(priceRaw) ?? this.config.defaultCurrency ?? "USD").toUpperCase();
    const productUrl = pick(rec, "productUrl");
    const feedAffiliate = pick(rec, "affiliateUrl");
    const category = pick(rec, "category");
    const gtinRaw = pick(rec, "gtin");
    const attributes: Record<string, string> = {};
    const color = pick(rec, "color");
    const size = pick(rec, "size");
    if (color) attributes.color = color;
    if (size) attributes.size = size;
    const product = {
      retailerId: this.retailerId,
      retailerSku: id,
      title,
      brand: pick(rec, "brand"),
      mpn: pick(rec, "mpn"),
      model: pick(rec, "model") ?? pick(rec, "mpn"),
      // keep an invalid raw GTIN so validateData() rejects the row with a clear message
      gtin: gtinRaw ? (cleanGtin(gtinRaw) ?? gtinRaw.replace(/[\s-]/g, "")) : null,
      imageUrl: pick(rec, "imageUrl"),
      productUrl: productUrl ?? feedAffiliate,
      categoryPath: category ? category.split(/\s*[>|]\s*/).filter(Boolean) : [],
      description: pick(rec, "description"),
      attributes,
    };
    const offer =
      priceCents !== null && priceCents > 0
        ? {
            retailerId: this.retailerId,
            retailerSku: id,
            priceCents,
            listPriceCents: useSale && regular !== null && regular > (sale as number) ? regular : null,
            currency,
            availability: mapAvailability(pick(rec, "availability")),
            condition: mapCondition(pick(rec, "condition")),
            productUrl: productUrl ?? feedAffiliate,
            affiliateUrl: feedAffiliate ?? (productUrl ? this.generateAffiliateLink(productUrl) : null),
            shippingCents: parseShipping(pick(rec, "shipping")),
            sellerName: null,
            source: this.source,
            observedAt: new Date(now).toISOString(),
          }
        : null;
    return { product, offer };
  }

  override generateAffiliateLink(productUrl: string, opts: AffiliateLinkOptions = {}): string | null {
    const envKey = this.config.affiliateLinkTemplateEnv;
    const tpl = envKey ? this.envValue(envKey) : undefined;
    if (!tpl || !tpl.includes("{url}")) return null;
    return tpl.replace("{url}", encodeURIComponent(productUrl)).replace("{subId}", encodeURIComponent(opts.subId ?? ""));
  }

  /** Download + parse the configured feed (cached for ttlSeconds). */
  async loadFeed(force = false): Promise<{ feed: ParsedFeed; cached: boolean }> {
    if (!this.config.feedUrlEnv) throw new PendingConfigurationError(this.id, ["(feed URL not configured; use parseFeed() for uploads)"]);
    const env = this.requireEnv();
    if (!force && this.cache && this.clock.now() - this.cache.at < this.ttlSeconds * 1000) return { feed: this.cache.feed, cached: true };
    const headers: Record<string, string> = {};
    const authEnv = this.config.feedAuthHeaderEnv;
    const auth = authEnv ? this.envValue(authEnv) : undefined;
    if (auth) {
      const idx = auth.indexOf(":");
      if (idx > 0) headers[auth.slice(0, idx).trim()] = auth.slice(idx + 1).trim();
    }
    const res = await this.guard(() => this.http.request({ url: env[this.config.feedUrlEnv as string] as string, headers }));
    const feed = this.parseFeed(res.text);
    this.cache = { at: this.clock.now(), feed };
    return { feed, cached: false };
  }

  async fetchProducts(q: ProductQuery): Promise<FetchResult<NormalizedListing[]>> {
    const { feed, cached } = await this.loadFeed();
    const words = (q.keywords ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const gtin = q.gtin ? cleanGtin(q.gtin) : null;
    const skus = q.retailerSkus ? new Set(q.retailerSkus) : null;
    const matches = feed.listings.filter((l) => {
      if (skus && !skus.has(l.product.retailerSku)) return false;
      if (gtin && (!l.product.gtin || l.product.gtin.padStart(14, "0") !== gtin.padStart(14, "0"))) return false;
      if (q.brand && l.product.brand?.toLowerCase() !== q.brand.toLowerCase()) return false;
      if (words.length) {
        const hay = `${l.product.title} ${l.product.brand ?? ""} ${l.product.mpn ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      const p = l.offer?.priceCents;
      if (q.minPriceCents !== undefined && (p === undefined || p < q.minPriceCents)) return false;
      if (q.maxPriceCents !== undefined && (p === undefined || p > q.maxPriceCents)) return false;
      return true;
    });
    const pageSize = Math.max(1, q.pageSize ?? 50);
    const page = Math.max(1, q.page ?? 1);
    const warnings = feed.errors.length ? [`${feed.errors.length} feed rows were rejected by validation`] : [];
    return this.result(matches.slice((page - 1) * pageSize, page * pageSize), this.source, warnings, cached);
  }

  async fetchProductDetails(sku: string): Promise<FetchResult<NormalizedListing | null>> {
    const r = await this.fetchProducts({ retailerSkus: [sku], pageSize: 1 });
    return { ...r, data: r.data[0] ?? null };
  }

  override async fetchAvailability(skus: readonly string[]): Promise<FetchResult<AvailabilityResult[]>> {
    const { feed, cached } = await this.loadFeed();
    const bySku = new Map(feed.listings.map((l) => [l.product.retailerSku, l]));
    const observedAt = new Date(this.cache?.at ?? this.clock.now()).toISOString();
    const data = skus.map((sku) => {
      const l = bySku.get(sku);
      return { retailerSku: sku, availability: l?.offer?.availability ?? "unknown", priceCents: l?.offer?.priceCents ?? null, observedAt } satisfies AvailabilityResult;
    });
    return this.result(data, this.source, [], cached);
  }

  protected async ping(): Promise<void> {
    await this.loadFeed(true);
  }
}
