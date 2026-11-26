// Mapping of real API payloads (captured from the local dev API, demo seed data — TEST-ONLY fixtures) to internal shapes.
import { describe, expect, it } from "vitest";
import { parseConfigList, parseCouponsResponse, parseProductResponse } from "../src/shared/types";
import coupons from "./fixtures/api-extension-coupons.json";
import productFound from "./fixtures/api-extension-product-found.json";

const config = {
  retailerSlug: "target",
  retailerName: "Target",
  hostPatterns: ["target.com", "*.target.com"],
  checkoutUrlPatterns: ["/checkout*"],
  couponInputSelector: "#promo",
  applyButtonSelector: "#apply",
  totalSelector: "#total",
  successIndicatorSelector: null,
  errorIndicatorSelector: ".err",
  removeButtonSelector: null,
  version: 3,
};

describe("contract mapping", () => {
  it("maps ExtensionConfigResponse and drops configs that can't run", () => {
    const list = parseConfigList({
      version: "abc",
      generatedAt: "2026-11-26T00:00:00.000Z",
      configs: [config, { ...config, retailerSlug: "walmart", applyButtonSelector: null }, { nope: 1 }],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ retailerSlug: "target", enabled: true, version: 3, errorIndicatorSelector: ".err", maxCodes: null });
    expect(parseConfigList(null)).toEqual([]);
  });

  it("maps ExtensionCouponsResponse (flattens stats, keeps demo source)", () => {
    const r = parseCouponsResponse(coupons);
    expect(r.retailer?.slug).toBe("amazon");
    expect(r.coupons.length).toBe(coupons.coupons.length);
    const first = r.coupons[0];
    expect(first?.code).toMatch(/^DEMO/);
    expect(first?.source).toBe("demo");
    expect(first).toHaveProperty("successRate");
    expect(parseCouponsResponse({ retailer: null, coupons: [{ bad: true }] })).toEqual({ retailer: null, coupons: [] });
  });

  it("maps ExtensionProductResponse found → cheapest other offer", () => {
    const r = parseProductResponse(productFound);
    expect(r.matched).toBe(true);
    expect(r.current?.offerId).toBe(productFound.currentOffer.id);
    const cheapestTotal = Math.min(...productFound.cheaperElsewhere.map((o) => o.estimatedTotalCents));
    expect(r.cheapest?.estimatedTotalCents).toBe(cheapestTotal);
    expect(r.cheapest?.goUrl).toMatch(/^\/v1\/go\//);
    expect(r.product?.hasDemoData).toBe(true);
  });

  it("maps not_found", () => {
    expect(parseProductResponse({ status: "not_found", reason: "We don't track this product yet", retailer: "amazon" })).toEqual({
      matched: false,
      product: null,
      current: null,
      cheapest: null,
    });
  });
});
