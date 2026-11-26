/**
 * Travel guide tests (require `pnpm -C packages/database guides:sync`).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;
const pw = process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026";
const tokenFor = async (email: string) =>
  (await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password: pw }).expect(200)).body.sessionToken as string;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
});
afterAll(async () => {
  await app.close();
});

describe("travel guides", () => {
  it("lists published guides with tag/country filters", async () => {
    const res = await request(server).get("/v1/travel/guides").query({ pageSize: 60 }).expect(200);
    expect(endpoints["travel.guides"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
    const es = await request(server).get("/v1/travel/guides").query({ country: "es" }).expect(200);
    expect((es.body.items as { countryIso2: string }[]).every((g) => g.countryIso2 === "ES")).toBe(true);
    const beach = await request(server).get("/v1/travel/guides").query({ tag: "beach" }).expect(200);
    expect((beach.body.items as { tags: string[] }[]).every((g) => g.tags.includes("beach"))).toBe(true);
  });

  it("returns sanitised markdown with TOC headings", async () => {
    const res = await request(server).get("/v1/travel/guides/barcelona").expect(200);
    expect(endpoints["travel.guide"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.headings.length).toBeGreaterThan(3);
    expect(res.body.headings[0]).toMatchObject({ level: 2 });
    expect(res.body.bodyMarkdown).not.toMatch(/<script/i);
    expect(res.body.cityId).not.toBeNull();
    await request(server).get("/v1/travel/guides/no-such-guide").expect(404);
  });

  it("links the guide from hotel search for that city", async () => {
    const nyc = await prisma.travelGuide.findUniqueOrThrow({ where: { slug: "new-york" } });
    const res = await request(server).get("/v1/travel/hotels/search").query({ placeId: `city_${nyc.cityId}`, checkin: "2026-12-10", checkout: "2026-12-12" }).expect(200);
    expect(res.body.guideSlug).toBe("new-york");
    const byName = await request(server).get("/v1/travel/hotels/search").query({ city: "Chicago", checkin: "2026-12-10", checkout: "2026-12-12" }).expect(200);
    expect(byName.body.guideSlug).toBe("chicago");
  });

  it("admin CRUD (EDITOR+, audit); drafts are hidden publicly; analysts read-only", async () => {
    const editor = await tokenFor("editor@pricora.local");
    const auth = { authorization: `Bearer ${editor}` };
    const slug = `test-guide-${Date.now()}`;
    const created = await request(server)
      .post("/v1/admin/guides")
      .set(auth)
      .send({ slug, city: "Testville", country: "Testland", countryIso2: "TL", title: "Testville guide", description: "A test guide created by the API integration tests.", bodyMarkdown: "## Intro\n<script>x</script>Hello\n", status: "draft" })
      .expect(201);
    try {
      await request(server).get(`/v1/travel/guides/${slug}`).expect(404);
      const pub = await request(server).patch(`/v1/admin/guides/${created.body.id as string}`).set(auth).send({ status: "published" }).expect(200);
      expect(pub.body.adminEditedAt).not.toBeNull();
      const got = await request(server).get(`/v1/travel/guides/${slug}`).expect(200);
      expect(got.body.bodyMarkdown).not.toContain("<script>");
      const analyst = await tokenFor("analyst@pricora.local");
      await request(server).patch(`/v1/admin/guides/${created.body.id as string}`).set("authorization", `Bearer ${analyst}`).send({ title: "Nope nope" }).expect(403);
      expect(await prisma.auditLog.count({ where: { entityType: "TravelGuide", entityId: created.body.id as string } })).toBeGreaterThanOrEqual(2);
    } finally {
      await request(server).delete(`/v1/admin/guides/${created.body.id as string}`).set(auth).expect(200);
    }
  });
});
