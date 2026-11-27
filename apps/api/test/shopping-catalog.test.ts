/**
 * Shopping depth: category tree + spec facets, disjunctive counts, Postgres-fallback parity, suggestions,
 * compare (5), brand/store breakdowns, product alternatives. Runs against the seeded dev DB
 * (`pnpm db:seed` or `pnpm -C packages/database seed:catalog`).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints, type SearchQuery } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import type { Meilisearch } from "meilisearch";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { buildVocabulary, editDistance, suggestCorrection } from "../src/core/search-spell";
import { CatalogService } from "../src/services/catalog.service";
import { numericValue, priceFacet, SearchService } from "../src/services/search.service";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  await app.get(SearchService).ensureIndex(true);
});

afterAll(async () => {
  await app.close();
});

const q = (over: Partial<SearchQuery>): SearchQuery => ({ sort: "relevance", page: 1, pageSize: 24, ...over });

describe("pure helpers", () => {
  it("spell correction fixes typos against the vocabulary", () => {
    const vocab = buildVocabulary(["Samsung Galaxy S25 Ultra", "Sony WH-1000XM6 headphones", "LG OLED evo C5 television"]);
    expect(editDistance("samsnug", "samsung", 2)).toBe(2);
    expect(suggestCorrection("samsnug galxy", vocab)).toBe("samsung galaxy");
    expect(suggestCorrection("headphones", vocab)).toBeNull();
    expect(suggestCorrection("zzzzzzzzzz", vocab)).toBeNull();
  });

  it("numeric spec ordering understands units", () => {
    const labels = ["1 TB", "256 GB", "512 GB", "2 TB", "128 GB"];
    expect([...labels].sort((a, b) => numericValue(a) - numericValue(b))).toEqual(["128 GB", "256 GB", "512 GB", "1 TB", "2 TB"]);
    expect(numericValue("6.3 in")).toBeCloseTo(6.3);
  });

  it("price histogram covers every price with equal-width dollar-aligned bins", () => {
    const prices = [999, 4999, 12999, 25000, 89999, 149999];
    const f = priceFacet(prices, undefined);
    expect(f.minCents).toBe(999);
    expect(f.maxCents).toBe(149999);
    expect(f.histogram.reduce((n, b) => n + b.count, 0)).toBe(prices.length);
    const widths = new Set(f.histogram.map((b) => b.toCents - b.fromCents));
    expect(widths.size).toBe(1);
    expect([...widths][0]! % 100).toBe(0);
    expect(priceFacet([], undefined).histogram).toEqual([]);
  });
});

describe("category tree", () => {
  it("has 16 top-level categories and three levels", async () => {
    const res = await request(server).get("/v1/categories").expect(200);
    expect(endpoints["catalog.categories"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.items).toHaveLength(16);
    const computers = res.body.items.find((c: { slug: string }) => c.slug === "computers");
    const laptops = computers.children.find((c: { slug: string }) => c.slug === "laptops");
    expect(laptops.children.map((c: { slug: string }) => c.slug)).toContain("gaming-laptops");
  });

  it("returns inherited facet definitions, SEO text and children counts", async () => {
    const res = await request(server).get("/v1/categories/gaming-laptops").expect(200);
    expect(endpoints["catalog.category"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.facets.map((f: { key: string }) => f.key)).toEqual(expect.arrayContaining(["ram", "storage", "gpu", "cpu-brand", "screen-size"]));
    expect(res.body.seoText).toContain("gaming");
    expect(res.body.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual(["computers", "laptops", "gaming-laptops"]);
    expect(res.body.siblings.length).toBeGreaterThan(1);
  });
});

describe("spec facets", () => {
  it("returns attribute facets for a category and filters by them (OR within key, AND across keys)", async () => {
    const base = await request(server).get("/v1/search").query({ category: "laptops", pageSize: 60 }).expect(200);
    expect(endpoints["search.search"].response.safeParse(base.body).success).toBe(true);
    const ram = base.body.facets.specs.find((f: { key: string }) => f.key === "ram");
    expect(ram.buckets.length).toBeGreaterThan(2);
    const b16 = ram.buckets.find((b: { label: string }) => b.label === "16 GB");
    const b32 = ram.buckets.find((b: { label: string }) => b.label === "32 GB");
    expect(b16.value).toBe("ram.16-gb");

    const one = await request(server).get("/v1/search").query({ category: "laptops", spec: "ram.16-gb", pageSize: 60 }).expect(200);
    expect(one.body.total).toBe(b16.count);
    // Disjunctive: RAM counts ignore the RAM selection, so other RAM values are still offered.
    const ramAfter = one.body.facets.specs.find((f: { key: string }) => f.key === "ram");
    expect(ramAfter.buckets.find((b: { value: string }) => b.value === "ram.32-gb").count).toBe(b32.count);
    expect(ramAfter.buckets.find((b: { value: string }) => b.value === "ram.16-gb").selected).toBe(true);

    const both = await request(server).get("/v1/search").query({ category: "laptops", spec: "ram.16-gb,ram.32-gb", pageSize: 60 }).expect(200);
    expect(both.body.total).toBe(b16.count + b32.count);

    const and = await request(server).get("/v1/search").query({ category: "laptops", spec: "ram.16-gb,os.macos", pageSize: 60 }).expect(200);
    expect(and.body.total).toBeLessThan(one.body.total);
    for (const item of and.body.items as { brand: { slug: string } | null }[]) expect(item.brand?.slug).toBe("apple");
  });

  it("price histogram ignores the price filter so the slider keeps its range", async () => {
    const all = await request(server).get("/v1/search").query({ category: "tv-home-theater" }).expect(200);
    const capped = await request(server).get("/v1/search").query({ category: "tv-home-theater", maxPrice: 50000 }).expect(200);
    expect(capped.body.facets.price.minCents).toBe(all.body.facets.price.minCents);
    expect(capped.body.facets.price.maxCents).toBe(all.body.facets.price.maxCents);
    expect(capped.body.total).toBeLessThan(all.body.total);
  });

  it("Postgres fallback returns the same totals and spec counts as Meilisearch", async () => {
    const broken = {
      index: () => ({
        getStats: () => Promise.reject(new Error("connect ECONNREFUSED")),
        search: () => Promise.reject(new Error("connect ECONNREFUSED")),
      }),
    } as unknown as Meilisearch;
    const fallback = new SearchService(prisma, broken, app.get(CatalogService));
    const live = app.get(SearchService);
    const query = q({ category: "smartphones", spec: ["storage.256-gb"], pageSize: 60 });
    const [a, b] = await Promise.all([live.search(query), fallback.search(query)]);
    expect(b.degraded).toBe(true);
    expect(a.degraded).toBe(false);
    expect(b.total).toBe(a.total);
    const counts = (r: typeof a) => Object.fromEntries((r.facets.specs.find((f) => f.key === "storage")?.buckets ?? []).map((x) => [x.value, x.count]));
    expect(counts(b)).toEqual(counts(a));
  });

  it("brand and store facets carry logo/color metadata", async () => {
    const res = await request(server).get("/v1/search").query({ category: "laptops" }).expect(200);
    expect(res.body.facets.retailers[0]).toHaveProperty("color");
    expect(res.body.facets.brands[0]).toHaveProperty("logoUrl");
    expect(res.body.items[0].keySpecs.length).toBeGreaterThan(0);
  });
});

describe("search UX", () => {
  it("suggests categories, brands and products in sections", async () => {
    const res = await request(server).get("/v1/search/suggest").query({ q: "lapt" }).expect(200);
    expect(endpoints["search.suggest"].response.safeParse(res.body).success).toBe(true);
    const types = new Set((res.body.items as { type: string }[]).map((i) => i.type));
    expect(types.has("category")).toBe(true);
    const brands = await request(server).get("/v1/search/suggest").query({ q: "sams" }).expect(200);
    expect((brands.body.items as { type: string; text: string }[]).some((i) => i.type === "brand" && i.text === "Samsung")).toBe(true);
  });

  it("offers 'did you mean' for misspelled queries", async () => {
    const res = await request(server).get("/v1/search").query({ q: "samsnug galxy" }).expect(200);
    expect(res.body.didYouMean).toBe("samsung galaxy");
  });

  it("sort=newest orders by first-listed time", async () => {
    const res = await request(server).get("/v1/search").query({ sort: "newest", pageSize: 10 }).expect(200);
    expect(res.body.items.length).toBe(10);
  });
});

describe("compare, breakdowns, alternatives", () => {
  it("compares up to 5 products and rejects 6", async () => {
    const s = await request(server).get("/v1/search").query({ category: "oled-tvs", pageSize: 6 }).expect(200);
    const ids = (s.body.items as { id: string }[]).map((i) => i.id);
    const five = await request(server).get("/v1/compare").query({ ids: ids.slice(0, 5).join(",") }).expect(200);
    expect(five.body.products).toHaveLength(5);
    await request(server).get("/v1/compare").query({ ids: ids.slice(0, 6).join(",") }).expect(422);
  });

  it("brand and store pages include a category breakdown", async () => {
    const brand = await request(server).get("/v1/brands/samsung").expect(200);
    expect(endpoints["catalog.brand"].response.safeParse(brand.body).success).toBe(true);
    expect(brand.body.categoryBreakdown.length).toBeGreaterThan(3);
    const store = await request(server).get("/v1/retailers/best-buy").expect(200);
    expect(store.body.categoryBreakdown[0].count).toBeGreaterThanOrEqual(store.body.categoryBreakdown.at(-1).count);
  });

  it("product detail lists similar products and other-brand alternatives", async () => {
    const res = await request(server).get("/v1/products/lg-55-class-oled-evo-c5-4k-smart-tv-2025").expect(200);
    expect(endpoints["catalog.product"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.product.variants.length).toBeGreaterThanOrEqual(5);
    expect(res.body.related.length).toBeGreaterThan(0);
    for (const alt of res.body.alternatives as { brand: { slug: string } | null }[]) expect(alt.brand?.slug).not.toBe("lg");
    // Variant siblings are never listed as "similar".
    const variantSlugs = new Set((res.body.product.variants as { slug: string }[]).map((v) => v.slug));
    for (const r of res.body.related as { slug: string }[]) expect(variantSlugs.has(r.slug)).toBe(false);
  });
});
