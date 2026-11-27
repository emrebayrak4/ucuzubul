import { describe, expect, it } from "vitest";
import { bestValueIndex, computeUnitPrice, formatUnitCents, parseMeasures, parseNetQuantity } from "../src/index";

describe("parseNetQuantity", () => {
  it.each([
    ["Cheerios Heart Healthy Cereal, Family Size 18.8 oz", "oz", 18.8, 1, "18.8 oz"],
    ["Cheerios Cereal, 2 x 12 oz", "oz", 24, 2, "2 × 12 oz"],
    ["Cheerios Cereal 12 oz (Pack of 4)", "oz", 48, 4, "4 × 12 oz"],
    ["Coca-Cola Classic, 12 fl oz, 12 Pack", "fl_oz", 144, 12, "12 × 12 fl oz"],
    ["Folgers Classic Roast Ground Coffee, 1.5 lb", "oz", 24, 1, "1.5 lb"],
    ["Barilla Spaghetti 454 g", "oz", 16.01, 1, "454 g"],
    ["Smartwater 1 Liter", "fl_oz", 33.81, 1, "1 l"],
    ["Horizon Organic Whole Milk, Half Gallon", undefined, undefined, undefined, undefined],
    ["Great Value 2% Milk, 1 gal", "fl_oz", 128, 1, "1 gal"],
    ["Pampers Swaddlers Diapers Size 1, 198 Count", "ct", 198, 1, "198 ct"],
    ["Tide Original Liquid Laundry Detergent, 92 fl oz, 64 Loads", "load", 64, 1, "64 loads"],
    ["Bounty Select-A-Size Paper Towels, 6 Double Rolls, 147 Sheets per Roll", "sheet", 882, 1, "882 sheets"],
    ["Pampers Sensitive Baby Wipes, 12 Packs of 56", "ct", 672, 12, "672 ct"],
    ["Pampers Cruisers 360 Diapers Size 4, 116 Count", "ct", 116, 1, "116 ct"],
    ["Kleenex Ultra Soft Facial Tissues, 4 Boxes, 120 Sheets per Box", "sheet", 480, 1, "480 sheets"],
    ["Purina Pro Plan Adult Dry Dog Food, 35 lb", "oz", 560, 1, "35 lb"],
  ])("%s", (title, basis, total, pack, label) => {
    const q = parseNetQuantity(title);
    if (basis === undefined) {
      expect(q).toBeUndefined();
      return;
    }
    expect(q).toMatchObject({ basis, total, packCount: pack, label });
  });

  it("honours a preferred basis when that measure is stated", () => {
    expect(parseNetQuantity("Starbucks Pike Place K-Cup Pods, 0.37 oz, 72 Count", "ct")).toMatchObject({ basis: "ct", total: 72 });
    expect(parseNetQuantity("Starbucks Pike Place K-Cup Pods, 72 Count", "oz")).toMatchObject({ basis: "ct", total: 72 });
  });

  it("returns undefined when no size is stated", () => {
    expect(parseNetQuantity("Kellogg's Frosted Flakes Cereal")).toBeUndefined();
  });

  it("exposes every measure", () => {
    expect(parseMeasures("Tide Pods, 2.6 lb, 81 count")).toMatchObject({ count: 81, packCount: 81 });
    expect(parseMeasures("Tide Original, 92 fl oz, 64 loads")).toMatchObject({ volumeFlOz: 92, loads: 64, packCount: 1 });
  });
});

describe("computeUnitPrice", () => {
  it("cents per ounce under a dollar", () => {
    expect(computeUnitPrice(449, { basis: "oz", total: 18.8 })).toEqual({ basis: "oz", per: 1, millicentsPerUnit: 23883, label: "23.9¢/oz" });
  });
  it("dollars per count", () => {
    expect(computeUnitPrice(4999, { basis: "ct", total: 198 })?.label).toBe("25.2¢/ct");
    expect(computeUnitPrice(2599, { basis: "ct", total: 12 })?.label).toBe("$2.17/ct");
  });
  it("sheets are shown per 100", () => {
    expect(computeUnitPrice(1899, { basis: "sheet", total: 882 })?.label).toBe("$2.15/100 sheets");
  });
  it("null without quantity", () => {
    expect(computeUnitPrice(100, null)).toBeNull();
    expect(computeUnitPrice(100, { basis: "oz", total: 0 })).toBeNull();
  });
  it("formats tiny amounts with two decimals", () => {
    expect(formatUnitCents(4.567)).toBe("4.57¢");
  });
});

describe("bestValueIndex", () => {
  it("picks the cheapest per unit among the same basis", () => {
    const a = computeUnitPrice(449, { basis: "oz", total: 18.8 });
    const b = computeUnitPrice(379, { basis: "oz", total: 12 });
    const c = computeUnitPrice(899, { basis: "oz", total: 40 });
    expect(bestValueIndex([a, b, c])).toBe(2);
  });
  it("refuses to compare mixed bases or a single entry", () => {
    expect(bestValueIndex([computeUnitPrice(100, { basis: "oz", total: 1 }), computeUnitPrice(100, { basis: "ct", total: 1 })])).toBe(-1);
    expect(bestValueIndex([computeUnitPrice(100, { basis: "oz", total: 1 }), null])).toBe(-1);
  });
});
