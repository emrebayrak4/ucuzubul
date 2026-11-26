/**
 * Extension-internal shapes, mapped from the API contracts in @pricora/contracts:
 *   GET  /v1/extension/config   → ExtensionConfigResponse { configs: CheckoutConfig[] }   (enabled configs only)
 *   GET  /v1/extension/coupons  → ExtensionCouponsResponse { retailer, coupons: Coupon[] }
 *   GET  /v1/extension/product  → ExtensionProductResponse (found | not_found)
 *   POST /v1/coupons/:id/result ← CouponResultRequest
 *   POST /v1/me/coupon-follows  ← CreateCouponFollowRequest
 * Items are validated one by one with the contract schemas; an invalid item is dropped instead of failing the whole
 * response, so one bad admin entry can't disable the extension. Internals use flat, small shapes (below).
 */
import {
  CheckoutConfig,
  Coupon,
  CouponRetailer,
  ExtensionProductResponse as ExtensionProductResponseSchema,
  type CouponResultRequest as ContractCouponResultRequest,
  type Offer,
} from "@pricora/contracts";
import "./zod";

/** A checkout config the extension can act on (all three required selectors present). */
export interface RetailerCheckoutConfig {
  retailerSlug: string;
  retailerName: string;
  /** /v1/extension/config only returns enabled configs; kept explicit so a disabled entry is never used. */
  enabled: boolean;
  hostPatterns: string[];
  checkoutUrlPatterns: string[];
  couponInputSelector: string;
  applyButtonSelector: string;
  totalSelector: string;
  successIndicatorSelector: string | null;
  errorIndicatorSelector: string | null;
  removeButtonSelector: string | null;
  version: number | null;
  /** Optional per-store cap (not in contracts yet); the extension also enforces its own hard cap. */
  maxCodes?: number | null;
  /** Optional per-store apply wait in ms (not in contracts yet). */
  applyTimeoutMs?: number | null;
}

/** Accepts the contract response `{ configs }` (also `{ items }` / a bare array). Unusable entries are dropped. */
export function parseConfigList(raw: unknown): RetailerCheckoutConfig[] {
  const obj = raw && typeof raw === "object" ? (raw as { configs?: unknown; items?: unknown }) : null;
  const list = Array.isArray(raw) ? raw : (obj?.configs ?? obj?.items);
  if (!Array.isArray(list)) return [];
  const out: RetailerCheckoutConfig[] = [];
  for (const item of list) {
    const r = CheckoutConfig.safeParse(item);
    if (!r.success) continue;
    const c = r.data;
    if (!c.couponInputSelector || !c.applyButtonSelector || !c.totalSelector) continue; // can't run without these
    const extra = item as { enabled?: unknown; maxCodes?: unknown; applyTimeoutMs?: unknown };
    const posInt = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
    out.push({
      retailerSlug: c.retailerSlug,
      retailerName: c.retailerName,
      enabled: extra.enabled !== false,
      hostPatterns: c.hostPatterns,
      checkoutUrlPatterns: c.checkoutUrlPatterns,
      couponInputSelector: c.couponInputSelector,
      applyButtonSelector: c.applyButtonSelector,
      totalSelector: c.totalSelector,
      successIndicatorSelector: c.successIndicatorSelector,
      errorIndicatorSelector: c.errorIndicatorSelector,
      removeButtonSelector: c.removeButtonSelector,
      version: c.version,
      maxCodes: posInt(extra.maxCodes),
      applyTimeoutMs: posInt(extra.applyTimeoutMs),
    });
  }
  return out;
}

export interface ExtensionCoupon {
  id: string;
  code: string | null;
  title: string;
  description?: string | null;
  discountType?: string | null;
  expiresAt?: string | null;
  /** 0–1 from real reports, null when unknown. Never invented client-side. */
  successRate?: number | null;
  successCount?: number | null;
  failCount?: number | null;
  lastVerifiedAt?: string | null;
  source?: string | null;
}

export interface ExtensionRetailer {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
}

export interface NormalizedCoupons {
  retailer: ExtensionRetailer | null;
  coupons: ExtensionCoupon[];
}

export function couponFromContract(c: Coupon): ExtensionCoupon {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    discountType: c.discountType,
    expiresAt: c.expiresAt,
    successRate: c.stats.successRate,
    successCount: c.stats.successCount,
    failCount: c.stats.failCount,
    lastVerifiedAt: c.stats.lastVerifiedAt ?? c.stats.lastWorkedAt,
    source: c.source,
  };
}

export function parseCouponsResponse(raw: unknown): NormalizedCoupons {
  const obj = raw && typeof raw === "object" ? (raw as { retailer?: unknown; coupons?: unknown }) : {};
  const r = CouponRetailer.safeParse(obj.retailer);
  const coupons: ExtensionCoupon[] = [];
  for (const item of Array.isArray(obj.coupons) ? obj.coupons : []) {
    const c = Coupon.safeParse(item);
    if (c.success) coupons.push(couponFromContract(c.data));
  }
  return { retailer: r.success ? { id: r.data.id, slug: r.data.slug, name: r.data.name, logoUrl: r.data.logoUrl } : null, coupons };
}

export interface ProductOffer {
  offerId: string;
  retailerName: string;
  retailerSlug: string | null;
  estimatedTotalCents: number;
  currency: string;
  source: string;
  /** API-relative /v1/go/:offerId. Never a raw retailer URL. */
  goUrl: string | null;
}

export interface ProductLookup {
  matched: boolean;
  product: { slug: string; title: string; hasDemoData: boolean } | null;
  current: ProductOffer | null;
  /** Cheapest estimated total at another store (strictly cheaper than `current`, when known). */
  cheapest: ProductOffer | null;
}

function offerFromContract(o: Offer): ProductOffer {
  return {
    offerId: o.id,
    retailerName: o.retailer.name,
    retailerSlug: o.retailer.slug,
    estimatedTotalCents: o.estimatedTotalCents,
    currency: o.currency,
    source: o.source,
    goUrl: o.goUrl,
  };
}

export function parseProductResponse(raw: unknown): ProductLookup {
  const r = ExtensionProductResponseSchema.parse(raw);
  if (r.status !== "found") return { matched: false, product: null, current: null, cheapest: null };
  const cheapest = [...r.cheaperElsewhere].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents)[0];
  return {
    matched: true,
    product: { slug: r.product.slug, title: r.product.title, hasDemoData: r.product.hasDemoData },
    current: r.currentOffer ? offerFromContract(r.currentOffer) : null,
    cheapest: cheapest ? offerFromContract(cheapest) : null,
  };
}

export type CouponResultRequest = Pick<ContractCouponResultRequest, "worked" | "orderTotalCents" | "savingsCents" | "deviceId"> & {
  source: "extension";
};

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
}
