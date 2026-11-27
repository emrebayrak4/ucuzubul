/**
 * Hotel search / detail / home endpoints + pure engine.
 * Requires geo import, guides sync and `pnpm -C packages/database seed:hotels` (demo inventory, prices anchored to the seed date).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints, HotelSearchQuery, type HotelSummary } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { applyFilters, buildFacets, priceDemoRoom, sortHotels, topPickScore, type DemoRoomRow, type HotelCandidate } from "../src/core/hotels/engine";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;

const day = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset)).toISOString().slice(0, 10);
};
const checkin = day(20);
const checkout = day(23);

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
}, 120_000);

afterAll(async () => {
  await app.close();
});

/* ---------------- engine (pure) ---------------- */

const room = (over: Partial<DemoRoomRow> = {}): DemoRoomRow => ({
  id: "r1",
  name: "Room",
  bedConfig: "1 queen bed",
  sizeSqm: 20,
  maxOccupancy: 2,
  amenities: [],
  ratePlans: [
    { code: "nonref", name: "Non-refundable", refundable: false, boardType: "room_only", payLater: false, priceFactor: 0.9 },
    { code: "flex", name: "Free cancellation", refundable: true, boardType: "room_only", payLater: true, priceFactor: 1 },
  ],
  demoRatesFrom: new Date("2027-01-01T00:00:00Z"),
  demoNightlyCents: [10000, 12000, 14000, 16000],
  sortOrder: 0,
  ...over,
});

const cand = (id: string, over: Partial<HotelSummary> = {}, extra: Partial<Omit<HotelCandidate, "summary">> = {}): HotelCandidate => ({
  summary: {
    id,
    name: id,
    stars: 3,
    propertyType: "hotel",
    address: null,
    city: "X",
    region: null,
    country: "US",
    neighborhood: "Center",
    chain: null,
    lat: 10,
    lon: 10,
    distanceKm: 1,
    imageUrl: null,
    amenities: ["wifi"],
    roomSummary: null,
    freeCancellation: false,
    payAtProperty: false,
    breakfastAvailable: false,
    lowestNightlyCents: 10000,
    lowestTotalCents: 30000,
    lowestTaxesCents: 0,
    taxesEstimated: true,
    providerCount: 1,
    currency: "USD",
    source: "demo",
    ...over,
  },
  accessibility: [],
  meals: ["room_only"],
  ...extra,
});

const q = (o: Record<string, string> = {}) => HotelSearchQuery.parse({ city: "Xy", checkin: "2027-01-01", checkout: "2027-01-03", ...o });

describe("hotel engine", () => {
  it("prices a stay from the stored series per rate plan, with estimated taxes", () => {
    const p = priceDemoRoom(room(), "2027-01-02", "2027-01-04", 1, "US");
    expect(p).not.toBeNull();
    const flex = p?.find((x) => x.plan.code === "flex");
    expect(flex?.subtotalCents).toBe(26000);
    expect(flex?.nightlyCents).toBe(13000);
    expect(flex?.taxesCents).toBe(Math.round(26000 * 0.16));
    expect(p?.find((x) => x.plan.code === "nonref")?.subtotalCents).toBe(23400);
    // 2 rooms doubles the subtotal
    expect(priceDemoRoom(room(), "2027-01-02", "2027-01-04", 2, "US")?.[1]?.subtotalCents).toBe(52000);
  });

  it("never extrapolates outside the stored window", () => {
    expect(priceDemoRoom(room(), "2026-12-31", "2027-01-02", 1, "US")).toBeNull();
    expect(priceDemoRoom(room(), "2027-01-03", "2027-01-06", 1, "US")).toBeNull();
  });

  it("filters (OR within stars/types, AND within amenities) and counts facets disjunctively", () => {
    const items = [
      cand("a", { stars: 3, amenities: ["wifi", "pool"] }),
      cand("b", { stars: 4, amenities: ["wifi"], propertyType: "apartment" }),
      cand("c", { stars: 5, amenities: ["wifi", "pool", "spa"], freeCancellation: true }),
    ];
    const f = q({ stars: "3,5", amenities: "pool" });
    expect(applyFilters(items, f).map((c) => c.summary.id)).toEqual(["a", "c"]);
    const facets = buildFacets(items, f, { amenities: f.amenities, accessibility: [] });
    // stars facet ignores the stars filter itself (but keeps the amenity filter): 3★ a, 5★ c
    expect(facets.stars.find((s) => s.value === "4")).toBeUndefined();
    expect(facets.stars.find((s) => s.value === "5")?.count).toBe(1);
    // amenity counts are on the filtered set
    expect(facets.amenities.find((a) => a.value === "spa")?.count).toBe(1);
    expect(facets.freeCancellation).toBe(1);
    expect(facets.price?.buckets.reduce((n, b) => n + b, 0)).toBe(2);
  });

  it("filters by bbox, price, distance and free cancellation", () => {
    const items = [cand("in", { lat: 1, lon: 1, lowestNightlyCents: 8000, distanceKm: 0.5, freeCancellation: true }), cand("out", { lat: 5, lon: 5, lowestNightlyCents: 30000, distanceKm: 8 })];
    expect(applyFilters(items, q({ bbox: "0,0,2,2" })).map((c) => c.summary.id)).toEqual(["in"]);
    expect(applyFilters(items, q({ maxPrice: "10000" })).map((c) => c.summary.id)).toEqual(["in"]);
    expect(applyFilters(items, q({ maxDistanceKm: "3" })).map((c) => c.summary.id)).toEqual(["in"]);
    expect(applyFilters(items, q({ freeCancellation: "1" })).map((c) => c.summary.id)).toEqual(["in"]);
    expect(applyFilters(items, q({ freeCancellation: "false" })).length).toBe(2);
  });

  it("top picks: value per star, unavailable hotels last", () => {
    const cheap3 = cand("cheap3", { stars: 3, lowestTotalCents: 30000 });
    const pricey5 = cand("pricey5", { stars: 5, lowestTotalCents: 36000 });
    const none = cand("none", { lowestNightlyCents: null, lowestTotalCents: null });
    expect(topPickScore(pricey5.summary)).toBeLessThan(topPickScore(cheap3.summary));
    expect(sortHotels([none, cheap3, pricey5], "top_picks").map((c) => c.summary.id)).toEqual(["pricey5", "cheap3", "none"]);
    expect(sortHotels([pricey5, none, cheap3], "price_asc").map((c) => c.summary.id)).toEqual(["cheap3", "pricey5", "none"]);
  });

  it("accepts the legacy sort value", () => {
    expect(q({ sort: "recommended" }).sort).toBe("top_picks");
  });
});

/* ---------------- endpoints ---------------- */

describe("hotel search API", () => {
  it("returns demo inventory with facets, pins and a valid contract", async () => {
    const res = await request(server).get("/v1/travel/hotels/search").query({ city: "Lisbon", checkin, checkout }).expect(200);
    const parsed = endpoints["travel.hotels"].response.safeParse(res.body);
    expect(parsed.success).toBe(true);
    const body = res.body as { items: HotelSummary[]; total: number; pins: unknown[]; facets: { propertyTypes: unknown[]; neighborhoods: { value: string }[] }; source: string; nights: number; guideSlug: string | null };
    expect(body.total).toBeGreaterThanOrEqual(8);
    expect(body.items.every((h) => h.source === "demo" && h.name.startsWith("Demo "))).toBe(true);
    expect(body.pins.length).toBe(body.total);
    expect(body.facets.neighborhoods.length).toBeGreaterThan(0);
    expect(body.source).toBe("demo");
    expect(body.nights).toBe(3);
    expect(body.guideSlug).toBe("lisbon");
    // total for the stay includes estimated taxes
    const h = body.items.find((x) => x.lowestTotalCents !== null);
    expect(h?.taxesEstimated).toBe(true);
    expect(h?.lowestTotalCents).toBeGreaterThan((h?.lowestNightlyCents ?? 0) * 3 - 3);
  });

  it("applies filters consistently with facet counts", async () => {
    const base = await request(server).get("/v1/travel/hotels/search").query({ city: "New York", checkin, checkout }).expect(200);
    const fc = base.body.facets.freeCancellation as number;
    const filtered = await request(server).get("/v1/travel/hotels/search").query({ city: "New York", checkin, checkout, freeCancellation: "1" }).expect(200);
    expect(filtered.body.total).toBe(fc);
    expect((filtered.body.items as HotelSummary[]).every((h) => h.freeCancellation)).toBe(true);

    const hood = (base.body.facets.neighborhoods as { value: string; count: number }[])[0];
    expect(hood).toBeDefined();
    const byHood = await request(server).get("/v1/travel/hotels/search").query({ city: "New York", checkin, checkout, neighborhoods: hood?.value }).expect(200);
    expect(byHood.body.total).toBe(hood?.count);

    const sorted = await request(server).get("/v1/travel/hotels/search").query({ city: "New York", checkin, checkout, sort: "price_asc" }).expect(200);
    const prices = (sorted.body.items as HotelSummary[]).map((h) => h.lowestNightlyCents).filter((p): p is number => p !== null);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const paged = await request(server).get("/v1/travel/hotels/search").query({ city: "New York", checkin, checkout, pageSize: 3, page: 2 }).expect(200);
    expect(paged.body.items.length).toBeLessThanOrEqual(3);
    expect(paged.body.page).toBe(2);
  });

  it("filters by bounding box for the map", async () => {
    const base = await request(server).get("/v1/travel/hotels/search").query({ city: "Rome", checkin, checkout }).expect(200);
    const pin = (base.body.pins as { lat: number; lon: number }[])[0];
    expect(pin).toBeDefined();
    const bbox = `${(pin?.lon ?? 0) - 0.0005},${(pin?.lat ?? 0) - 0.0005},${(pin?.lon ?? 0) + 0.0005},${(pin?.lat ?? 0) + 0.0005}`;
    const res = await request(server).get("/v1/travel/hotels/search").query({ city: "Rome", checkin, checkout, bbox }).expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeLessThan(base.body.total);
  });

  it("rejects invalid queries", async () => {
    await request(server).get("/v1/travel/hotels/search").query({ city: "Rome", checkin, checkout: checkin }).expect(422);
    await request(server).get("/v1/travel/hotels/search").query({ city: "Rome", checkin, checkout, bbox: "nope" }).expect(422);
    await request(server).get("/v1/travel/hotels/search").query({ city: "Rome", checkin, checkout, types: "castle" }).expect(422);
  });

  it("returns nothing for places without inventory (never fabricated)", async () => {
    const res = await request(server).get("/v1/travel/hotels/search").query({ city: "Ulan Bator", checkin, checkout }).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.source).toBe("none");
  });
});

describe("hotel detail API", () => {
  it("returns rooms with rate plans, house rules, nearby places and no reviews for demo", async () => {
    const res = await request(server).get("/v1/travel/hotels/dh_london_01").query({ checkin, checkout, guests: 2 }).expect(200);
    expect(endpoints["travel.hotel"].response.safeParse(res.body).success).toBe(true);
    const b = res.body as {
      hotel: { source: string; houseRules: unknown; faqs: unknown[]; guideSlug: string | null };
      rooms: { ratePlans: { offers: { goUrl: string; provider: { id: string }; taxesEstimated: boolean }[] }[] }[];
      nearby: { kind: string }[];
      reviews: unknown;
      stay: { nights: number };
    };
    expect(b.hotel.source).toBe("demo");
    expect(b.hotel.houseRules).not.toBeNull();
    expect(b.hotel.faqs.length).toBeGreaterThan(0);
    expect(b.hotel.guideSlug).toBe("london");
    expect(b.rooms.length).toBeGreaterThan(0);
    const offers = b.rooms.flatMap((r) => r.ratePlans.flatMap((p) => p.offers));
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.goUrl === "" && o.provider.id === "demo" && o.taxesEstimated)).toBe(true);
    expect(b.nearby.some((n) => n.kind === "airport")).toBe(true);
    expect(b.reviews).toBeNull();
    expect(b.stay.nights).toBe(3);
  });

  it("marks rooms that do not fit the party", async () => {
    const res = await request(server).get("/v1/travel/hotels/dh_london_01").query({ checkin, checkout, guests: 6, rooms: 1 }).expect(200);
    expect((res.body.rooms as { fitsGuests: boolean }[]).some((r) => !r.fitsGuests)).toBe(true);
  });

  it("404s unknown hotels", async () => {
    await request(server).get("/v1/travel/hotels/does-not-exist").expect(404);
  });
});

describe("hotels home API", () => {
  it("lists destinations with inventory", async () => {
    const res = await request(server).get("/v1/travel/hotels/destinations").expect(200);
    expect(endpoints["travel.hotelDestinations"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(60);
    expect((res.body.items as { guideSlug: string | null }[]).filter((d) => d.guideSlug).length).toBeGreaterThanOrEqual(55);
  });

  it("deals follow the stated rule", async () => {
    const res = await request(server).get("/v1/travel/hotels/deals").query({ checkin, checkout }).expect(200);
    expect(endpoints["travel.hotelDeals"].response.safeParse(res.body).success).toBe(true);
    for (const d of res.body.items as { savingsPct: number; typicalNightlyCents: number; lowestNightlyCents: number }[]) {
      expect(d.savingsPct).toBeGreaterThanOrEqual(5);
      expect(d.lowestNightlyCents).toBeLessThan(d.typicalNightlyCents);
    }
  });

  it("seeded demo inventory covers every guide city and is labeled", async () => {
    const guides = await prisma.travelGuide.count({ where: { status: "published" } });
    const cities = await prisma.hotel.groupBy({ by: ["cityId"], where: { source: "demo" } });
    expect(cities.length).toBeGreaterThanOrEqual(guides);
    expect(await prisma.hotel.count({ where: { source: "demo", NOT: { name: { startsWith: "Demo " } } } })).toBe(0);
  });
});
