import { describe, expect, it } from "vitest";
import { evaluateAlert, evaluateAlerts, parseMoneyToCents, parseProductUrl, parseSearchQuery, type AlertRule, type PriceChangeEvent } from "../src/index";

describe("parseSearchQuery", () => {
  it("best laptop under $800", () => {
    const q = parseSearchQuery("best laptop under $800");
    expect(q.kind).toBe("text");
    expect(q.terms).toEqual(["laptop"]);
    expect(q.maxPriceCents).toBe(80000);
    expect(q.minPriceCents).toBeNull();
    expect(q.categoryHint).toBe("laptops");
    expect(q.sortHint).toBe("best_match");
  });

  it("65 inch OLED TV under $1,500", () => {
    const q = parseSearchQuery("65 inch OLED TV under $1,500");
    expect(q.terms).toEqual(["oled", "tv"]);
    expect(q.maxPriceCents).toBe(150000);
    expect(q.filters.screenInches).toBe(65);
    expect(q.categoryHint).toBe("tvs");
  });

  it("cheapest iPhone with 256GB", () => {
    const q = parseSearchQuery("cheapest iPhone with 256GB");
    expect(q.terms).toEqual(["iphone"]);
    expect(q.filters.storageGb).toBe(256);
    expect(q.filters.brand).toBe("Apple");
    expect(q.sortHint).toBe("lowest_total");
    expect(q.categoryHint).toBe("smartphones");
  });

  it("gaming monitor 144Hz under $200", () => {
    const q = parseSearchQuery("gaming monitor 144Hz under $200");
    expect(q.terms).toEqual(["gaming", "monitor"]);
    expect(q.filters.refreshHzMin).toBe(144);
    expect(q.maxPriceCents).toBe(20000);
    expect(q.categoryHint).toBe("monitors");
  });

  it("price ranges and minimums", () => {
    expect(parseSearchQuery("headphones between $100 and $300")).toMatchObject({ minPriceCents: 10000, maxPriceCents: 30000 });
    expect(parseSearchQuery("tv $500-$1k")).toMatchObject({ minPriceCents: 50000, maxPriceCents: 100000 });
    expect(parseSearchQuery("laptop over $1,000")).toMatchObject({ minPriceCents: 100000, maxPriceCents: null });
    expect(parseSearchQuery("watch from 2023").minPriceCents).toBeNull();
    expect(parseSearchQuery("tablet under 1.5k").maxPriceCents).toBe(150000);
  });

  it("condition, color, pack and RAM filters", () => {
    const q = parseSearchQuery("refurbished macbook pro 16gb ram 1tb space gray");
    expect(q.filters).toMatchObject({ condition: "refurbished", ramGb: 16, storageGb: 1024, color: "space gray", brand: "Apple" });
    expect(q.terms).toEqual(["macbook", "pro"]);
    expect(parseSearchQuery("airtag 4 pack").filters.packCount).toBe(4);
    expect(parseSearchQuery("tv deals").sortHint).toBe("best_deal");
  });

  it("detects GTIN/UPC", () => {
    const q = parseSearchQuery("036000291452");
    expect(q.kind).toBe("gtin");
    expect(q.gtin).toEqual({ value: "036000291452", gtin14: "00036000291452", type: "UPC-A" });
    expect(parseSearchQuery("036000291453").kind).toBe("text"); // bad check digit
  });

  it("detects product URLs", () => {
    const q = parseSearchQuery("https://www.amazon.com/Apple-iPhone/dp/B0CHX1W1XY?ref=abc");
    expect(q.kind).toBe("url");
    expect(q.url).toMatchObject({ retailer: "amazon", id: "B0CHX1W1XY", idType: "asin" });
  });

  it("empty query", () => {
    expect(parseSearchQuery("   ").kind).toBe("empty");
  });

  it("parseMoneyToCents", () => {
    expect(parseMoneyToCents("$1,299.99")).toBe(129999);
    expect(parseMoneyToCents("800")).toBe(80000);
    expect(parseMoneyToCents("$2k")).toBe(200000);
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("abc")).toBeNull();
  });
});

describe("parseProductUrl", () => {
  it.each([
    ["https://www.amazon.com/gp/product/B08N5WRWNW", "amazon", "B08N5WRWNW", "asin"],
    ["https://www.walmart.com/ip/Apple-AirPods-Pro/5689919121", "walmart", "5689919121", "item_id"],
    ["https://www.bestbuy.com/site/sony-wh1000xm5/6505727.p?skuId=6505727", "bestbuy", "6505727", "sku"],
    ["https://www.target.com/p/apple-airpods/-/A-85978612", "target", "85978612", "tcin"],
    ["https://www.ebay.com/itm/256123456789", "ebay", "256123456789", "item_id"],
    ["https://www.homedepot.com/p/DEWALT-Drill/204279858", "homedepot", "204279858", "item_id"],
    ["https://www.costco.com/apple-ipad.product.4000123456.html", "costco", "4000123456", "item_id"],
  ])("%s", (url, retailer, id, idType) => {
    expect(parseProductUrl(url)).toMatchObject({ retailer, id, idType });
  });

  it("rejects look-alike hosts and non-http schemes", () => {
    expect(parseProductUrl("https://amazon.com.evil.example/dp/B08N5WRWNW")).toBeNull();
    expect(parseProductUrl("https://notamazon.com/dp/B08N5WRWNW")).toBeNull();
    expect(parseProductUrl("javascript:alert(1)")).toBeNull();
    expect(parseProductUrl("not a url")).toBeNull();
  });

  it("short links need resolution", () => {
    expect(parseProductUrl("https://amzn.to/3abcd")).toMatchObject({ retailer: "amazon", id: null });
  });
});

describe("evaluateAlert", () => {
  const NOW = new Date("2026-11-26T12:00:00Z");
  const base: PriceChangeEvent = {
    productId: "p1",
    offerId: "o1",
    retailerId: "bestbuy",
    occurredAt: NOW,
    previousPriceCents: 10000,
    newPriceCents: 8900,
    previousInStock: true,
    newInStock: true,
  };

  it("below_price fires on crossing the target", () => {
    const rule: AlertRule = { id: "r1", productId: "p1", type: "below_price", targetPriceCents: 9000 };
    const r = evaluateAlert(rule, base, {}, NOW);
    expect(r.fire).toBe(true);
    expect(r.dedupeKey).toBe("r1:below:8900");
    expect(r.message).toContain("$89.00");
  });

  it("below_price does not re-fire when the price rises but stays below", () => {
    const rule: AlertRule = { id: "r1", productId: "p1", type: "below_price", targetPriceCents: 9000 };
    expect(evaluateAlert(rule, { ...base, previousPriceCents: 8500, newPriceCents: 8800 }, {}, NOW).skipReason).toBe("not_matched");
    expect(evaluateAlert(rule, { ...base, previousPriceCents: 8900, newPriceCents: 8500 }, {}, NOW).fire).toBe(true);
  });

  it("dedupe and cooldown", () => {
    const rule: AlertRule = { id: "r1", productId: "p1", type: "below_price", targetPriceCents: 9000, cooldownMinutes: 60 };
    expect(evaluateAlert(rule, base, { firedKeys: ["r1:below:8900"] }, NOW).skipReason).toBe("duplicate");
    expect(evaluateAlert(rule, base, { lastFiredAt: new Date(NOW.getTime() - 30 * 60_000) }, NOW).skipReason).toBe("cooldown");
    expect(evaluateAlert(rule, base, { lastFiredAt: new Date(NOW.getTime() - 90 * 60_000) }, NOW).fire).toBe(true);
  });

  it("drop_percent uses the reference price when given", () => {
    const rule: AlertRule = { id: "r2", productId: "p1", type: "drop_percent", percent: 10 };
    expect(evaluateAlert(rule, base, {}, NOW).fire).toBe(true); // 11%
    expect(evaluateAlert({ ...rule, percent: 20 }, base, {}, NOW).fire).toBe(false);
    expect(evaluateAlert({ ...rule, percent: 20, referencePriceCents: 12000 }, base, {}, NOW).fire).toBe(true); // 25.8%
  });

  it("back_in_stock", () => {
    const rule: AlertRule = { id: "r3", productId: "p1", type: "back_in_stock" };
    expect(evaluateAlert(rule, { ...base, previousInStock: false, newInStock: true }, {}, NOW)).toMatchObject({ fire: true, dedupeKey: "r3:stock:o1:2026-11-26" });
    expect(evaluateAlert(rule, base, {}, NOW).fire).toBe(false);
  });

  it("new_cheaper_store ignores the retailer filter and needs a lower best price", () => {
    const rule: AlertRule = { id: "r4", productId: "p1", type: "new_cheaper_store", retailerId: "amazon" };
    const ev = { ...base, previousBestPriceCents: 9500, previousBestRetailerId: "amazon", newBestPriceCents: 8900, newBestRetailerId: "bestbuy" };
    expect(evaluateAlert(rule, ev, {}, NOW).fire).toBe(true);
    expect(evaluateAlert(rule, { ...ev, newBestRetailerId: "amazon" }, {}, NOW).fire).toBe(false);
  });

  it("all_time_low and coupon", () => {
    const atl: AlertRule = { id: "r5", productId: "p1", type: "all_time_low" };
    expect(evaluateAlert(atl, { ...base, previousAllTimeLowCents: 9000 }, {}, NOW).fire).toBe(true);
    expect(evaluateAlert(atl, { ...base, previousAllTimeLowCents: 8000 }, {}, NOW).fire).toBe(false);
    const coupon: AlertRule = { id: "r6", productId: "p1", type: "coupon" };
    expect(evaluateAlert(coupon, { ...base, coupon: { id: "c1", description: "$10 off" } }, {}, NOW)).toMatchObject({ fire: true, dedupeKey: "r6:coupon:c1" });
  });

  it("inactive, product and retailer mismatch", () => {
    const rule: AlertRule = { id: "r7", productId: "p1", type: "below_price", targetPriceCents: 9000 };
    expect(evaluateAlert({ ...rule, active: false }, base, {}, NOW).skipReason).toBe("inactive");
    expect(evaluateAlert({ ...rule, productId: "p2" }, base, {}, NOW).skipReason).toBe("product_mismatch");
    expect(evaluateAlert({ ...rule, retailerId: "amazon" }, base, {}, NOW).skipReason).toBe("retailer_mismatch");
  });

  it("evaluateAlerts batches rules with per-rule state", () => {
    const rules: AlertRule[] = [
      { id: "a", productId: "p1", type: "below_price", targetPriceCents: 9000 },
      { id: "b", productId: "p1", type: "drop_percent", percent: 50 },
    ];
    const out = evaluateAlerts(rules, base, { a: { firedKeys: [] } }, NOW);
    expect(out.map((o) => o.fire)).toEqual([true, false]);
  });
});
