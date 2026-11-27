/**
 * Flights: labeled demo fare engine, filters/facets/sort, calendar, explore, fare alerts, live-provider override.
 * Requires the imported places data (`pnpm -C packages/database geo:import`).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints, type FlightOffer, type FlightSearchResponse } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { evaluateFlightAlerts, FlightFareService } from "../src/core/flights";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const D = day(45);
const R = day(52);
const total = (o: FlightOffer) => o.slices.reduce((n, s) => n + s.durationMinutes, 0);
const search = async (q: Record<string, string | number>) => {
  const res = await request(server).get("/v1/travel/flights/search").query(q).expect(200);
  const parsed = endpoints["travel.flights"].response.safeParse(res.body);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
  return res.body as FlightSearchResponse;
};

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
}, 120_000);

afterAll(async () => {
  await app.close();
});

describe("demo fares (no live provider configured)", () => {
  it("returns labeled, non-bookable demo itineraries with honest provider statuses", async () => {
    const r = await search({ from: "JFK", to: "LHR", depart: D, limit: 100 });
    expect(r.source).toBe("demo");
    expect(r.offers.length).toBeGreaterThan(5);
    expect(r.providers.find((p) => p.id === "demo")?.message).toMatch(/Demo fares — not bookable/);
    expect(r.providers.filter((p) => p.id !== "demo").every((p) => p.status !== "live")).toBe(true);
    for (const o of r.offers) {
      expect(o.source).toBe("demo");
      expect(o.bookable).toBe(false);
      expect(o.goUrl).toBe("");
      expect(o.provider.id).toBe("demo");
      expect(o.fareOptions?.length).toBeGreaterThan(0);
    }
    // Real carriers that fly the market nonstop, plausible duration (≈7 h eastbound).
    const nonstop = r.offers.filter((o) => o.slices[0]!.stops === 0);
    expect(new Set(nonstop.map((o) => o.slices[0]!.segments[0]!.marketingCarrier.iata))).toEqual(new Set(["BA", "AA", "VS", "DL", "B6"]));
    for (const o of nonstop) expect(o.slices[0]!.durationMinutes).toBeGreaterThan(380);
    for (const o of nonstop) expect(o.slices[0]!.durationMinutes).toBeLessThan(480);
    // Local times carry the airport's UTC offset.
    expect(nonstop[0]!.slices[0]!.departAt).toMatch(/-0[45]:00$/);
    expect(nonstop[0]!.slices[0]!.arriveAt).toMatch(/\+0[01]:00$/);
  });

  it("is deterministic for the same query", async () => {
    const a = await search({ from: "LAX", to: "HND", depart: D });
    const b = await search({ from: "LAX", to: "HND", depart: D });
    expect(a.offers.map((o) => [o.id, o.totalPriceCents])).toEqual(b.offers.map((o) => [o.id, o.totalPriceCents]));
  });

  it("builds connections through real hubs with layover details", async () => {
    const r = await search({ from: "BZN", to: "BJV", depart: D, limit: 20 });
    expect(r.offers.length).toBeGreaterThan(0);
    for (const o of r.offers) {
      const s = o.slices[0]!;
      expect(s.stops).toBeGreaterThan(0);
      expect(s.layovers).toHaveLength(s.stops);
      for (const l of s.layovers ?? []) expect(l.durationMinutes).toBeGreaterThanOrEqual(45);
      for (let i = 1; i < s.segments.length; i++) expect(Date.parse(s.segments[i]!.departAt)).toBeGreaterThan(Date.parse(s.segments[i - 1]!.arriveAt));
    }
  });

  it("filters, keeps disjunctive facet counts and sorts", async () => {
    const all = await search({ from: "BOS", to: "DEN", depart: D, limit: 200 });
    const nonstopCount = all.facets!.stops.find((s) => s.value === 0)!.count;
    expect(nonstopCount).toBeGreaterThan(0);
    const ns = await search({ from: "BOS", to: "DEN", depart: D, stops: "0", limit: 200 });
    expect(ns.total).toBe(nonstopCount);
    expect(ns.offers.every((o) => o.slices.every((s) => s.stops === 0))).toBe(true);
    // The stops facet ignores its own filter.
    expect(ns.facets!.stops.map((s) => s.count)).toEqual(all.facets!.stops.map((s) => s.count));

    const airline = all.facets!.airlines[0]!.iata;
    const only = await search({ from: "BOS", to: "DEN", depart: D, airlines: airline, limit: 200 });
    expect(only.offers.every((o) => o.slices.every((s) => s.segments.every((g) => g.marketingCarrier.iata === airline)))).toBe(true);

    const cheap = await search({ from: "BOS", to: "DEN", depart: D, sort: "cheapest", limit: 200 });
    const prices = cheap.offers.map((o) => o.pricePerAdultCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(cheap.sortSummary!.cheapest!.pricePerAdultCents).toBe(prices[0]);
    const fast = await search({ from: "BOS", to: "DEN", depart: D, sort: "fastest", limit: 200 });
    const durs = fast.offers.map(total);
    expect(durs).toEqual([...durs].sort((a, b) => a - b));
    expect(all.bestRule).toMatch(/60% price/);

    const morning = await search({ from: "BOS", to: "DEN", depart: D, dep: "360-720", limit: 200 });
    expect(morning.offers.every((o) => Number(o.slices[0]!.departAt.slice(11, 13)) >= 6 && Number(o.slices[0]!.departAt.slice(11, 13)) <= 12)).toBe(true);
  });

  it("bag filter re-prices to the cheapest fare that includes a checked bag", async () => {
    const base = await search({ from: "FLL", to: "LGA", depart: D, sort: "cheapest", limit: 200 });
    const bags = await search({ from: "FLL", to: "LGA", depart: D, sort: "cheapest", bags: "checked", limit: 200 });
    expect(bags.offers.length).toBeGreaterThan(0);
    for (const o of bags.offers) expect(o.baggage?.checked ?? 0).toBeGreaterThanOrEqual(1);
    expect(bags.offers[0]!.pricePerAdultCents).toBeGreaterThanOrEqual(base.offers[0]!.pricePerAdultCents);
  });

  it("round trips, multi-city and party pricing", async () => {
    const rt = await search({ from: "NYC", to: "LON", depart: D, return: R, adults: 2, children: 1 });
    expect(rt.query.fromAirports).toEqual(expect.arrayContaining(["JFK", "LGA", "EWR"]));
    expect(rt.query.tripType).toBe("round");
    for (const o of rt.offers) {
      expect(o.slices).toHaveLength(2);
      expect(o.totalPriceCents).toBe(o.pricePerAdultCents * 2 + Math.round((o.pricePerAdultCents * 0.75) / 100) * 100);
    }
    const mc = await search({ legs: `JFK:LHR:${D},LHR:CDG:${day(49)},CDG:JFK:${R}` });
    expect(mc.query.tripType).toBe("multi");
    expect(mc.offers.length).toBeGreaterThan(0);
    for (const o of mc.offers) expect(o.slices.map((s) => s.to)).toEqual(["LHR", "CDG", "JFK"]);
    await request(server).get("/v1/travel/flights/search").query({ legs: `JFK:LHR:${R},LHR:CDG:${D}` }).expect(422);
  });

  it("no fares for past dates or beyond the booking horizon", async () => {
    const past = await search({ from: "JFK", to: "LAX", depart: day(-3) });
    expect(past.offers).toHaveLength(0);
    const far = await search({ from: "JFK", to: "LAX", depart: day(360) });
    expect(far.offers).toHaveLength(0);
  });
});

describe("calendar & explore", () => {
  it("round-trip ±3 grid matches the search's cheapest fare; one-way month + trend", async () => {
    const cal = await request(server).get("/v1/travel/flights/calendar").query({ from: "JFK", to: "LHR", depart: D, return: R }).expect(200);
    expect(endpoints["travel.flightCalendar"].response.safeParse(cal.body).success).toBe(true);
    expect(cal.body.source).toBe("demo");
    expect(cal.body.grid).toHaveLength(49);
    expect(cal.body.trend).toHaveLength(43);
    const centre = (cal.body.grid as Array<{ depart: string; return: string; minPriceCents: number | null }>).find((g) => g.depart === D && g.return === R)!;
    const s = await search({ from: "JFK", to: "LHR", depart: D, return: R, sort: "cheapest", limit: 1 });
    expect(centre.minPriceCents).toBe(s.offers[0]!.pricePerAdultCents);

    const ow = await request(server).get("/v1/travel/flights/calendar").query({ from: "SAW", to: "AYT", depart: D }).expect(200);
    expect(ow.body.tripType).toBe("oneway");
    expect(ow.body.days.length).toBeGreaterThanOrEqual(28);
  });

  it("explore lists cheapest destinations with filters", async () => {
    const res = await request(server).get("/v1/travel/flights/explore").query({ from: "IST", tripLength: 5 }).expect(200);
    expect(endpoints["travel.flightExplore"].response.safeParse(res.body).success).toBe(true);
    const items = res.body.destinations as Array<{ minPriceCents: number; direct: boolean; countryIso2: string }>;
    expect(items.length).toBeGreaterThan(30);
    expect(items.map((d) => d.minPriceCents)).toEqual([...items.map((d) => d.minPriceCents)].sort((a, b) => a - b));
    const capped = await request(server).get("/v1/travel/flights/explore").query({ from: "IST", maxPrice: 150, direct: 1 }).expect(200);
    for (const d of capped.body.destinations as typeof items) {
      expect(d.minPriceCents).toBeLessThanOrEqual(15_000);
      expect(d.direct).toBe(true);
    }
  });
});

describe("live provider configured", () => {
  it("hides demo fares everywhere once a live flight provider exists", async () => {
    const failingFetch = (async () => new Response(JSON.stringify({ errors: [{ message: "unauthorized" }] }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch;
    const fares = new FlightFareService(prisma, async () => ({ ...process.env, DUFFEL_ACCESS_TOKEN: "test_token" }), { fetch: failingFetch });
    const q = endpoints["travel.flights"].query.parse({ from: "JFK", to: "LHR", depart: D });
    const r = await fares.search(q);
    expect(r.offers.some((o) => o.source === "demo")).toBe(false);
    expect(r.providers.find((p) => p.id === "demo")).toBeUndefined();
    expect(r.providers.find((p) => p.id === "duffel")?.status).toMatch(/live|error/);
    const cal = await fares.calendar(endpoints["travel.flightCalendar"].query.parse({ from: "JFK", to: "LHR", depart: D }));
    expect(cal.source).toBe("none");
    const ex = await fares.explore(endpoints["travel.flightExplore"].query.parse({ from: "JFK" }));
    expect(ex.destinations).toHaveLength(0);
  });
});

describe("fare alerts", () => {
  it("track → list → worker notifies once (dedupe + cooldown) → delete", async () => {
    const agent = request.agent(server);
    const me0 = await agent.get("/v1/auth/me").expect(200);
    const email = `flights-${Date.now()}@example.test`;
    const reg = await agent.post("/v1/auth/register").set("x-csrf-token", me0.body.csrfToken).send({ email, password: "correct-horse-battery-9", name: "Fare Alert" }).expect(201);
    const csrf: string = reg.body.csrfToken;

    await request(server).post("/v1/travel/flights/alerts").send({ from: "JFK", to: "LAX", depart: D }).expect(401);
    const created = await agent.post("/v1/travel/flights/alerts").set("x-csrf-token", csrf).send({ from: "JFK", to: "LAX", depart: D }).expect(201);
    expect(endpoints["travel.flightAlerts.create"].response.safeParse(created.body).success).toBe(true);
    expect(created.body.targetPriceCents).toBeGreaterThan(0);
    const again = await agent.post("/v1/travel/flights/alerts").set("x-csrf-token", csrf).send({ from: "JFK", to: "LAX", depart: D }).expect(201);
    expect(again.body.id).toBe(created.body.id);
    const list = await agent.get("/v1/travel/flights/alerts").query({ from: "JFK", to: "LAX" }).expect(200);
    expect(list.body.items).toHaveLength(1);

    // Target above the current fare → the worker job fires exactly once.
    await prisma.travelAlert.update({ where: { id: created.body.id }, data: { targetPriceCents: 999_999 } });
    const fares = new FlightFareService(prisma, async () => ({}));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const otherAlerts = await prisma.travelAlert.findMany({ where: { kind: "flight", active: true, NOT: { userId: user.id } }, select: { id: true } });
    await prisma.travelAlert.updateMany({ where: { id: { in: otherAlerts.map((a) => a.id) } }, data: { active: false } });
    try {
      const run1 = await evaluateFlightAlerts(prisma, fares);
      expect(run1.notified).toBe(1);
      const run2 = await evaluateFlightAlerts(prisma, fares);
      expect(run2.notified).toBe(0);
      expect(run2.skippedCooldown).toBe(1);
      const notes = await prisma.notification.findMany({ where: { userId: user.id, type: "travel_alert.flight" } });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.body).toMatch(/Demo fare — not bookable/);
      expect(notes[0]!.url).toContain("/travel/flights/search?from=JFK&to=LAX");
    } finally {
      await prisma.travelAlert.updateMany({ where: { id: { in: otherAlerts.map((a) => a.id) } }, data: { active: true } });
    }

    await agent.delete(`/v1/travel/flights/alerts/${created.body.id}`).set("x-csrf-token", csrf).expect(200);
    await agent.delete(`/v1/travel/flights/alerts/${created.body.id}`).set("x-csrf-token", csrf).expect(404);
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("airport → served city (geo import)", () => {
  it("links suburban airports to the city they serve, keeping the municipality as an alias", async () => {
    const expected: Record<string, string> = { ADB: "İzmir", SAW: "Istanbul", BGY: "Milan", MXP: "Milan", EWR: "New York City", DCA: "Washington", OAK: "Oakland", LGW: "London", STN: "London", ATH: "Athens", SYD: "Sydney", CGN: "Köln", BJV: "Bodrum" };
    const rows = await prisma.airport.findMany({ where: { iata: { in: Object.keys(expected) } }, select: { iata: true, city: true, cityId: true } });
    const cities = new Map((await prisma.city.findMany({ where: { geonameId: { in: rows.map((r) => r.cityId).filter((x): x is number => x !== null) } }, select: { geonameId: true, name: true } })).map((c) => [c.geonameId, c.name]));
    for (const r of rows) expect([r.iata, r.cityId ? cities.get(r.cityId) : null]).toEqual([r.iata, expected[r.iata]]);
    expect(rows.find((r) => r.iata === "ADB")?.city).toBe("Gaziemir");
  });
});
