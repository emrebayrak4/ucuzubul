/**
 * Affiliate-network (publisher-side) client contracts.
 * Networks give us three things: product catalogs/feeds, promotions/coupons, and conversion reports.
 * Money is integer cents in `currency`; every record keeps the network's own id for idempotent upserts.
 */
import type { AdapterStatus, HealthCheckResult, NormalizedListing } from "../types";

/** Matches the DB `AffiliateNetwork` enum values. */
export type NetworkId = "cj" | "impact" | "rakuten" | "awin" | "partnerize" | "ebay_partner";

export type DiscountType = "percent" | "amount" | "free_shipping" | "bogo" | "other";
export type ConversionState = "pending" | "approved" | "reversed";

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page; null when done. */
  next: string | null;
  warnings: string[];
}

export interface NetworkProduct {
  network: NetworkId;
  /** Network advertiser/program id (maps to AffiliateProgram.externalId). */
  advertiserId: string;
  advertiserName: string | null;
  listing: NormalizedListing;
}

export interface NetworkProductQuery {
  advertiserId?: string;
  keywords?: string;
  /** Network-specific catalog id (Impact catalogs, Awin feed ids). */
  catalogId?: string;
  pageSize?: number;
}

export interface NetworkCoupon {
  network: NetworkId;
  externalId: string;
  advertiserId: string | null;
  advertiserName: string | null;
  code: string | null;
  title: string;
  description: string | null;
  discountType: DiscountType;
  /** Percent (e.g. 20 = 20%) or cents for "amount"; null when unknown. */
  discountValue: number | null;
  minSpendCents: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  /** Network tracking URL (sub-id is added at click time). */
  trackingUrl: string | null;
  landingUrl: string | null;
}

export interface NetworkConversion {
  network: NetworkId;
  externalId: string;
  /** Our click id as echoed back by the network (CJ sid, Impact SubId1, Rakuten u1, Awin clickref, Partnerize pubref, EPN customid). */
  subId: string | null;
  advertiserId: string | null;
  advertiserName: string | null;
  orderId: string | null;
  saleAmountCents: number;
  commissionCents: number;
  currency: string;
  state: ConversionState;
  occurredAt: string;
  /** Raw record for audit (stored in AffiliateConversion.raw). */
  raw: Record<string, unknown>;
}

export interface DateRange {
  since: Date;
  until: Date;
}

export interface LinkRequest {
  destinationUrl: string;
  subId?: string;
  advertiserId?: string;
  /** Impact program tracking link / Partnerize camref etc. when known. */
  trackingBase?: string;
}

export interface NetworkCapabilities {
  products: boolean;
  coupons: boolean;
  conversions: boolean;
  links: boolean;
}

export interface AffiliateNetworkClient {
  readonly id: NetworkId;
  readonly name: string;
  readonly kind: "network";
  readonly requiredEnv: readonly string[];
  readonly capabilities: NetworkCapabilities;
  /** Max days per conversion-report request (network limit). */
  readonly maxReportDays: number;
  /** How far back the report API lets us query (days). */
  readonly maxLookbackDays: number;
  status(): AdapterStatus;
  missingEnv(): string[];
  healthCheck(): Promise<HealthCheckResult>;
  fetchProducts(q: NetworkProductQuery, cursor?: string | null): Promise<Page<NetworkProduct>>;
  fetchCoupons(cursor?: string | null): Promise<Page<NetworkCoupon>>;
  fetchConversions(range: DateRange, cursor?: string | null): Promise<Page<NetworkConversion>>;
  /** Synchronous deep link (no API call) or null when the network needs per-program data we lack. */
  buildLink(req: LinkRequest): string | null;
}
