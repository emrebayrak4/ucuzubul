/**
 * Channel3 catalog ingestion + Icecat enrichment against the local/docker Postgres.
 * Provider responses are TEST-ONLY synthetic payloads served by a fake fetch (no live API calls).
 * Every row created here is tagged with a "c3-test-" prefix and removed afterwards.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getPrisma } from "@pricora/database";
import { Channel3Client, IcecatClient, type FetchLike } from "@pricora/retailer-adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INTEGRATION_CATALOG, enrichWithIcecat, ingestChannel3Category, refreshChannel3Offers, testIntegration } from "../src/core";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (!process.env.DATABASE_URL && existsSync(candidate)) process.loadEnvFile(candidate);
}
const prisma = getPrisma();
const TAG = `c3-test-${Date.now()}`;
const KNOWN = `${TAG}-known.example`; // an existing retailer
const NEWSHOP = `${TAG}-newshop.example`; // a store we don't have yet
const BUY = "https://buy.trychannel3.com";
const http = { rateLimit: { capacity: 100, refillPerSecond: 100 }, retry: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 } };
let categoryId = "";
let demoProductId = "";
let knownRetailerId = "";

/** Fake fetch: answers by URL substring; records calls. */
function fakeFetch(routes: Record<string, () => { status?: number; body: unknown }>): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key]!() : { status: 404, body: { detail: "not found" } };
    const status = r.status ?? 200;
    const text = JSON.stringify(r.body);
    return { status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => text };
  }) as unknown as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function c3Product(id: string, price: number, extraOffers: unknown[] = []) {
  return {
    id,
    title: `Testbrand ${TAG} Headphones ${id}`,
    description: "Synthetic test product.",
    brands: [{ id: "B1", name: `Testbrand ${TAG}` }],
    images: [{ url: `https://cdn.example.test/${id}.jpg`, is_main_image: true }],
    category: { slug: "headphones", title: "Headphones", path: ["Electronics", "Headphones"] },
    structured_attributes: { color: "black" },
    offers: [
      { url: `${BUY}/${id}-known`, domain: `www.${KNOWN}`, price: { price, compare_at_price: price + 50, currency: "USD" }, availability: "InStock", condition: "new" },
      { url: `${BUY}/${id}-new`, domain: NEWSHOP, price: { price: price + 10, currency: "USD" }, availability: "OutOfStock", condition: "new" },
      ...extraOffers,
    ],
  };
}

const C3_ENV = { CHANNEL3_API_KEY: "test-key" };
const ICECAT_ENV = { ICECAT_SHOPNAME: "test-shop" };
const events: unknown[] = [];
const enqueuePriceEvent = async (job: unknown) => {
  events.push(job);
};

beforeAll(async () => {
  const cat = await prisma.category.create({ data: { slug: TAG, name: `Headphones ${TAG}`, path: TAG, depth: 0 } });
  categoryId = cat.id;
  const demo = await prisma.product.create({ data: { slug: `${TAG}-demo`, title: "Demo headphones", isDemo: true, categoryId } });
  demoProductId = demo.id;
  const r = await prisma.retailer.create({ data: { slug: `${TAG}-known`, name: "Known Test Store", domain: KNOWN, websiteUrl: `https://${KNOWN}` } });
  knownRetailerId = r.id;
});

afterAll(async () => {
  const products = await prisma.product.findMany({ where: { OR: [{ slug: { startsWith: TAG } }, { categoryId }] }, select: { id: true } });
  await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
  await prisma.retailer.deleteMany({ where: { domain: { startsWith: TAG } } });
  await prisma.brand.deleteMany({ where: { name: { contains: TAG } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.$disconnect();
});

describe("Channel3 catalog ingestion", () => {
  it("creates an active product with brand, image, attributes and offers, adding unknown stores", async () => {
    const f = fakeFetch({ "/v1/search": () => ({ body: { products: [c3Product("AAA1", 100)], next_page_token: null } }) });
    const channel3 = new Channel3Client({ env: C3_ENV, fetch: f, http });
    const stats = await ingestChannel3Category(prisma, C3_ENV, categoryId, { channel3, enqueuePriceEvent });

    expect(stats).toMatchObject({ status: "ok", products: 1, productsCreated: 1, offersUpserted: 2, retailersCreated: 1, demoArchived: 1 });
    expect(f.calls.filter((u) => u.includes("/v1/search"))).toHaveLength(1);

    const offers = await prisma.offer.findMany({ where: { retailerSku: "c3:AAA1" }, include: { retailer: true, product: { include: { brand: true, images: true, attributes: true } } } });
    expect(offers).toHaveLength(2);
    const p = offers[0]!.product;
    expect(p).toMatchObject({ status: "active", isDemo: false, categoryId, title: `Testbrand ${TAG} Headphones AAA1` });
    expect(p.brand?.name).toBe(`Testbrand ${TAG}`);
    expect(p.images.map((i) => [i.url, i.source])).toEqual([[`https://cdn.example.test/AAA1.jpg`, "affiliate"]]);
    expect(p.attributes.map((a) => [a.name, a.value])).toEqual([["color", "black"]]);

    const known = offers.find((o) => o.retailerId === knownRetailerId)!;
    expect(known).toMatchObject({ priceCents: 10000, listPriceCents: 15000, stock: "in_stock", source: "affiliate", isActive: true, url: `${BUY}/AAA1-known`, affiliateUrl: `${BUY}/AAA1-known` });
    expect(known.retailer.allowedRedirectHosts).toContain("buy.trychannel3.com");

    const created = offers.find((o) => o.retailer.domain === NEWSHOP)!;
    expect(created).toMatchObject({ priceCents: 11000, stock: "out_of_stock" });
    expect(created.retailer).toMatchObject({ isActive: true, websiteUrl: `https://${NEWSHOP}` });
    expect(created.retailer.allowedRedirectHosts).toContain("buy.trychannel3.com");
    expect(await prisma.retailerMarket.count({ where: { retailerId: created.retailerId, marketId: "us" } })).toBe(1);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: demoProductId } })).status).toBe("archived");
    expect(await prisma.priceHistory.count({ where: { offerId: known.id } })).toBe(1);
  });

  it("reuses the product on the next run and records price changes", async () => {
    const f = fakeFetch({ "/v1/search": () => ({ body: { products: [c3Product("AAA1", 90)], next_page_token: null } }) });
    const channel3 = new Channel3Client({ env: C3_ENV, fetch: f, http });
    const stats = await ingestChannel3Category(prisma, C3_ENV, categoryId, { channel3, enqueuePriceEvent });
    expect(stats).toMatchObject({ products: 1, productsCreated: 0, productsMatched: 1, retailersCreated: 0, priceChanges: 2 });
    const known = await prisma.offer.findFirstOrThrow({ where: { retailerSku: "c3:AAA1", retailerId: knownRetailerId } });
    expect(known.priceCents).toBe(9000);
    expect(await prisma.priceHistory.count({ where: { offerId: known.id } })).toBe(2);
    expect(await prisma.product.count({ where: { offers: { some: { retailerSku: "c3:AAA1" } } } })).toBe(1);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("is pending without an API key and leaves the database alone", async () => {
    const stats = await ingestChannel3Category(prisma, {}, categoryId, { enqueuePriceEvent });
    expect(stats.status).toBe("pending_configuration");
  });
});

describe("Channel3 offer refresh (free product detail)", () => {
  it("updates prices and deactivates offers that disappeared", async () => {
    const detail = { ...c3Product("AAA1", 80), offers: [c3Product("AAA1", 80).offers[0]] };
    const f = fakeFetch({ "/v1/products/AAA1": () => ({ body: detail }) });
    const channel3 = new Channel3Client({ env: C3_ENV, fetch: f, http });
    const stats = await refreshChannel3Offers(prisma, C3_ENV, { channel3, enqueuePriceEvent }, { maxProducts: 10, productIds: ["AAA1"] });
    expect(stats).toMatchObject({ checked: 1, priceChanges: 1, deactivated: 1 });
    const offers = await prisma.offer.findMany({ where: { retailerSku: "c3:AAA1" }, include: { retailer: true } });
    expect(offers.find((o) => o.retailerId === knownRetailerId)).toMatchObject({ priceCents: 8000, isActive: true });
    expect(offers.find((o) => o.retailer.domain === NEWSHOP)).toMatchObject({ isActive: false });
  });

  it("deactivates every offer when Channel3 no longer has the product", async () => {
    const f = fakeFetch({});
    const channel3 = new Channel3Client({ env: C3_ENV, fetch: f, http });
    const stats = await refreshChannel3Offers(prisma, C3_ENV, { channel3, enqueuePriceEvent }, { maxProducts: 10, productIds: ["AAA1"] });
    expect(stats).toMatchObject({ checked: 1, gone: 1 });
    expect(await prisma.offer.count({ where: { retailerSku: "c3:AAA1", isActive: true } })).toBe(0);
  });
});

describe("Icecat enrichment", () => {
  it("adds images and specs to a product with a GTIN, once", async () => {
    const p = await prisma.product.create({ data: { slug: `${TAG}-gtin`, title: "Gtin product", isDemo: false, identifiers: { create: [{ type: "UPC", value: "036000291452" }] } } });
    const body = {
      data: {
        GeneralInfo: { IcecatId: 42, Title: "Gtin product full", Brand: "B", BrandPartCode: "P1", GTIN: ["036000291452"] },
        Gallery: [{ Pic: "https://images.example.test/g1.jpg", PicWidth: "800", PicHeight: "600", ThumbPic: "https://images.example.test/t1.jpg" }],
        FeaturesGroups: [{ FeatureGroup: { Name: { Value: "Display" } }, Features: [{ PresentationValue: "6.1\"", Feature: { Name: { Value: "Display diagonal" } } }] }],
      },
    };
    const f = fakeFetch({ "live.icecat.biz/api": () => ({ body }) });
    const icecat = new IcecatClient({ env: ICECAT_ENV, fetch: f, http });
    const first = await enrichWithIcecat(prisma, ICECAT_ENV, { icecat }, { limit: 500, productIds: [p.id] });
    expect(first).toMatchObject({ checked: 1, enriched: 1, notFound: 0 });
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { images: true, attributes: true } });
    expect(saved.images.map((i) => [i.url, i.width, i.height, i.source])).toEqual([["https://images.example.test/g1.jpg", 800, 600, "api"]]);
    expect(saved.attributes.map((a) => [a.group, a.name, a.value])).toEqual([["Icecat", "Display diagonal", "6.1\""]]);

    const again = await enrichWithIcecat(prisma, ICECAT_ENV, { icecat }, { limit: 500, productIds: [p.id] });
    expect(again).toMatchObject({ checked: 0, enriched: 0 });
  });

  it("leaves a product untouched when Icecat has no datasheet", async () => {
    const p = await prisma.product.create({ data: { slug: `${TAG}-nogtin`, title: "Unknown product", isDemo: false, identifiers: { create: [{ type: "EAN", value: "4006381333931" }] } } });
    const f = fakeFetch({ "live.icecat.biz/api": () => ({ status: 400, body: { StatusCode: 16, Message: "The GTIN can not be found" } }) });
    const icecat = new IcecatClient({ env: ICECAT_ENV, fetch: f, http });
    const r = await enrichWithIcecat(prisma, ICECAT_ENV, { icecat }, { limit: 500, productIds: [p.id] });
    expect(r).toMatchObject({ checked: 1, enriched: 0, notFound: 1 });
    expect(await prisma.productImage.count({ where: { productId: p.id } })).toBe(0);
  });
});

describe("integrations catalog", () => {
  it("lists Channel3 and Icecat and reports pending without keys", async () => {
    const c3 = INTEGRATION_CATALOG.find((i) => i.id === "channel3");
    const ic = INTEGRATION_CATALOG.find((i) => i.id === "icecat");
    expect(c3?.fields.map((x) => [x.key, x.secret, x.required])).toEqual([["CHANNEL3_API_KEY", true, true]]);
    expect(ic?.fields.map((x) => [x.key, x.secret, x.required])).toEqual([["ICECAT_SHOPNAME", false, true]]);
    expect((await testIntegration(c3!, {})).status).toBe("pending_configuration");
  });
});
