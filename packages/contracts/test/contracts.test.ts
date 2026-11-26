import { describe, expect, it } from "vitest";
import { CreatePriceAlertRequest, ErrorEnvelope, FlightSearchQuery, Offer, SearchQuery, endpoints } from "../src";

describe("endpoint registry", () => {
  it("has unique method+path pairs", () => {
    const keys = Object.values(endpoints).map((e) => e.method + " " + e.path);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("paths are relative to /v1", () => {
    for (const e of Object.values(endpoints)) expect(e.path.startsWith("/")).toBe(true);
  });
});

describe("schemas", () => {
  it("coerces search query params", () => {
    const q = SearchQuery.parse({ q: "laptop", minPrice: "10000", condition: "new,refurbished", inStock: "1" });
    expect(q.minPrice).toBe(10000);
    expect(q.condition).toEqual(["new", "refurbished"]);
    expect(q.inStock).toBe(true);
    expect(() => SearchQuery.parse({ pageSize: "500" })).toThrow();
  });
  it("rejects float money", () => {
    const base = Offer.shape.priceCents;
    expect(base.safeParse(1999).success).toBe(true);
    expect(base.safeParse(19.99).success).toBe(false);
  });
  it("requires source on offers", () => {
    expect(Offer.shape.source.safeParse("demo").success).toBe(true);
    expect(Offer.shape.source.safeParse("scraped").success).toBe(false);
  });
  it("validates alert type requirements", () => {
    expect(CreatePriceAlertRequest.safeParse({ productId: "p1", type: "below_price" }).success).toBe(false);
    expect(CreatePriceAlertRequest.safeParse({ productId: "p1", type: "below_price", targetPriceCents: 9999 }).success).toBe(true);
  });
  it("validates flight search", () => {
    expect(FlightSearchQuery.safeParse({ from: "jfk", to: "LAX", depart: "2026-12-20" }).success).toBe(true);
    expect(FlightSearchQuery.safeParse({ from: "JFK", to: "JFK", depart: "2026-12-20" }).success).toBe(false);
    expect(FlightSearchQuery.safeParse({ from: "JFK", to: "LAX", depart: "2026-12-20", return: "2026-12-10" }).success).toBe(false);
  });
  it("parses error envelope", () => {
    expect(ErrorEnvelope.safeParse({ error: { code: "not_found", message: "Nope" } }).success).toBe(true);
  });
});
