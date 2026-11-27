/** Shared base + helpers for affiliate-network clients. */
import { AdapterCore } from "../base";
import { NotSupportedError } from "../errors";
import type { AdapterOptions } from "../base";
import type { NormalizedListing } from "../types";
import { cleanGtin, mapAvailability, mapCondition, str, toCents } from "../util";
import type {
  AffiliateNetworkClient,
  DateRange,
  DiscountType,
  LinkRequest,
  NetworkCapabilities,
  NetworkConversion,
  NetworkCoupon,
  NetworkId,
  NetworkProduct,
  NetworkProductQuery,
  Page,
} from "./types";

export abstract class BaseNetworkClient extends AdapterCore implements AffiliateNetworkClient {
  abstract override readonly id: NetworkId;
  readonly kind = "network" as const;
  readonly dataAccess = "affiliate_feed" as const;
  abstract readonly capabilities: NetworkCapabilities;
  readonly maxReportDays: number = 30;
  readonly maxLookbackDays: number = 90;

  constructor(options: AdapterOptions = {}) {
    super(options);
  }

  fetchProducts(_q: NetworkProductQuery, _cursor?: string | null): Promise<Page<NetworkProduct>> {
    return Promise.reject(new NotSupportedError(this.id, "product catalog"));
  }
  fetchCoupons(_cursor?: string | null): Promise<Page<NetworkCoupon>> {
    return Promise.reject(new NotSupportedError(this.id, "promotions/coupons"));
  }
  fetchConversions(_range: DateRange, _cursor?: string | null): Promise<Page<NetworkConversion>> {
    return Promise.reject(new NotSupportedError(this.id, "conversion reports"));
  }
  buildLink(_req: LinkRequest): string | null {
    return null;
  }

  protected page<T>(items: T[], next: string | null, warnings: string[] = []): Page<T> {
    return { items, next, warnings };
  }
}

/** Pull every page (bounded) from a cursor-paged fetcher. */
export async function collectPages<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, maxPages = 50): Promise<{ items: T[]; warnings: string[]; truncated: boolean }> {
  const items: T[] = [];
  const warnings: string[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const p = await fetchPage(cursor);
    items.push(...p.items);
    warnings.push(...p.warnings);
    if (!p.next) return { items, warnings, truncated: false };
    cursor = p.next;
  }
  return { items, warnings, truncated: true };
}

/** Split a date range into chunks no longer than `maxDays` (network report limits). */
export function chunkRange(range: DateRange, maxDays: number): DateRange[] {
  const out: DateRange[] = [];
  const step = maxDays * 86_400_000;
  for (let t = range.since.getTime(); t < range.until.getTime(); t += step) {
    out.push({ since: new Date(t), until: new Date(Math.min(t + step, range.until.getTime())) });
  }
  return out;
}

/** Network text value with placeholder strings ("null", "N/A", "ongoing") treated as absent. */
export function clean(v: unknown): string | null {
  const s = str(v);
  return s && !/^(null|n\/a|none|ongoing|undefined)$/i.test(s) ? s : null;
}

/** Parse a network date ("2026-11-01", "2026-11-01 10:00:00", ISO with offset, "11/01/2026") to ISO; null if invalid. */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  const normalized = us
    ? `${us[3]}-${(us[1] as string).padStart(2, "0")}-${(us[2] as string).padStart(2, "0")}T${(us[4] ?? "00").padStart(2, "0")}:${us[5] ?? "00"}:${us[6] ?? "00"}Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? `${s}T00:00:00Z`
      : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)
        ? `${s.replace(" ", "T")}Z`
        : s;
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Best-effort discount extraction from promotion text. Never invents a value: unknown → other/null. */
export function parseDiscount(text: string | null): { discountType: DiscountType; discountValue: number | null } {
  const t = (text ?? "").toLowerCase();
  const pct = /(\d{1,2}(?:\.\d+)?)\s*%\s*off/.exec(t) ?? /save\s+(\d{1,2}(?:\.\d+)?)\s*%/.exec(t) ?? /(\d{1,2}(?:\.\d+)?)\s*%/.exec(t);
  if (pct) return { discountType: "percent", discountValue: Math.round(Number(pct[1])) };
  const amt = /\$\s?(\d{1,5}(?:\.\d{2})?)\s*off/.exec(t) ?? /save\s+\$\s?(\d{1,5}(?:\.\d{2})?)/.exec(t);
  if (amt) return { discountType: "amount", discountValue: toCents(amt[1]) };
  if (/free\s+(standard\s+)?shipping|free\s+delivery/.test(t)) return { discountType: "free_shipping", discountValue: null };
  if (/\bbogo\b|buy\s+one,?\s+get\s+one|buy\s+\d+\s+get\s+\d+/.test(t)) return { discountType: "bogo", discountValue: null };
  return { discountType: "other", discountValue: null };
}

/** "Min. purchase $50" / "orders over $75" → cents. */
export function parseMinSpend(text: string | null): number | null {
  const m = /(?:min(?:imum)?\.?\s*(?:purchase|order|spend)?(?:\s+of)?|orders?\s+(?:of\s+)?(?:over|above)|spend)\s*\$\s?(\d{1,5}(?:\.\d{2})?)/i.exec(text ?? "");
  return m ? toCents(m[1]) : null;
}

/** Map network-specific state strings to our conversion state. */
export function conversionState(v: unknown): "pending" | "approved" | "reversed" {
  const s = (str(v) ?? "").toLowerCase();
  if (/(revers|declin|reject|cancel|void|delet|correct(ed)?_out|invalid|returned|lock(ed)?_reversed)/.test(s)) return "reversed";
  if (/(approv|closed|locked|paid|confirm|valid|cleared|extended_approved)/.test(s)) return "approved";
  return "pending";
}

export interface ListingFields {
  retailerId: string;
  sku: string | null;
  title: string | null;
  brand?: unknown;
  mpn?: unknown;
  gtin?: unknown;
  imageUrl?: unknown;
  productUrl?: unknown;
  affiliateUrl?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  salePrice?: unknown;
  currency?: unknown;
  availability?: unknown;
  condition?: unknown;
  shipping?: unknown;
  observedAt: string;
}

/** Build a NormalizedListing from flat network fields (shared by CJ/Impact/Rakuten mappers). */
export function buildListing(f: ListingFields): NormalizedListing | null {
  if (!f.sku || !f.title) return null;
  const regular = toCents(f.price);
  const sale = toCents(f.salePrice);
  const useSale = sale !== null && sale > 0 && (regular === null || sale < regular);
  const priceCents = useSale ? sale : regular;
  const productUrl = str(f.productUrl);
  const affiliateUrl = str(f.affiliateUrl);
  const category = str(f.category);
  const product = {
    retailerId: f.retailerId,
    retailerSku: f.sku,
    title: f.title,
    brand: str(f.brand),
    mpn: str(f.mpn),
    model: str(f.mpn),
    gtin: cleanGtin(f.gtin),
    imageUrl: str(f.imageUrl),
    productUrl: productUrl ?? affiliateUrl,
    categoryPath: category ? category.split(/\s*[>|]\s*/).filter(Boolean) : [],
    description: str(f.description),
    attributes: {},
  };
  const offer =
    priceCents !== null && priceCents > 0
      ? {
          retailerId: f.retailerId,
          retailerSku: f.sku,
          priceCents,
          listPriceCents: useSale && regular !== null ? regular : null,
          currency: (str(f.currency) ?? "USD").toUpperCase(),
          availability: mapAvailability(typeof f.availability === "boolean" ? f.availability : str(f.availability)),
          condition: mapCondition(str(f.condition)),
          productUrl: productUrl ?? affiliateUrl,
          affiliateUrl,
          shippingCents: f.shipping === undefined || f.shipping === null || f.shipping === "" ? null : toCents(f.shipping),
          sellerName: null,
          source: "affiliate" as const,
          observedAt: f.observedAt,
        }
      : null;
  return { product, offer };
}

/** Signed money (corrections can be negative) → cents. */
export function signedCents(v: unknown): number {
  const s = typeof v === "number" ? v.toFixed(2) : str(v);
  if (!s) return 0;
  const neg = s.trim().startsWith("-");
  const c = toCents(neg ? s.trim().slice(1) : s);
  return c === null ? 0 : neg ? -c : c;
}
