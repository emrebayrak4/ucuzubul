import type { ExtensionCoupon } from "./types";

/** Hard ceiling on how many codes one "Try them" run may test, whatever the store config says. */
export const HARD_MAX_CODES = 20;
export const DEFAULT_MAX_CODES = 10;

export interface SuccessStats {
  /** 0–1 */
  rate: number;
  /** Number of reports behind the rate, when known. */
  reports: number | null;
}

/**
 * Success rate to show/rank by. Uses the API's `successRate` when given; otherwise derives it from
 * successCount/failCount. Returns null when there is no evidence at all (we never invent a rate).
 */
export function successStats(c: ExtensionCoupon): SuccessStats | null {
  const s = c.successCount ?? 0;
  const f = c.failCount ?? 0;
  const reports = c.successCount != null || c.failCount != null ? s + f : null;
  if (typeof c.successRate === "number") return { rate: c.successRate, reports };
  if (s + f > 0) return { rate: s / (s + f), reports: s + f };
  return null;
}

function isExpired(c: ExtensionCoupon, now: number): boolean {
  if (!c.expiresAt) return false;
  const t = Date.parse(c.expiresAt);
  return Number.isFinite(t) && t < now;
}

function time(v: string | null | undefined): number {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Normalizes a coupon code for comparison/dedupe. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Coupons worth trying at checkout, best first:
 * only coupons with a code, not expired, deduped by code; known success rate (desc) before unknown;
 * ties → more reports, then most recently verified. Capped at `max` (≤ HARD_MAX_CODES).
 */
export function orderCouponsForCheckout(
  coupons: readonly ExtensionCoupon[],
  max: number = DEFAULT_MAX_CODES,
  now: number = Date.now(),
): ExtensionCoupon[] {
  const cap = Math.max(0, Math.min(Math.floor(max), HARD_MAX_CODES));
  const seen = new Set<string>();
  const usable = coupons.filter((c) => {
    if (!c.code || !c.code.trim() || isExpired(c, now)) return false;
    const key = normalizeCode(c.code);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = usable
    .map((c, index) => ({ c, index, stats: successStats(c) }))
    .sort((a, b) => {
      if (a.stats && !b.stats) return -1;
      if (!a.stats && b.stats) return 1;
      if (a.stats && b.stats) {
        if (b.stats.rate !== a.stats.rate) return b.stats.rate - a.stats.rate;
        const ra = a.stats.reports ?? 0;
        const rb = b.stats.reports ?? 0;
        if (rb !== ra) return rb - ra;
      }
      const tv = time(b.c.lastVerifiedAt) - time(a.c.lastVerifiedAt);
      if (tv !== 0) return tv;
      return a.index - b.index;
    });
  return ranked.slice(0, cap).map((r) => r.c);
}

/** Coupons to list in the popup: not expired; coded ones first (by the same ranking), then code-less deals. */
export function orderCouponsForDisplay(coupons: readonly ExtensionCoupon[], now: number = Date.now()): ExtensionCoupon[] {
  const coded = orderCouponsForCheckout(coupons, HARD_MAX_CODES * 10, now);
  const codedIds = new Set(coded.map((c) => c.id));
  const deals = coupons.filter((c) => !codedIds.has(c.id) && !c.code && !isExpired(c, now));
  return [...coded, ...deals];
}

/** Number shown on the toolbar badge: distinct usable codes. */
export function badgeCount(coupons: readonly ExtensionCoupon[], now: number = Date.now()): number {
  return orderCouponsForCheckout(coupons, HARD_MAX_CODES * 10, now).length;
}
