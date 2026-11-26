import { describe, expect, it } from "vitest";
import {
  STATE_BASE_TAX_RATES_MILLI,
  computeOfferTotal,
  estimateTaxCents,
  formatUsd,
  normalizeZip,
  optimizeBasket,
  zipToState,
  type BasketItem,
  type BasketOffer,
  type RetailerPolicy,
} from "../src/index";

describe("ZIP -> state", () => {
  it.each([
    ["10001", "NY"], ["90210", "CA"], ["60601", "IL"], ["77001", "TX"], ["73301", "TX"], ["33101", "FL"],
    ["02108", "MA"], ["20500", "DC"], ["20147", "VA"], ["99501", "AK"], ["96813", "HI"], ["98101", "WA"],
    ["97201", "OR"], ["84101", "UT"], ["03101", "NH"], ["19901", "DE"], ["57501", "SD"], ["88901", "NV"],
    ["88510", "TX"], ["30301", "GA"], ["39901", "GA"], ["70112", "LA"], ["72201", "AR"], ["59601", "MT"],
  ])("%s -> %s", (zip, state) => {
    expect(zipToState(zip)).toBe(state);
  });

  it("returns null for territories, military, invalid", () => {
    expect(zipToState("00901")).toBeNull(); // PR
    expect(zipToState("09001")).toBeNull(); // AE
    expect(zipToState("34001")).toBeNull(); // AA
    expect(zipToState("96201")).toBeNull(); // AP
    expect(zipToState("96910")).toBeNull(); // GU
    expect(zipToState("1234")).toBeNull();
    expect(zipToState(null)).toBeNull();
  });

  it("normalizes ZIP+4", () => {
    expect(normalizeZip("10001-1234")).toBe("10001");
    expect(normalizeZip(" 100011234 ")).toBe("10001");
    expect(normalizeZip("ABCDE")).toBeNull();
  });

  it("has a rate for all 50 states + DC", () => {
    expect(Object.keys(STATE_BASE_TAX_RATES_MILLI)).toHaveLength(51);
  });
});

describe("computeOfferTotal", () => {
  it("adds price, shipping and estimated state tax", () => {
    const t = computeOfferTotal({ priceCents: 10000, shippingCents: 599, zip: "90210" });
    expect(t.taxCents).toBe(725);
    expect(t.totalCents).toBe(10000 + 599 + 725);
    expect(t.estimated).toBe(true);
    expect(t.incomplete).toBe(false);
    expect(t.state).toBe("CA");
    expect(t.taxRatePct).toBe(7.25);
  });

  it("no-tax states", () => {
    const t = computeOfferTotal({ priceCents: 10000, shippingCents: 0, zip: "97201" });
    expect(t.taxCents).toBe(0);
    expect(t.totalCents).toBe(10000);
  });

  it("unknown ZIP -> tax null, incomplete", () => {
    const t = computeOfferTotal({ priceCents: 10000, shippingCents: 0, zip: "00901" });
    expect(t.taxCents).toBeNull();
    expect(t.incomplete).toBe(true);
    expect(t.totalCents).toBe(10000);
  });

  it("unknown shipping -> incomplete; quantity multiplies", () => {
    const t = computeOfferTotal({ priceCents: 1999, quantity: 3, zip: "10001" });
    expect(t.itemsCents).toBe(5997);
    expect(t.shippingCents).toBeNull();
    expect(t.incomplete).toBe(true);
    expect(t.taxCents).toBe(240); // 4% of 59.97
  });

  it("optionally taxes shipping; rejects floats", () => {
    expect(computeOfferTotal({ priceCents: 10000, shippingCents: 1000, zip: "10001", taxShipping: true }).taxCents).toBe(440);
    expect(() => computeOfferTotal({ priceCents: 10.5 })).toThrow(RangeError);
    expect(estimateTaxCents(999, 6875)).toBe(69);
    expect(formatUsd(129999)).toBe("$1,299.99");
  });
});

describe("optimizeBasket", () => {
  const items: BasketItem[] = [
    { itemId: "tv", quantity: 1 },
    { itemId: "hdmi", quantity: 2 },
    { itemId: "mount", quantity: 1 },
  ];
  const offers: BasketOffer[] = [
    { itemId: "tv", retailerId: "A", priceCents: 50000 },
    { itemId: "tv", retailerId: "B", priceCents: 49000 },
    { itemId: "tv", retailerId: "C", priceCents: 52000 },
    { itemId: "hdmi", retailerId: "A", priceCents: 1500 },
    { itemId: "hdmi", retailerId: "B", priceCents: 1800 },
    { itemId: "hdmi", retailerId: "C", priceCents: 900 },
    { itemId: "mount", retailerId: "A", priceCents: 4000 },
    { itemId: "mount", retailerId: "C", priceCents: 3000 },
  ];
  const policies: RetailerPolicy[] = [
    { retailerId: "A", shippingCents: 0 },
    { retailerId: "B", shippingCents: 2500, freeShippingThresholdCents: 100000, freeShippingMemberships: ["b_plus"] },
    { retailerId: "C", shippingCents: 799, freeShippingThresholdCents: 3500, pickupAvailable: true },
  ];

  it("produces three scenarios with savings and assumptions", () => {
    const r = optimizeBasket(items, offers, policies);
    // B lacks the mount; A = 50000+3000+4000 = 57000; C = 52000+1800+3000 = 56800 (free shipping over $35)
    expect(r.cheapestSingleStore?.stores.map((s) => s.retailerId)).toEqual(["C"]);
    expect(r.cheapestSingleStore?.totalCents).toBe(52000 + 1800 + 3000);
    // naive: tv@B (49000 + 2500 ship), hdmi@C 1800, mount@C 3000 (C subtotal 4800 >= 3500 free)
    expect(r.naiveTotalCents).toBe(49000 + 2500 + 1800 + 3000);
    // best: tv@A 50000 (free ship), hdmi@C, mount@C (free over threshold)
    expect(r.cheapestOverall?.totalCents).toBe(50000 + 1800 + 3000);
    expect(r.cheapestOverall?.method).toBe("exact");
    expect(r.cheapestOverall?.savingsVsNaiveCents).toBe(1500);
    expect(r.bestWithinMaxStores?.storeCount).toBeLessThanOrEqual(2);
    expect(r.assumptions.some((a) => a.includes("exclude sales tax"))).toBe(true);
  });

  it("applies memberships", () => {
    const r = optimizeBasket(items, offers, policies, { memberships: ["b_plus"] });
    // tv@B 49000 free shipping with membership + C items
    expect(r.cheapestOverall?.totalCents).toBe(49000 + 1800 + 3000);
    const b = r.cheapestOverall?.stores.find((s) => s.retailerId === "B");
    expect(b?.freeShippingReason).toBe("membership");
  });

  it("uses pickup when allowed and every line is pickup-eligible", () => {
    const r = optimizeBasket(
      [{ itemId: "hdmi", quantity: 1 }],
      [{ itemId: "hdmi", retailerId: "C", priceCents: 900, pickupAvailable: true }],
      policies,
      { allowPickup: true },
    );
    expect(r.cheapestOverall?.stores[0]?.fulfillment).toBe("pickup");
    expect(r.cheapestOverall?.totalCents).toBe(900);
  });

  it("respects maxStores = 1", () => {
    const r = optimizeBasket(items, offers, policies, { maxStores: 1 });
    expect(r.bestWithinMaxStores?.storeCount).toBe(1);
    expect(r.bestWithinMaxStores?.totalCents).toBe(r.cheapestSingleStore?.totalCents);
  });

  it("reports unfulfilled items and unknown shipping", () => {
    const r = optimizeBasket(
      [{ itemId: "x", quantity: 1 }, { itemId: "y", quantity: 1 }],
      [{ itemId: "x", retailerId: "Z", priceCents: 100 }, { itemId: "y", retailerId: "Z", priceCents: 100, inStock: false }],
    );
    expect(r.unfulfilledItemIds).toEqual(["y"]);
    expect(r.assumptions.some((a) => a.includes("unknown for Z"))).toBe(true);
  });

  it("empty basket", () => {
    const r = optimizeBasket([], []);
    expect(r.cheapestOverall).toBeNull();
    expect(r.naiveTotalCents).toBeNull();
  });

  it("rejects invalid quantities", () => {
    expect(() => optimizeBasket([{ itemId: "a", quantity: 0 }], [])).toThrow(RangeError);
  });

  it("exact search matches brute force on random small instances", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 25; trial++) {
      const stores = ["s1", "s2", "s3", "s4"];
      const its: BasketItem[] = Array.from({ length: 5 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 + Math.floor(rand() * 2) }));
      const offs: BasketOffer[] = [];
      for (const it of its) for (const s of stores) if (rand() < 0.75) offs.push({ itemId: it.itemId, retailerId: s, priceCents: 500 + Math.floor(rand() * 5000) });
      const pols: RetailerPolicy[] = stores.map((s) => ({ retailerId: s, shippingCents: Math.floor(rand() * 1500), freeShippingThresholdCents: 3000 + Math.floor(rand() * 8000) }));
      const r = optimizeBasket(its, offs, pols);
      const brute = bruteForce(its, offs, pols);
      expect(r.cheapestOverall?.totalCents ?? null).toBe(brute);
    }
  });

  it("large baskets use the heuristic and never beat the brute-force-free lower bound", () => {
    const stores = Array.from({ length: 8 }, (_, i) => `s${i}`);
    const its: BasketItem[] = Array.from({ length: 20 }, (_, i) => ({ itemId: `i${i}`, quantity: 1 }));
    const offs: BasketOffer[] = [];
    its.forEach((it, i) => stores.forEach((s, j) => offs.push({ itemId: it.itemId, retailerId: s, priceCents: 1000 + ((i * 7 + j * 13) % 17) * 100 })));
    const pols = stores.map((s) => ({ retailerId: s, shippingCents: 599, freeShippingThresholdCents: 5000 }));
    const r = optimizeBasket(its, offs, pols);
    expect(r.cheapestOverall?.method).toBe("heuristic");
    const lower = its.reduce((sum, it) => sum + Math.min(...offs.filter((o) => o.itemId === it.itemId).map((o) => o.priceCents)), 0);
    expect(r.cheapestOverall!.totalCents).toBeGreaterThanOrEqual(lower);
    expect(r.cheapestOverall!.totalCents).toBeLessThanOrEqual(r.naiveTotalCents!);
    expect(r.bestWithinMaxStores!.storeCount).toBeLessThanOrEqual(2);
    expect(r.assumptions.some((a) => a.includes("greedy + local search"))).toBe(true);
  });
});

function bruteForce(allItems: BasketItem[], offers: BasketOffer[], policies: RetailerPolicy[]): number | null {
  const items = allItems.filter((it) => offers.some((o) => o.itemId === it.itemId));
  const per = items.map((it) => offers.filter((o) => o.itemId === it.itemId));
  if (per.some((p) => p.length === 0)) return null;
  let best = Infinity;
  const rec = (i: number, chosen: BasketOffer[]) => {
    if (i === items.length) {
      const sub = new Map<string, number>();
      chosen.forEach((o, k) => sub.set(o.retailerId, (sub.get(o.retailerId) ?? 0) + o.priceCents * (items[k] as BasketItem).quantity));
      let total = 0;
      for (const [r, s] of sub) {
        const p = policies.find((x) => x.retailerId === r);
        total += s + (p?.freeShippingThresholdCents != null && s >= p.freeShippingThresholdCents ? 0 : p?.shippingCents ?? 0);
      }
      best = Math.min(best, total);
      return;
    }
    for (const o of per[i] as BasketOffer[]) rec(i + 1, [...chosen, o]);
  };
  rec(0, []);
  return best;
}
