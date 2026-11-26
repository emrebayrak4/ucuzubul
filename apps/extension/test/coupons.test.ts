import { describe, expect, it } from "vitest";
import { badgeCount, HARD_MAX_CODES, orderCouponsForCheckout, orderCouponsForDisplay, successStats } from "../src/shared/coupons";
import type { ExtensionCoupon } from "../src/shared/types";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const c = (id: string, extra: Partial<ExtensionCoupon> = {}): ExtensionCoupon => ({ id, code: id.toUpperCase(), title: `Coupon ${id}`, ...extra });

describe("successStats", () => {
  it("prefers the API rate, falls back to counts, never invents one", () => {
    expect(successStats(c("a", { successRate: 0.8, successCount: 8, failCount: 2 }))).toEqual({ rate: 0.8, reports: 10 });
    expect(successStats(c("b", { successCount: 3, failCount: 1 }))).toEqual({ rate: 0.75, reports: 4 });
    expect(successStats(c("c", { successRate: 0.5 }))).toEqual({ rate: 0.5, reports: null });
    expect(successStats(c("d"))).toBeNull();
    expect(successStats(c("e", { successCount: 0, failCount: 0 }))).toBeNull();
  });
});

describe("orderCouponsForCheckout", () => {
  it("orders by success rate, then report count, then recency; unknown rates last", () => {
    const list = [
      c("unknown_old", { lastVerifiedAt: "2026-10-01T00:00:00Z" }),
      c("low", { successRate: 0.2, successCount: 2, failCount: 8 }),
      c("high_few", { successRate: 0.9, successCount: 9, failCount: 1 }),
      c("unknown_new", { lastVerifiedAt: "2026-11-25T00:00:00Z" }),
      c("high_many", { successRate: 0.9, successCount: 90, failCount: 10 }),
      c("mid", { successCount: 5, failCount: 5 }),
    ];
    expect(orderCouponsForCheckout(list, 10, NOW).map((x) => x.id)).toEqual([
      "high_many",
      "high_few",
      "mid",
      "low",
      "unknown_new",
      "unknown_old",
    ]);
  });

  it("skips code-less, expired and duplicate codes", () => {
    const list = [
      c("a", { code: null }),
      c("b", { code: "  " }),
      c("exp", { expiresAt: "2026-11-01T00:00:00Z" }),
      c("future", { expiresAt: "2026-12-31T00:00:00Z" }),
      c("dup1", { code: "SAVE10", successRate: 0.5 }),
      c("dup2", { code: "save10 ", successRate: 0.9 }),
    ];
    expect(orderCouponsForCheckout(list, 10, NOW).map((x) => x.id)).toEqual(["dup1", "future"]);
  });

  it("caps at max and at the hard ceiling", () => {
    const many = Array.from({ length: 40 }, (_, i) => c(`k${i}`));
    expect(orderCouponsForCheckout(many, 3, NOW)).toHaveLength(3);
    expect(orderCouponsForCheckout(many, 1000, NOW)).toHaveLength(HARD_MAX_CODES);
    expect(orderCouponsForCheckout(many, 0, NOW)).toHaveLength(0);
    expect(orderCouponsForCheckout(many, -5, NOW)).toHaveLength(0);
  });
});

describe("display + badge", () => {
  it("lists coded coupons first, then deals; badge counts usable codes", () => {
    const list = [
      c("deal", { code: null, title: "Free shipping over $35" }),
      c("x", { successRate: 0.3 }),
      c("y", { successRate: 0.7 }),
      c("old", { expiresAt: "2020-01-01T00:00:00Z" }),
    ];
    expect(orderCouponsForDisplay(list, NOW).map((x) => x.id)).toEqual(["y", "x", "deal"]);
    expect(badgeCount(list, NOW)).toBe(2);
    expect(badgeCount([], NOW)).toBe(0);
  });
});
