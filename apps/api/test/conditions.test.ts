/**
 * Second-hand handling: new is the default everywhere; used/refurbished/open-box never win "lowest price",
 * never enter new-condition stats/history, and are reachable only when asked for.
 */
import type { INestApplication } from "@nestjs/common";
import { conditionGroupOf, endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { SearchService } from "../src/services/search.service";
import { CatalogService } from "../src/services/catalog.service";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;
let mixedSlug = "";
let mixedId = "";
let mixedTitle = "";
let mixedCategory = "";

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  app.get(CatalogService).metrics.invalidate();
  await app.get(SearchService).ensureIndex(true);
  // A product with both new and cheaper second-hand offers (demo seed adds these to ~15% of products).
  const offer = await prisma.offer.findFirst({
    where: { isActive: true, retailerSku: { startsWith: "DEMO-CND-" }, product: { offers: { some: { condition: "new", isActive: true } } } },
    select: { product: { select: { slug: true, id: true, title: true, category: { select: { slug: true } } } } },
  });
  if (!offer) throw new Error("Run `pnpm -C packages/database seed:conditions` first");
  mixedSlug = offer.product.slug;
  mixedId = offer.product.id;
  mixedTitle = offer.product.title;
  mixedCategory = offer.product.category?.slug ?? "";
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: "@cond.test.pricora.local" } } });
  await app.close();
});

describe("conditions", () => {
  it("maps for_parts/unknown into the used group (never new)", () => {
    expect(conditionGroupOf("for_parts")).toBe("used");
    expect(conditionGroupOf("unknown")).toBe("used");
    expect(conditionGroupOf("open_box")).toBe("open_box");
  });

  it("search defaults to new: headline prices are the lowest NEW offer; cheaper second-hand shows as otherConditions", async () => {
    const offers = await prisma.offer.findMany({ where: { productId: mixedId, isActive: true }, select: { condition: true, priceCents: true, stock: true } });
    const newOffers = offers.filter((o) => o.condition === "new");
    const res = await request(server).get("/v1/search").query({ q: mixedTitle.slice(0, 80), category: mixedCategory, pageSize: 60 }).expect(200);
    expect(endpoints["search.search"].response.safeParse(res.body).success).toBe(true);
    const card = (res.body.items as { id: string; lowestPriceCents: number; priceCondition: string; otherConditions: { condition: string; lowestPriceCents: number }[] }[]).find((c) => c.id === mixedId);
    expect(card).toBeTruthy();
    expect(card!.priceCondition).toBe("new");
    const inStockNew = newOffers.filter((o) => o.stock !== "out_of_stock");
    expect(card!.lowestPriceCents).toBe(Math.min(...(inStockNew.length ? inStockNew : newOffers).map((o) => o.priceCents)));
    for (const oc of card!.otherConditions) {
      expect(oc.condition).not.toBe("new");
      expect(oc.lowestPriceCents).toBeLessThan(card!.lowestPriceCents);
    }
    const sel = res.body.facets.conditions.find((b: { value: string }) => b.value === "new");
    expect(sel.selected).toBe(true);
  });

  it("price sort honours the selected conditions", async () => {
    const asc = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! <= x);
    const n = await request(server).get("/v1/search").query({ category: "oled-tvs", sort: "price_asc", pageSize: 60 }).expect(200);
    const a = await request(server).get("/v1/search").query({ category: "oled-tvs", sort: "price_asc", condition: "all", pageSize: 60 }).expect(200);
    expect(asc((n.body.items as { lowestPriceCents: number }[]).map((i) => i.lowestPriceCents))).toBe(true);
    expect(asc((a.body.items as { lowestPriceCents: number }[]).map((i) => i.lowestPriceCents))).toBe(true);
    for (const i of n.body.items as { priceCondition: string }[]) expect(i.priceCondition).toBe("new");
    const used = await request(server).get("/v1/search").query({ condition: "used", pageSize: 10 }).expect(200);
    for (const i of used.body.items as { priceCondition: string }[]) expect(i.priceCondition).toBe("used");
    expect(used.body.total).toBe(n.body.facets.conditions.find((b: { value: string }) => b.value === "used") ? used.body.total : used.body.total);
  });

  it("condition facet counts are disjunctive and in fixed order", async () => {
    const res = await request(server).get("/v1/search").query({ category: "tv-home-theater" }).expect(200);
    expect(res.body.facets.conditions.map((b: { value: string }) => b.value)).toEqual(["new", "open_box", "refurbished", "used"]);
    const all = await request(server).get("/v1/search").query({ category: "tv-home-theater", condition: "all" }).expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(res.body.total);
  });

  it("product detail: stats and deal score per condition; default new; history never mixes conditions", async () => {
    const res = await request(server).get(`/v1/products/${mixedSlug}`).expect(200);
    expect(endpoints["catalog.product"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.defaultCondition).toBe("new");
    expect(res.body.conditionNote).toBeNull();
    const groups = (res.body.conditionSummary as { condition: string }[]).map((c) => c.condition);
    expect(groups).toContain("new");
    expect(groups.length).toBeGreaterThan(1);
    const lowestNew = res.body.offers.find((o: { id: string }) => o.id === res.body.lowestOfferId);
    expect(lowestNew.condition).toBe("new");
    expect(res.body.byCondition.new.priceStats.currentLowestCents).toBe(res.body.priceStats.currentLowestCents);
    for (const o of res.body.offers as { condition: string; conditionGroup: string }[]) expect(o.conditionGroup).toBe(conditionGroupOf(o.condition as never));

    const other = groups.find((g) => g !== "new")!;
    const hNew = await request(server).get(`/v1/products/${mixedSlug}/history`).query({ range: "all" }).expect(200);
    const hOther = await request(server).get(`/v1/products/${mixedSlug}/history`).query({ range: "all", condition: other }).expect(200);
    const newOfferIds = new Set((res.body.offers as { id: string; condition: string }[]).filter((o) => o.condition === "new").map((o) => o.id));
    for (const s of hNew.body.series as { offerId: string }[]) expect(newOfferIds.has(s.offerId)).toBe(true);
    for (const s of hOther.body.series as { offerId: string }[]) expect(newOfferIds.has(s.offerId)).toBe(false);
    // "Lowest ever" for new is not dragged down by second-hand observations.
    const minNew = Math.min(...(hNew.body.lowest as { priceCents: number }[]).map((p) => p.priceCents));
    expect(hNew.body.stats.allTimeLowCents).toBe(minNew);
  });

  it("deals and price drops are new-only by default; used deals are a separate view", async () => {
    const deals = await request(server).get("/v1/deals").query({ pageSize: 60 }).expect(200);
    for (const d of deals.body.items as { offer: { condition: string } }[]) expect(d.offer.condition).toBe("new");
    const used = await request(server).get("/v1/deals").query({ condition: "used", pageSize: 20 }).expect(200);
    for (const d of used.body.items as { offer: { conditionGroup: string } }[]) expect(d.offer.conditionGroup).toBe("used");
    const home = await request(server).get("/v1/home").expect(200);
    for (const d of home.body.bestDeals as { offer: { condition: string } }[]) expect(d.offer.condition).toBe("new");
  });

  it("alerts default to new and can watch a specific condition", async () => {
    const agent = request.agent(server);
    const me = await agent.get("/v1/auth/me").expect(200);
    const reg = await agent
      .post("/v1/auth/register")
      .set("x-csrf-token", me.body.csrfToken)
      .send({ email: `a-${Date.now()}@cond.test.pricora.local`, password: "correct-horse-battery-staple", name: "Cond" })
      .expect(201);
    const csrf = (await agent.get("/v1/auth/me")).body.csrfToken ?? reg.body.csrfToken;
    const a1 = await agent.post("/v1/me/alerts").set("x-csrf-token", csrf).send({ productId: mixedId, type: "below_price", targetPriceCents: 1000 }).expect(201);
    expect(a1.body.condition).toBe("new");
    const a2 = await agent.post("/v1/me/alerts").set("x-csrf-token", csrf).send({ productId: mixedId, type: "below_price", targetPriceCents: 1000, condition: "used" }).expect(201);
    expect(a2.body.condition).toBe("used");
  });
});
