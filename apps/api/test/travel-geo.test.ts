/**
 * Geo/places tests (require `pnpm -C packages/database geo:import`).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { TravelController } from "../src/controllers/travel.controller";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  await app.get(TravelController).ensurePlacesIndex();
}, 300_000);

afterAll(async () => {
  await app.close();
});

describe("geo dataset", () => {
  it("has countries, cities and IATA airports imported", async () => {
    expect(await prisma.country.count()).toBeGreaterThan(240);
    expect(await prisma.city.count()).toBeGreaterThan(20_000);
    expect(await prisma.airport.count({ where: { scheduledService: true } })).toBeGreaterThan(3000);
    const jfk = await prisma.airport.findUniqueOrThrow({ where: { iata: "JFK" } });
    expect(jfk.metroCode).toBe("NYC");
  });
});

describe("places autocomplete", () => {
  it("matches IATA codes and shows multi-airport cities first", async () => {
    const res = await request(server).get("/v1/travel/places").query({ q: "ist" }).expect(200);
    expect(endpoints["travel.places"].response.safeParse(res.body).success).toBe(true);
    const items = res.body.items as { id: string; name: string; iata: string | null; cityCode: string | null; airports: string[] }[];
    expect(items.slice(0, 3).some((p) => p.iata === "IST" || p.cityCode === "IST")).toBe(true);
    const metro = items.find((p) => p.cityCode === "IST" && p.id.startsWith("city_"));
    expect(metro?.name).toBe("Istanbul (Any airport)");
    expect(metro?.airports).toEqual(expect.arrayContaining(["IST", "SAW"]));
    const jfk = await request(server).get("/v1/travel/places").query({ q: "JFK", types: "airport" }).expect(200);
    expect(jfk.body.items[0].iata).toBe("JFK");
  });

  it("puts hub airports right after their city: paris → Paris (Any) → CDG → ORY", async () => {
    const res = await request(server).get("/v1/travel/places").query({ q: "paris", limit: 6 }).expect(200);
    const ids = (res.body.items as { id: string; iata: string | null; cityCode: string | null }[]).map((p) => p.iata ?? p.cityCode ?? p.id);
    expect(ids.slice(0, 3)).toEqual(["PAR", "CDG", "ORY"]);
    const lon = await request(server).get("/v1/travel/places").query({ q: "london", limit: 4 }).expect(200);
    expect((lon.body.items as { cityCode: string | null; iata: string | null }[]).slice(0, 2).map((p) => p.iata ?? p.cityCode)).toEqual(["LON", "LHR"]);
  });

  it("finds countries and tolerates accents/typos", async () => {
    const tr = await request(server).get("/v1/travel/places").query({ q: "Turkey", types: "country" }).expect(200);
    expect((tr.body.items as { id: string }[]).some((p) => p.id === "country_TR")).toBe(true);
    const sp = await request(server).get("/v1/travel/places").query({ q: "Sao Paulo", types: "city" }).expect(200);
    expect((sp.body.items as { cityCode: string | null }[]).some((p) => p.cityCode === "SAO")).toBe(true);
    const typo = await request(server).get("/v1/travel/places").query({ q: "Barcelna", types: "city" }).expect(200);
    expect((typo.body.items as { countryIso2: string; name: string }[]).some((p) => p.countryIso2 === "ES" && p.name.startsWith("Barcelona"))).toBe(true);
  });

  it("Postgres fallback works without Meilisearch", async () => {
    const { searchPlacesPg } = await import("../src/core/places");
    const r = await searchPlacesPg(prisma, "lhr", ["airport", "city"], 5);
    expect(r[0]?.iata).toBe("LHR");
    const c = await searchPlacesPg(prisma, "istanbul", ["city"], 5);
    expect(c[0]?.cityCode).toBe("IST");
  });

  it("keeps /travel/airports working", async () => {
    const res = await request(server).get("/v1/travel/airports").query({ q: "JFK" }).expect(200);
    expect(res.body.items[0].iata).toBe("JFK");
  });
});

describe("travel search with places", () => {
  it("expands city codes for flights", async () => {
    const res = await request(server).get("/v1/travel/flights/search").query({ from: "NYC", to: "LON", depart: "2026-12-20" }).expect(200);
    expect(res.body.query.fromAirports).toEqual(expect.arrayContaining(["JFK", "LGA", "EWR"]));
    expect(res.body.query.toAirports).toEqual(expect.arrayContaining(["LHR", "LGW"]));
    expect(res.body.offers).toEqual([]);
  });

  it("returns demo hotels only where they exist; empty elsewhere (never fabricated)", async () => {
    const nyc = await prisma.city.findFirstOrThrow({ where: { iataCityCode: "NYC" } });
    const near = await request(server).get("/v1/travel/hotels/search").query({ placeId: `city_${nyc.geonameId}`, checkin: "2026-12-10", checkout: "2026-12-12" }).expect(200);
    expect(near.body.items.length).toBeGreaterThan(0);
    expect((near.body.items as { source: string }[]).every((h) => h.source === "demo")).toBe(true);
    const ist = await prisma.city.findFirstOrThrow({ where: { iataCityCode: "IST" } });
    const far = await request(server).get("/v1/travel/hotels/search").query({ placeId: `city_${ist.geonameId}`, checkin: "2026-12-10", checkout: "2026-12-12" }).expect(200);
    expect(far.body.items).toEqual([]);
    expect(far.body.source).toBe("none");
    expect((far.body.providers as { status: string }[]).every((p) => p.status !== "live")).toBe(true);
    await request(server).get("/v1/travel/hotels/search").query({ checkin: "2026-12-10", checkout: "2026-12-12" }).expect(422);
  });
});
