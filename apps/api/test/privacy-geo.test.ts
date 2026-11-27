/**
 * Geo (nearest ZIP / edge resolve) + privacy (consent, DSAR) endpoints.
 * Nearest-ZIP integration cases need the Census ZCTA import: `pnpm -C packages/database zip:import`.
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { redactUrl } from "../src/common/errors";
import { boundingBox, confidenceFor, haversineKm, pickZip, type ZipCandidate } from "../src/core/geo-zip";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;
let zctaCount = 0;
const DSAR_EMAIL = `dsar-${Date.now()}@test.pricora.local`;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  zctaCount = await prisma.zipCode.count();
});

afterAll(async () => {
  await prisma.privacyRequest.deleteMany({ where: { email: { endsWith: "@test.pricora.local" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test.pricora.local" } } });
  await app.close();
});

describe("geo-zip algorithm (pure)", () => {
  const c = (zip: string, lat: number, lng: number, landAreaKm2: number): ZipCandidate => ({ zip, lat, lng, landAreaKm2, state: "XX", city: null });

  it("haversine + bounding box", () => {
    expect(haversineKm(40.7484, -73.9857, 34.0522, -118.2437)).toBeGreaterThan(3930);
    expect(haversineKm(40.7484, -73.9857, 34.0522, -118.2437)).toBeLessThan(3950);
    const b = boundingBox(40, -100, 10);
    expect(b.maxLat - b.minLat).toBeCloseTo(20 / 111.32, 3);
    expect(b.maxLng - b.minLng).toBeGreaterThan(b.maxLat - b.minLat); // longitude degrees shrink away from the equator
  });

  it("prefers a large ZCTA that the point is inside over a tiny neighbour with a closer centroid", () => {
    const big = c("11111", 45.0, -100.0, 900); // r ≈ 17 km
    const tiny = c("22222", 45.08, -100.0, 2); // r ≈ 0.8 km
    const p = pickZip(45.06, -100.0, [big, tiny]); // 6.7 km from big, 2.2 km from tiny
    expect(p?.candidate.zip).toBe("11111");
    expect(p?.confidence).toBe("high");
  });

  it("returns null when nothing is within range, and grades confidence", () => {
    expect(pickZip(0, 0, [c("11111", 45, -100, 10)])).toBeNull();
    expect(confidenceFor(0.5, 1)).toBe("high");
    expect(confidenceFor(1.4, 0.5)).toBe("medium");
    expect(confidenceFor(40, 30)).toBe("low");
  });

  it("never logs precise coordinates", () => {
    expect(redactUrl("/v1/geo/zip?lat=40.748441&lng=-73.985664")).toBe("/v1/geo/zip?lat=40.75&lng=-73.99");
  });
});

describe("GET /v1/geo/zip", () => {
  it("resolves well-known US points from Census ZCTAs", async () => {
    if (zctaCount < 30_000) return; // import not run in this environment
    const cases: Array<[number, number, RegExp, string]> = [
      [40.7484, -73.9857, /^100\d\d$/, "NY"], // Midtown Manhattan
      [41.8789, -87.6359, /^606\d\d$/, "IL"], // Chicago Loop
      [30.2672, -97.7431, /^787\d\d$/, "TX"], // Austin
      [21.3069, -157.8583, /^968\d\d$/, "HI"], // Honolulu
    ];
    for (const [lat, lng, re, state] of cases) {
      const res = await request(server).get(`/v1/geo/zip?lat=${lat}&lng=${lng}`).expect(200);
      expect(endpoints["geo.zip.nearest"].response.safeParse(res.body).success).toBe(true);
      expect(res.body.zip).toMatch(re);
      expect(res.body.state).toBe(state);
      expect(res.body.distanceKm).toBeLessThan(5);
      expect(["high", "medium", "low"]).toContain(res.body.confidence);
    }
  });

  it("returns zip null outside US coverage", async () => {
    const res = await request(server).get("/v1/geo/zip?lat=51.5074&lng=-0.1278").expect(200);
    expect(res.body).toMatchObject({ zip: null, confidence: null, source: "census_zcta" });
  });

  it("validates coordinates", async () => {
    await request(server).get("/v1/geo/zip?lat=95&lng=0").expect(422);
    await request(server).get("/v1/geo/zip?lat=abc&lng=0").expect(422);
    await request(server).get("/v1/geo/zip").expect(422);
  });
});

describe("GET /v1/geo/zip/resolve", () => {
  it("ignores forgeable edge headers unless TRUST_PROXY is configured", async () => {
    const res = await request(server)
      .get("/v1/geo/zip/resolve")
      .set("x-vercel-ip-country", "US")
      .set("x-vercel-ip-country-region", "NY")
      .set("x-vercel-ip-postal-code", "10001")
      .expect(200);
    expect(endpoints["geo.zip.resolve"].response.safeParse(res.body).success).toBe(true);
    if (process.env.TRUST_PROXY) expect(res.body).toMatchObject({ zip: "10001", state: "NY", source: "vercel", confidence: "low" });
    else expect(res.body).toEqual({ zip: null, state: null, source: "none", confidence: null });
  });
});

describe("consent (account copy)", () => {
  it("requires a session, and GPC forces advertising off", async () => {
    await request(server).get("/v1/me/consent").expect(401);
    const agent = request.agent(server);
    const csrf: string = (await agent.get("/v1/auth/me").expect(200)).body.csrfToken;
    const reg = await agent
      .post("/v1/auth/register")
      .set("x-csrf-token", csrf)
      .send({ email: `consent-${Date.now()}@test.pricora.local`, password: "correct-horse-battery-staple", name: "Consent Test" })
      .expect(201);
    const csrf2: string = reg.body.csrfToken ?? csrf;
    expect((await agent.get("/v1/me/consent").expect(200)).body).toEqual({ consent: null });
    const put = await agent.put("/v1/me/consent").set("x-csrf-token", csrf2).send({ functional: true, analytics: false, advertising: true, gpc: true }).expect(200);
    expect(endpoints["privacy.consent.update"].response.safeParse(put.body).success).toBe(true);
    expect(put.body.consent).toMatchObject({ v: 1, functional: true, analytics: false, advertising: false, gpc: true });
    expect((await agent.get("/v1/me/consent").expect(200)).body.consent.advertising).toBe(false);
  });
});

describe("data subject requests (logged-out)", () => {
  it("records the request and is honest that no email was sent without SMTP", async () => {
    const res = await request(server).post("/v1/privacy/requests").send({ type: "delete", email: DSAR_EMAIL.toUpperCase(), state: "ca" }).expect(201);
    expect(endpoints["privacy.requests.create"].response.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ status: "awaiting_verification", verification: "not_configured" });
    const row = await prisma.privacyRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.email).toBe(DSAR_EMAIL);
    expect(row.state).toBe("CA");
    expect(row.verifyTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.dueAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(44 * 86_400_000);
  });

  it("rejects invalid input and unknown verification tokens", async () => {
    await request(server).post("/v1/privacy/requests").send({ type: "sell_everything", email: DSAR_EMAIL }).expect(422);
    await request(server).post("/v1/privacy/requests").send({ type: "access", email: "not-an-email" }).expect(422);
    await request(server).get(`/v1/privacy/requests/verify?token=${"x".repeat(43)}`).expect(400);
  });
});
