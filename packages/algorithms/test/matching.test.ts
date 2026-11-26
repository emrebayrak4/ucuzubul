import { describe, expect, it } from "vitest";
import {
  candidateKeys,
  levenshtein,
  matchProducts,
  matchProductsAsync,
  rankCandidates,
  tokenSimilarity,
  trigramSimilarity,
  type MatchableProduct,
} from "../src/index";

const p = (id: string, title: string, extra: Partial<MatchableProduct> = {}): MatchableProduct => ({ id, title, ...extra });

describe("similarity primitives", () => {
  it("token and trigram similarity", () => {
    expect(tokenSimilarity("Apple iPhone 15", "apple iphone 15")).toBe(1);
    expect(tokenSimilarity("Apple iPhone 15", "Sony TV")).toBe(0);
    expect(trigramSimilarity("Samsung Galaxy", "Samsnug Galaxy")).toBeGreaterThan(0.6);
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("matchProducts — identifier and MPN stages", () => {
  it("auto-merges on the same GTIN (UPC vs EAN forms)", () => {
    const r = matchProducts(
      p("a", "Sony WH-1000XM5 Wireless Headphones Black", { gtins: ["027242923232"] }),
      p("b", "Sony WH1000XM5/B Noise Canceling Headphones - Black", { gtins: ["0027242923232"] }),
    );
    expect(r.stage).toBe("identifier");
    expect(r.confidence).toBe(1);
    expect(r.decision).toBe("auto");
  });

  it("matches on brand + MPN", () => {
    const r = matchProducts(
      p("a", "Apple iPhone 15 Pro 256GB Natural Titanium", { brand: "Apple", mpn: "MTUX3LL/A" }),
      p("b", "iPhone 15 Pro 256 GB - Natural Titanium (Unlocked)", { brand: "apple", mpn: "MTUX3LLA" }),
    );
    expect(r.stage).toBe("brand_mpn");
    expect(r.confidence).toBe(0.99);
    expect(r.decision).toBe("auto");
  });

  it("ignores invalid GTINs", () => {
    const r = matchProducts(p("a", "Widget Alpha", { gtins: ["123"] }), p("b", "Widget Alpha", { gtins: ["123"] }));
    expect(r.stage).toBe("scored");
  });
});

describe("matchProducts — hard conflicts (never merge)", () => {
  it("iPhone 256GB vs 128GB is blocked even with similar titles", () => {
    const r = matchProducts(p("a", "Apple iPhone 15 Pro 256GB Black Titanium"), p("b", "Apple iPhone 15 Pro 128GB Black Titanium"));
    expect(r.blocked).toBe(true);
    expect(r.decision).toBe("reject");
    expect(r.conflicts.map((c) => c.attribute)).toContain("storage");
  });

  it("refurbished vs new is blocked even with the same GTIN", () => {
    const r = matchProducts(
      p("a", "Apple iPhone 13 128GB Midnight", { gtins: ["194252707012"] }),
      p("b", "Apple iPhone 13 128GB Midnight (Renewed)", { gtins: ["194252707012"] }),
    );
    expect(r.blocked).toBe(true);
    expect(r.stage).toBe("blocked");
    expect(r.conflicts.find((c) => c.attribute === "condition")).toMatchObject({ a: "new", b: "refurbished" });
  });

  it("explicit condition field overrides title", () => {
    const r = matchProducts(
      p("a", "PlayStation 5 Console", { condition: "open_box" }),
      p("b", "PlayStation 5 Console", { condition: "new" }),
    );
    expect(r.blocked).toBe(true);
  });

  it("2-pack vs 1-pack is blocked", () => {
    const r = matchProducts(p("a", "Apple AirTag 4-Pack"), p("b", "Apple AirTag"));
    expect(r.blocked).toBe(true);
    expect(r.conflicts.find((c) => c.attribute === "pack_count")).toMatchObject({ a: "4", b: "1" });
  });

  it("same model in a different color is blocked", () => {
    const r = matchProducts(
      p("a", "Apple iPhone 15 128GB Blue", { brand: "Apple", mpn: "MTP43LL/A" }),
      p("b", "Apple iPhone 15 128GB Pink", { brand: "Apple" }),
    );
    expect(r.blocked).toBe(true);
    expect(r.conflicts.map((c) => c.attribute)).toEqual(["color"]);
  });

  it("explicit attributes override parsed values", () => {
    const r = matchProducts(
      p("a", "Galaxy S24 Smartphone", { attributes: { storageGb: 256, color: "Onyx Black" } }),
      p("b", "Galaxy S24 Smartphone", { attributes: { storageGb: 256, color: "onyx black" } }),
    );
    expect(r.blocked).toBe(false);
  });

  it("different screen sizes are blocked", () => {
    const r = matchProducts(p("a", 'LG 65" C4 OLED TV OLED65C4PUA'), p("b", 'LG 55" C4 OLED TV OLED55C4PUA'));
    expect(r.blocked).toBe(true);
    expect(r.conflicts.map((c) => c.attribute)).toContain("size");
  });

  it("different model generation is blocked (iPhone 15 vs 16)", () => {
    const r = matchProducts(p("a", "Apple iPhone 15 128GB Black"), p("b", "Apple iPhone 16 128GB Black"));
    expect(r.blocked).toBe(true);
    expect(r.conflicts.map((c) => c.attribute)).toContain("model_number");
  });

  it("different line variant is blocked (Pro vs Pro Max)", () => {
    const r = matchProducts(p("a", "Apple iPhone 15 Pro 256GB"), p("b", "Apple iPhone 15 Pro Max 256GB"));
    expect(r.blocked).toBe(true);
    expect(r.conflicts.map((c) => c.attribute)).toContain("model_variant");
  });

  it("different brands are blocked", () => {
    const r = matchProducts(p("a", "Wireless Earbuds X1", { brand: "Sony" }), p("b", "Wireless Earbuds X1", { brand: "Bose" }));
    expect(r.blocked).toBe(true);
  });

  it("different RAM is blocked", () => {
    const r = matchProducts(p("a", "MacBook Air 13 M3 16GB RAM 512GB SSD"), p("b", "MacBook Air 13 M3 8GB RAM 512GB SSD"));
    expect(r.conflicts.map((c) => c.attribute)).toContain("ram");
  });
});

describe("matchProducts — scoring & decisions", () => {
  const a = p("a", "Sony WH-1000XM5 Wireless Noise Canceling Headphones, Black");
  const b = p("b", "Sony WH1000XM5 Noise-Canceling Wireless Headphones (Black)");

  it("fuzzy title match lands in review by default (no identifiers)", () => {
    const r = matchProducts(a, b);
    expect(r.stage).toBe("scored");
    expect(r.blocked).toBe(false);
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.confidence).toBeLessThan(0.98);
    expect(r.decision).toBe("review");
  });

  it("thresholds are configurable", () => {
    const r = matchProducts(a, b, { thresholds: { auto: 0.8, review: 0.5 }, maxFuzzyConfidence: 1 });
    expect(r.decision).toBe("auto");
    const strict = matchProducts(a, b, { thresholds: { review: 0.999 } });
    expect(strict.decision).toBe("reject");
  });

  it("unrelated products are rejected", () => {
    const r = matchProducts(p("x", "KitchenAid Stand Mixer 5qt"), p("y", "Logitech MX Master 3S Mouse"));
    expect(r.decision).toBe("reject");
  });

  it("uses a pluggable semantic similarity", () => {
    const low = matchProducts(a, b, { semanticSimilarity: () => 0 });
    const high = matchProducts(a, b, { semanticSimilarity: () => 1 });
    expect(high.confidence).toBeGreaterThan(low.confidence);
    expect(high.signals.semantic).toBe(1);
  });

  it("supports async semantic similarity", async () => {
    const r = await matchProductsAsync(a, b, { semanticSimilarity: async () => 0.9 });
    expect(r.signals.semantic).toBe(0.9);
  });

  it("penalizes different MPNs", () => {
    const withMpn = matchProducts({ ...a, brand: "Sony", mpn: "WH1000XM5/B" }, { ...b, brand: "Sony", mpn: "WH1000XM5/S" });
    expect(withMpn.decision).not.toBe("auto");
    expect(withMpn.confidence).toBeLessThan(matchProducts(a, b).confidence);
  });

  it("ranks candidates and drops blocked ones", () => {
    const ranked = rankCandidates(p("q", "Apple iPhone 15 Pro 256GB Black Titanium"), [
      p("1", "Apple iPhone 15 Pro 128GB Black Titanium"),
      p("2", "iPhone 15 Pro 256GB Black Titanium Unlocked"),
      p("3", "Samsung Galaxy S24 256GB"),
    ]);
    expect(ranked.map((r) => r.candidate.id)).toEqual(["2"]);
  });

  it("builds blocking keys", () => {
    const keys = candidateKeys(p("a", "Sony WH-1000XM5 Headphones", { gtins: ["027242923232"] }));
    expect(keys).toContain("gtin:00027242923232");
    expect(keys).toContain("mpn:sony:WH1000XM5");
    expect(keys).toContain("model:sony:WH1000XM5");
  });
});
