/**
 * Grocery unit pricing, size families, store-level availability ("Available nearby"), near-me search,
 * local-seller endpoints (auth gates) and the commerce-connector → feed mapping.
 * Needs the demo grocery seed: `pnpm -C packages/database seed:grocery`.
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { toParsedFeed } from "../src/core/commerce-sync";
import { localStock, netQuantityOf } from "../src/core/grocery";
import { SearchService } from "../src/services/search.service";

let app: INestApplication;
type Server = Parameters<typeof request>[0];
let server: Server;

const CHEERIOS = "cheerios-heart-healthy-cereal-family-size-18-oz";

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  await app.get(SearchService).ensureIndex(true);
});

afterAll(async () => {
  await app.close();
});

describe("grocery helpers", () => {
  it("net quantity only from stored columns", () => {
    expect(netQuantityOf({ netQuantity: 18, netUnit: "oz", packCount: 1, sizeLabel: "18 oz" })).toEqual({ basis: "oz", total: 18, packCount: 1, label: "18 oz" });
    expect(netQuantityOf({ netQuantity: null, netUnit: "oz", packCount: null, sizeLabel: null })).toBeNull();
    expect(netQuantityOf({ netQuantity: 5, netUnit: "gallon", packCount: null, sizeLabel: null })).toBeNull();
  });
  it("store stock wording", () => {
    expect(localStock("in_stock", null)).toBe("in_stock");
    expect(localStock("in_stock", 2)).toBe("limited");
    expect(localStock("low_stock", null)).toBe("limited");
    expect(localStock("in_stock", 0)).toBe("out_of_stock");
    expect(localStock("preorder", null)).toBe("unknown");
  });
  it("maps connector products into the merchant feed pipeline shape", () => {
    const parsed = toParsedFeed("r1", {
      provider: "square",
      status: "ok",
      locations: [],
      products: [
        { externalId: "x1", sku: "SKU1", title: "Thing 12 oz", description: null, brand: "B", gtin: "012345678905", mpn: null, priceCents: 499, listPriceCents: null, currency: "USD", url: "https://shop.example/x1", imageUrl: null, condition: "new", inventory: [{ locationExternalId: "L1", quantity: 0, stock: "out_of_stock" }] },
        { externalId: "x2", sku: null, title: "Other", description: null, brand: null, gtin: null, mpn: null, priceCents: 100, listPriceCents: null, currency: "USD", url: null, imageUrl: null, condition: "unknown", inventory: [{ locationExternalId: "L1", quantity: 5, stock: "in_stock" }] },
      ],
    });
    expect(parsed.stats.rows).toBe(2);
    expect(parsed.listings[0]?.offer?.availability).toBe("out_of_stock");
    expect(parsed.listings[0]?.product.retailerSku).toBe("SKU1");
    expect(parsed.listings[1]?.product.retailerSku).toBe("x2");
    expect(parsed.listings[1]?.offer?.availability).toBe("in_stock");
    expect(parsed.listings[1]?.offer?.condition).toBe("unknown");
  });
});

describe("unit prices + size family", () => {
  it("product detail carries unit prices, net quantity and a best-value size", async () => {
    const res = await request(server).get(`/v1/products/${CHEERIOS}`).expect(200);
    const body = endpoints["catalog.product"].response.parse(res.body);
    expect(body.unitPricing).toBe(true);
    expect(body.netQuantity).toMatchObject({ basis: "oz", total: 18 });
    for (const o of body.offers) expect(o.unitPrice?.millicentsPerUnit).toBe(Math.round((o.priceCents * 1000) / 18));
    const fam = body.sizeFamily ?? [];
    expect(fam.length).toBeGreaterThanOrEqual(3);
    expect(fam.filter((m) => m.bestValue)).toHaveLength(1);
    const best = fam.find((m) => m.bestValue)!;
    for (const m of fam) if (m.unitPrice) expect(best.unitPrice!.millicentsPerUnit).toBeLessThanOrEqual(m.unitPrice.millicentsPerUnit);
    // Sizes stay separate products.
    expect(new Set(fam.map((m) => m.slug)).size).toBe(fam.length);
  });

  it("search sorts by unit price (unknown sizes last) and exposes size/dietary facets", async () => {
    const res = await request(server).get("/v1/search").query({ category: "breakfast-cereal", sort: "unit_price", pageSize: 60 }).expect(200);
    const body = endpoints["search.search"].response.parse(res.body);
    const vals = body.items.map((c) => c.unitPrice?.millicentsPerUnit ?? Number.POSITIVE_INFINITY);
    expect(vals.length).toBeGreaterThan(5);
    expect([...vals].sort((a, b) => a - b)).toEqual(vals);
  });
});

describe("available nearby", () => {
  it("asks for a ZIP when none is known", async () => {
    const res = await request(server).get(`/v1/products/${CHEERIOS}/nearby`).expect(200);
    expect(res.body.status).toBe("set_zip");
    expect(res.body.items).toEqual([]);
  });

  it("unknown ZIP is reported, not guessed", async () => {
    const res = await request(server).get(`/v1/products/${CHEERIOS}/nearby`).query({ zip: "00001" }).expect(200);
    expect(res.body.status).toBe("unknown_zip");
  });

  it("orders organic results by distance; sponsored is a separate labeled slot", async () => {
    const res = await request(server).get(`/v1/products/${CHEERIOS}/nearby`).query({ zip: "10001", radius: 25 }).expect(200);
    const body = endpoints["products.nearby"].response.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.items.length).toBeGreaterThan(0);
    const inStock = body.items.filter((i) => i.stock !== "out_of_stock");
    for (let i = 1; i < inStock.length; i++) expect(inStock[i]!.distanceMi).toBeGreaterThanOrEqual(inStock[i - 1]!.distanceMi);
    for (const i of body.items) {
      expect(i.sponsored).toBe(false);
      expect(i.distanceMi).toBeLessThanOrEqual(25);
    }
    expect(body.sponsored.length).toBeLessThanOrEqual(1);
    for (const s of body.sponsored) expect(s.sponsored).toBe(true);
    // Demo rows are flagged.
    expect(body.hasDemoData).toBe(true);
    // Source status is reported honestly (no keys in tests → pending).
    const ids = (body.sources ?? []).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["local-sellers", "kroger", "ebay-local-pickup", "etsy"]));
    expect(body.sources?.find((s) => s.id === "local-sellers")?.status).toBe("live");
  });

  it("near-me search only returns products stocked nearby and annotates the nearest store", async () => {
    const res = await request(server).get("/v1/search").query({ q: "cheerios", near: "true", zip: "10001", sort: "distance" }).expect(200);
    const body = endpoints["search.search"].response.parse(res.body);
    expect(body.location?.zip).toBe("10001");
    expect(body.items.length).toBeGreaterThan(0);
    for (const c of body.items) expect(c.nearest?.distanceMi).toBeLessThanOrEqual(25);
    const d = body.items.map((c) => c.nearest!.distanceMi);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("lists store locations near a ZIP for the map", async () => {
    const res = await request(server).get("/v1/local/stores").query({ zip: "60614", radius: 10 }).expect(200);
    const body = endpoints["local.stores"].response.parse(res.body);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((s) => s.distanceMi <= 10)).toBe(true);
  });
});

describe("local seller + admin gates", () => {
  it("application requires sign-in", async () => {
    await request(server).post("/v1/merchant/local/apply").send({}).expect(401);
  });
  it("merchant locations / connections require a merchant", async () => {
    await request(server).get("/v1/merchant/locations").expect(401);
    await request(server).get("/v1/merchant/locations/x/inventory").expect(401);
    await request(server).get("/v1/merchant/connections").expect(401);
  });
  it("moderation queue and coverage require staff", async () => {
    await request(server).get("/v1/admin/local/merchants").expect(401);
    await request(server).get("/v1/admin/coverage").expect(401);
  });
});
