import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ADAPTER_REGISTRY,
  AmadeusFlightProvider,
  BookingDemandHotelProvider,
  DuffelFlightProvider,
  ExpediaRapidHotelProvider,
  HotelbedsHotelProvider,
  NotSupportedError,
  PendingConfigurationError,
  ProviderDiscontinuedError,
  TravelpayoutsFlightProvider,
  TravelpayoutsHotelProvider,
  allAdapterEnvKeys,
  createAdapter,
  createFlightProviders,
  createHotelProviders,
  createRetailerAdapters,
  distributeOccupancy,
  expediaAuthHeader,
  getAdapterStatuses,
  hotelbedsSignature,
  type HotelSearchParams,
} from "../src/index";
import { fakeClock, fixture, mockFetch } from "./helpers";

const http = { rateLimit: { capacity: 100, refillPerSecond: 100 } };
const flight = { origin: "jfk", destination: "LAX", departDate: "2026-12-10", adults: 1 };
const hotel: HotelSearchParams = { destination: { type: "hotel_ids", ids: ["12345", "67890"] }, checkin: "2026-12-10", checkout: "2026-12-12", adults: 2, rooms: 1 };

describe("pending configuration for travel providers", () => {
  it("flight providers throw PendingConfigurationError without env", async () => {
    for (const p of [new DuffelFlightProvider({ env: {} }), new AmadeusFlightProvider({ env: {} }), new TravelpayoutsFlightProvider({ env: {} })]) {
      expect(p.status()).toBe("pending_configuration");
      await expect(p.searchFlights(flight)).rejects.toBeInstanceOf(PendingConfigurationError);
    }
  });

  it("hotel providers throw PendingConfigurationError without env", async () => {
    for (const p of [new ExpediaRapidHotelProvider({ env: {} }), new BookingDemandHotelProvider({ env: {} }), new HotelbedsHotelProvider({ env: {} })]) {
      expect(p.status()).toBe("pending_configuration");
      await expect(p.searchHotels(hotel)).rejects.toBeInstanceOf(PendingConfigurationError);
    }
  });

  it("Hotellook is reported as discontinued (error), never pending", async () => {
    const p = new TravelpayoutsHotelProvider({ env: {} });
    expect(p.status()).toBe("error");
    await expect(p.searchHotels(hotel)).rejects.toBeInstanceOf(ProviderDiscontinuedError);
    expect((await p.healthCheck()).status).toBe("error");
  });
});

describe("Duffel", () => {
  it("creates an offer request and maps offers/slices/segments", async () => {
    const f = mockFetch([{ match: "api.duffel.com/air/offer_requests", body: fixture("duffel-offer-request.json") }]);
    const p = new DuffelFlightProvider({ env: { DUFFEL_ACCESS_TOKEN: "duffel_test_abc" }, fetch: f, clock: fakeClock(), http });
    const r = await p.searchFlights({ ...flight, returnDate: "2026-12-17", adults: 2, cabin: "business" });
    const call = f.calls[0];
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers["Duffel-Version"]).toBe("v2");
    expect(call?.init.headers.Authorization).toBe("Bearer duffel_test_abc");
    const body = JSON.parse(call?.init.body ?? "{}") as { data: { slices: unknown[]; passengers: unknown[]; cabin_class: string } };
    expect(body.data.slices).toEqual([
      { origin: "JFK", destination: "LAX", departure_date: "2026-12-10" },
      { origin: "LAX", destination: "JFK", departure_date: "2026-12-17" },
    ]);
    expect(body.data.passengers).toHaveLength(2);
    expect(body.data.cabin_class).toBe("business");
    expect(r.data).toHaveLength(1);
    const o = r.data[0];
    expect(o).toMatchObject({ id: "off_0000TEST1", totalCents: 41230, currency: "USD", baseCents: 35000, taxCents: 6230, ownerName: "Duffel Airways", bookable: false });
    expect(o?.slices[0]).toMatchObject({ origin: "JFK", destination: "LAX", stops: 1, durationMinutes: 485, departAt: "2026-12-10T08:00:00", arriveAt: "2026-12-10T13:05:00" });
    expect(o?.slices[0]?.segments[0]).toMatchObject({ marketingCarrier: "ZZ", marketingFlightNumber: "1001", operatingCarrierName: "Duffel Airways", durationMinutes: 165 });
    expect(r.warnings[0]).toContain("test mode");
  });

  it("validates inputs", async () => {
    const p = new DuffelFlightProvider({ env: { DUFFEL_ACCESS_TOKEN: "x" } });
    await expect(p.searchFlights({ ...flight, origin: "NEWYORK" })).rejects.toBeInstanceOf(RangeError);
    await expect(p.searchFlights({ ...flight, departDate: "12/10/2026" })).rejects.toBeInstanceOf(RangeError);
    await expect(p.searchFlights({ ...flight, adults: 0 })).rejects.toBeInstanceOf(RangeError);
  });
});

describe("Amadeus (Enterprise only)", () => {
  it("refuses decommissioned Self-Service base URLs", async () => {
    const p = new AmadeusFlightProvider({ env: { AMADEUS_CLIENT_ID: "a", AMADEUS_CLIENT_SECRET: "b", AMADEUS_BASE_URL: "https://test.api.amadeus.com" }, fetch: mockFetch([]) });
    await expect(p.searchFlights(flight)).rejects.toBeInstanceOf(ProviderDiscontinuedError);
  });

  it("maps flight-offers with the carriers dictionary", async () => {
    const f = mockFetch([
      { match: "/v1/security/oauth2/token", body: { access_token: "atok", expires_in: 1799 } },
      { match: "/v2/shopping/flight-offers", body: fixture("amadeus-flight-offers.json") },
    ]);
    const p = new AmadeusFlightProvider({ env: { AMADEUS_CLIENT_ID: "a", AMADEUS_CLIENT_SECRET: "b", AMADEUS_BASE_URL: "https://enterprise.example" }, fetch: f, clock: fakeClock(), http });
    const r = await p.searchFlights({ ...flight, maxConnections: 0 });
    const url = new URL(f.calls[1]?.url ?? "");
    expect(url.searchParams.get("originLocationCode")).toBe("JFK");
    expect(url.searchParams.get("nonStop")).toBe("true");
    expect(r.data[0]).toMatchObject({ totalCents: 30120, currency: "USD", ownerCode: "XX", ownerName: "TEST AIRLINE" });
    expect(r.data[0]?.slices[0]).toMatchObject({ stops: 0, durationMinutes: 370 });
  });
});

describe("Travelpayouts (cached affiliate fares)", () => {
  it("maps prices_for_dates and adds the marker", async () => {
    const f = mockFetch([{ match: "/aviasales/v3/prices_for_dates", body: fixture("travelpayouts-prices.json") }]);
    const p = new TravelpayoutsFlightProvider({ env: { TRAVELPAYOUTS_TOKEN: "tok", TRAVELPAYOUTS_MARKER: "12345" }, fetch: f, clock: fakeClock(), http });
    const r = await p.searchFlights({ ...flight, returnDate: "2026-12-17" });
    expect(f.calls[0]?.init.headers["X-Access-Token"]).toBe("tok");
    expect(new URL(f.calls[0]?.url ?? "").searchParams.get("one_way")).toBe("false");
    const o = r.data[0];
    expect(o).toMatchObject({ totalCents: 18700, currency: "USD", bookable: false, cached: true, source: "affiliate", ownerCode: "XX" });
    expect(o?.slices).toHaveLength(2);
    expect(o?.slices[0]).toMatchObject({ origin: "JFK", destination: "LAX", stops: 0, durationMinutes: 360 });
    expect(o?.slices[1]).toMatchObject({ stops: 1 });
    expect(o?.deepLink).toMatch(/^https:\/\/www\.aviasales\.com\/search\/NYC1012LAX17121\?t=.*&marker=12345$/);
    expect(r.freshness.cached).toBe(true);
  });
});

describe("Expedia Rapid", () => {
  it("signs requests (sha512) and picks the cheapest rate per property", async () => {
    const clock = fakeClock(1_765_000_000_000);
    const f = mockFetch([{ match: "test.ean.com/v3/properties/availability", body: fixture("expedia-availability.json") }]);
    const p = new ExpediaRapidHotelProvider({ env: { EXPEDIA_RAPID_API_KEY: "key", EXPEDIA_RAPID_SECRET: "sec" }, fetch: f, clock, http });
    const r = await p.searchHotels({ ...hotel, childrenAges: [7] });
    const ts = 1_765_000_000;
    const expected = createHash("sha512").update(`keysec${ts}`).digest("hex");
    expect(f.calls[0]?.init.headers.Authorization).toBe(`EAN APIKey=key,Signature=${expected},timestamp=${ts}`);
    const url = new URL(f.calls[0]?.url ?? "");
    expect(url.searchParams.getAll("property_id")).toEqual(["12345", "67890"]);
    expect(url.searchParams.getAll("occupancy")).toEqual(["2-7"]);
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ hotelId: "12345", totalCents: 39900, refundable: false, priceBasis: "retail", bookable: true, roomName: "Standard King" });
  });

  it("rejects city search (needs property ids)", async () => {
    const p = new ExpediaRapidHotelProvider({ env: { EXPEDIA_RAPID_API_KEY: "k", EXPEDIA_RAPID_SECRET: "s" } });
    await expect(p.searchHotels({ ...hotel, destination: { type: "city", value: "NYC" } })).rejects.toBeInstanceOf(NotSupportedError);
    expect(expediaAuthHeader("a", "b", 1)).toBe(`EAN APIKey=a,Signature=${createHash("sha512").update("ab1").digest("hex")},timestamp=1`);
  });
});

describe("Booking.com Demand API", () => {
  it("posts accommodations/search with affiliate headers and maps deep links", async () => {
    const f = mockFetch([{ match: "/accommodations/search", body: fixture("booking-search.json") }]);
    const p = new BookingDemandHotelProvider({ env: { BOOKING_API_KEY: "bk", BOOKING_AFFILIATE_ID: "0000000" }, fetch: f, clock: fakeClock(), http });
    const r = await p.searchHotels({ ...hotel, destination: { type: "city", value: "-2601889" } });
    expect(f.calls[0]?.url).toBe("https://demandapi-sandbox.booking.com/3.1/accommodations/search");
    expect(f.calls[0]?.init.headers["X-Affiliate-Id"]).toBe("0000000");
    expect(JSON.parse(f.calls[0]?.init.body ?? "{}")).toMatchObject({ city: -2601889, guests: { number_of_adults: 2, number_of_rooms: 1 }, booker: { country: "us", platform: "desktop" } });
    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({ hotelId: "10001", totalCents: 54890, source: "affiliate", bookable: false, deepLink: "booking://hotel/10001?affiliate_id=0000000" });
    await expect(p.searchHotels({ ...hotel, destination: { type: "city", value: "New York" } })).rejects.toBeInstanceOf(NotSupportedError);
  });
});

describe("Hotelbeds", () => {
  it("signs with sha256 and respects hotelMandatory selling rates", async () => {
    const clock = fakeClock(1_765_000_000_000);
    const f = mockFetch([{ match: "api.test.hotelbeds.com/hotel-api/1.0/hotels", body: fixture("hotelbeds-hotels.json") }]);
    const p = new HotelbedsHotelProvider({ env: { HOTELBEDS_API_KEY: "hk", HOTELBEDS_SECRET: "hs" }, fetch: f, clock, http });
    const r = await p.searchHotels({ ...hotel, destination: { type: "city", value: "nyc" }, rooms: 2, adults: 3 });
    expect(f.calls[0]?.init.headers["X-Signature"]).toBe(createHash("sha256").update("hkhs1765000000").digest("hex"));
    const body = JSON.parse(f.calls[0]?.init.body ?? "{}") as { destination: unknown; occupancies: unknown[] };
    expect(body.destination).toEqual({ code: "NYC" });
    expect(body.occupancies).toEqual([{ rooms: 1, adults: 2, children: 0 }, { rooms: 1, adults: 1, children: 0 }]);
    // NRF net 310.50 vs mandatory selling 360.00 (net 280) -> cheapest effective = 310.50 net
    expect(r.data[0]).toMatchObject({ hotelId: "3424", name: "TEST HOTEL MIDTOWN", starRating: 4, totalCents: 31050, priceBasis: "net", refundable: false, boardName: "ROOM ONLY" });
    expect(hotelbedsSignature("a", "b", 1)).toBe(createHash("sha256").update("ab1").digest("hex"));
  });

  it("validates dates and occupancy", async () => {
    const p = new HotelbedsHotelProvider({ env: { HOTELBEDS_API_KEY: "hk", HOTELBEDS_SECRET: "hs" } });
    await expect(p.searchHotels({ ...hotel, checkout: "2026-12-10" })).rejects.toBeInstanceOf(RangeError);
    await expect(p.searchHotels({ ...hotel, adults: 1, rooms: 2 })).rejects.toBeInstanceOf(RangeError);
    expect(distributeOccupancy(5, 2, [4, 9, 11])).toEqual([{ adults: 3, childrenAges: [4, 11] }, { adults: 2, childrenAges: [9] }]);
  });
});

describe("registry", () => {
  it("covers all requested retailers and travel providers with metadata", () => {
    const ids = ADAPTER_REGISTRY.map((m) => m.id);
    for (const id of [
      "amazon", "walmart", "bestbuy", "ebay", "target", "costco", "homedepot", "lowes", "newegg", "bhphoto", "adorama", "macys", "kohls",
      "wayfair", "staples", "officedepot", "walgreens", "cvs", "kroger", "gamestop", "samsclub", "chewy",
      "duffel", "amadeus", "travelpayouts", "travelpayouts_hotels", "expedia_rapid", "booking", "hotelbeds", "merchant_feed",
    ]) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of ADAPTER_REGISTRY) {
      expect(m.docsUrl).toMatch(/^https:\/\//);
      const a = m.create({ env: {} });
      expect(a.id).toBe(m.id);
      expect(a.kind).toBe(m.kind);
      expect([...a.requiredEnv]).toEqual([...m.requiredEnv]);
    }
  });

  it("reports statuses without network calls", () => {
    const statuses = getAdapterStatuses({ BESTBUY_API_KEY: "k", BESTBUY_LEGAL_APPROVED: "true" });
    expect(statuses.find((s) => s.id === "bestbuy")?.status).toBe("live");
    expect(getAdapterStatuses({ BESTBUY_API_KEY: "k" }).find((s) => s.id === "bestbuy")).toMatchObject({ status: "pending_configuration", missingEnv: ["BESTBUY_LEGAL_APPROVED"] });
    expect(statuses.find((s) => s.id === "amazon")).toMatchObject({ status: "pending_configuration", goLive: "affiliate_approval" });
    expect(statuses.find((s) => s.id === "travelpayouts_hotels")?.status).toBe("error");
    expect(statuses.find((s) => s.id === "merchant_feed")?.status).toBe("live");
  });

  it("factory helpers and env key listing", () => {
    expect(createRetailerAdapters({ env: {} }).every((a) => a.kind === "retailer")).toBe(true);
    expect(createFlightProviders({ env: {} }).map((p) => p.id)).toEqual(["duffel", "amadeus", "travelpayouts"]);
    expect(createHotelProviders({ env: {} }).map((p) => p.id)).toEqual(["travelpayouts_hotels", "expedia_rapid", "booking", "hotelbeds"]);
    expect(allAdapterEnvKeys()).toContain("DUFFEL_ACCESS_TOKEN");
    expect(() => createAdapter("nope")).toThrow();
  });
});
