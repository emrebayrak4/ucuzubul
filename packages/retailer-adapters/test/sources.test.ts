import { describe, expect, it } from "vitest";
import {
  Channel3Client,
  IcecatClient,
  PRODUCT_SOURCE_REGISTRY,
  PendingConfigurationError,
  channel3RetailerId,
  validateListing,
} from "../src/index";
import { fakeClock, fixture, mockFetch } from "./helpers";

const rl = { rateLimit: { capacity: 100, refillPerSecond: 100 }, retry: { retries: 0, baseDelayMs: 1, maxDelayMs: 1 } };
const C3_ENV = { CHANNEL3_API_KEY: "test-key" };
const ICECAT_ENV = { ICECAT_SHOPNAME: "test-shop" };

describe("Channel3 (multi-retailer product search)", () => {
  it("reports pending_configuration and throws a typed error without an API key", async () => {
    const c = new Channel3Client({ env: {} });
    expect(c.status()).toBe("pending_configuration");
    expect(c.missingEnv()).toEqual(["CHANNEL3_API_KEY"]);
    await expect(c.search({ query: "headphones" })).rejects.toBeInstanceOf(PendingConfigurationError);
    await expect(c.getProduct("TstA001")).rejects.toBeInstanceOf(PendingConfigurationError);
    expect(await c.healthCheck()).toMatchObject({ status: "pending_configuration", ok: false });
  });

  it("posts the query, key, filters and page token to /v1/search", async () => {
    const f = mockFetch([{ match: "/v1/search", body: fixture("channel3-search.json") }]);
    const c = new Channel3Client({ env: C3_ENV, fetch: f, clock: fakeClock(), http: rl });
    await c.search({ query: "acme nc-500", limit: 10, minPriceCents: 5000, maxPriceCents: 40050, websites: ["macys.com"], inStockOnly: true }, "tok_1");
    expect(f.calls).toHaveLength(1);
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api.trychannel3.com/v1/search");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers?.["x-api-key"]).toBe("test-key");
    expect(JSON.parse(call.init.body as string)).toEqual({
      query: "acme nc-500",
      limit: 10,
      page_token: "tok_1",
      filters: { price: { min_price: 50, max_price: 400.5 }, website_ids: ["macys.com"], availability: ["InStock", "LimitedAvailability"] },
    });
  });

  it("maps products and every priced offer, dropping unusable products and zero prices", async () => {
    const f = mockFetch([{ match: "/v1/search", body: fixture("channel3-search.json") }]);
    const c = new Channel3Client({ env: C3_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.search({ query: "acme" });
    expect(page.next).toBe("tok_page_2");
    expect(page.items).toHaveLength(1);
    const p = page.items[0]!;
    expect(p).toMatchObject({
      id: "TstA001",
      title: "Acme NC-500 Wireless Noise Cancelling Headphones",
      brand: "Acme",
      imageUrl: "https://cdn.example.test/a-hero.jpg",
      categoryPath: ["Electronics", "Audio", "Headphones"],
      attributes: { color: "black", connectivity: "bluetooth" },
    });
    expect(p.offers).toEqual([
      { domain: "macys.com", retailerId: "macys", priceCents: 30041, listPriceCents: 39800, currency: "USD", availability: "in_stock", condition: "new", affiliateUrl: "https://buy.example.test/c3/aaa111", maxCommissionRate: 0.04 },
      { domain: "smallshop.example", retailerId: null, priceCents: 24950, listPriceCents: null, currency: "USD", availability: "out_of_stock", condition: "used", affiliateUrl: "https://buy.example.test/c3/aaa222", maxCommissionRate: 0 },
      { domain: "bestbuy.com", retailerId: "bestbuy", priceCents: 32999, listPriceCents: null, currency: "USD", availability: "limited", condition: "unknown", affiliateUrl: "https://buy.example.test/c3/aaa333", maxCommissionRate: 0.01 },
    ]);
    expect(page.warnings.some((w) => w.includes("broken.example"))).toBe(true);
  });

  it("turns one product into one valid listing per offer, keyed by retailer", async () => {
    const f = mockFetch([{ match: "/v1/search", body: fixture("channel3-search.json") }]);
    const c = new Channel3Client({ env: C3_ENV, fetch: f, clock: fakeClock(), http: rl });
    const [p] = (await c.search({ query: "acme" })).items;
    const listings = c.toListings(p!);
    expect(listings.map((l) => [l.product.retailerId, l.product.retailerSku])).toEqual([
      ["macys", "c3:TstA001"],
      ["smallshop.example", "c3:TstA001:used"],
      ["bestbuy", "c3:TstA001:unknown"],
    ]);
    const first = listings[0]!;
    expect(first.offer).toMatchObject({ priceCents: 30041, listPriceCents: 39800, source: "affiliate", sellerName: "macys.com", productUrl: null, affiliateUrl: "https://buy.example.test/c3/aaa111", observedAt: "2026-11-26T12:00:00.000Z" });
    expect(first.product.gtin).toBeNull();
    for (const l of listings) expect(validateListing(l).valid).toBe(true);
  });

  it("maps known store domains to our retailer ids", () => {
    expect(channel3RetailerId("www.target.com")).toBe("target");
    expect(channel3RetailerId("homedepot.com")).toBe("homedepot");
    expect(channel3RetailerId("WALMART.COM")).toBe("walmart");
    expect(channel3RetailerId("example.org")).toBeNull();
  });

  it("returns null for an unknown product id and flips to error on a rejected key", async () => {
    const notFound = mockFetch([{ match: "/v1/products/", status: 404, body: { detail: "Not found" } }]);
    const c = new Channel3Client({ env: C3_ENV, fetch: notFound, clock: fakeClock(), http: rl });
    expect(await c.getProduct("nope")).toBeNull();

    const denied = mockFetch([{ match: "/v1/search", status: 401, body: { detail: "Invalid API key" } }]);
    const d = new Channel3Client({ env: C3_ENV, fetch: denied, clock: fakeClock(), http: rl });
    await expect(d.search({ query: "x" })).rejects.toThrow();
    expect(d.status()).toBe("error");
  });

  it("health check uses the free websites search endpoint", async () => {
    const f = mockFetch([{ match: "/v1/websites/search", body: { websites: [{ id: "p1PB", domain: "bestbuy.com" }] } }]);
    const c = new Channel3Client({ env: C3_ENV, fetch: f, clock: fakeClock(), http: rl });
    expect(await c.healthCheck()).toMatchObject({ status: "live", ok: true });
    expect(f.calls[0]!.url).toContain("https://api.trychannel3.com/v1/websites/search?query=");
    expect(f.calls[0]!.init.headers?.["x-api-key"]).toBe("test-key");
  });
});

describe("Open Icecat (product specs and licensed images)", () => {
  it("reports pending_configuration without a shop name", async () => {
    const c = new IcecatClient({ env: {} });
    expect(c.status()).toBe("pending_configuration");
    await expect(c.lookup({ gtin: "0012345678905" })).rejects.toBeInstanceOf(PendingConfigurationError);
  });

  it("looks a product up by GTIN with the shop name and maps title, codes, images and specs", async () => {
    const f = mockFetch([{ match: "live.icecat.biz/api", body: fixture("icecat-product.json") }]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    const p = await c.lookup({ gtin: "0012345678905" });
    const url = new URL(f.calls[0]!.url);
    expect(url.origin + url.pathname).toBe("https://live.icecat.biz/api");
    expect(Object.fromEntries(url.searchParams)).toEqual({ lang: "en", shopname: "test-shop", GTIN: "0012345678905" });
    expect(p).toEqual({
      icecatId: "987654321",
      title: "Acme Phone X1 15.8 cm (6.2\") 8 GB 128 GB Black",
      shortTitle: "Acme Phone X1",
      brand: "Acme",
      productCode: "AX1-128-BK",
      gtins: ["0012345678905"],
      category: "Smartphones",
      summary: "Acme Phone X1, 6.2\", 8 GB, 128 GB, Black",
      description: "Synthetic long description for tests.",
      images: [
        { url: "https://images.example.test/gallery/x1-front.jpg", thumbUrl: "https://images.example.test/gallery_thumbs/x1-front.jpg", width: 4500, height: 3000 },
        { url: "https://images.example.test/gallery/x1-back.jpg", thumbUrl: "https://images.example.test/gallery_thumbs/x1-back.jpg", width: 4500, height: 3000 },
      ],
      specs: { "Display diagonal": "15.8 cm (6.2\")", "Display resolution": "2340 x 1080 pixels", "RAM capacity": "8 GB" },
      source: "icecat",
    });
  });

  it("sends brand + product code or an Icecat id when there is no GTIN", async () => {
    const f = mockFetch([{ match: "live.icecat.biz/api", body: fixture("icecat-product.json") }]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    await c.lookup({ brand: "Acme", productCode: "AX1-128-BK" });
    await c.lookup({ icecatId: "987654321" }, "de");
    expect(Object.fromEntries(new URL(f.calls[0]!.url).searchParams)).toEqual({ lang: "en", shopname: "test-shop", Brand: "Acme", ProductCode: "AX1-128-BK" });
    expect(Object.fromEntries(new URL(f.calls[1]!.url).searchParams)).toEqual({ lang: "de", shopname: "test-shop", icecat_id: "987654321" });
  });

  it("returns null when Icecat has no (released) datasheet", async () => {
    for (const body of [
      { StatusCode: 16, Code: 400, Error: "Bad Request", Message: "The GTIN can not be found" },
      { StatusCode: 9, Code: 400, Error: "Bad Request", Message: "Products datasheet is not yet released" },
    ]) {
      const f = mockFetch([{ match: "live.icecat.biz/api", status: 400, body }]);
      const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
      expect(await c.lookup({ gtin: "0012345678905" })).toBeNull();
    }
  });

  it("returns null for Full-Icecat-only products without flagging the account", async () => {
    const f = mockFetch([{ match: "live.icecat.biz/api", status: 403, body: { StatusCode: 9, Code: 403, Error: "Forbidden", Message: "To access Full Icecat content, an app_key is required." } }]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    expect(await c.lookup({ gtin: "0012345678905" })).toBeNull();
    expect(c.status()).toBe("live");
    expect(await c.healthCheck()).toMatchObject({ status: "live", ok: true });
  });

  it("treats an unknown shop name as a credentials error", async () => {
    const f = mockFetch([{ match: "live.icecat.biz/api", status: 404, body: { StatusCode: 3, Code: 404, Error: "Not Found", Message: "test-shop the Icecat user is unknown" } }]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    const h = await c.healthCheck();
    expect(h).toMatchObject({ status: "error", ok: false });
    expect(c.status()).toBe("error");
  });

  it("health check passes when the account is known even if the probe GTIN is missing", async () => {
    const f = mockFetch([{ match: "live.icecat.biz/api", status: 400, body: { StatusCode: 16, Code: 400, Message: "The GTIN can not be found" } }]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    expect(await c.healthCheck()).toMatchObject({ status: "live", ok: true });
  });

  it("rejects a malformed GTIN before calling the API", async () => {
    const f = mockFetch([]);
    const c = new IcecatClient({ env: ICECAT_ENV, fetch: f, clock: fakeClock(), http: rl });
    await expect(c.lookup({ gtin: "123" })).rejects.toBeInstanceOf(RangeError);
    expect(f.calls).toHaveLength(0);
  });
});

describe("product source registry", () => {
  it("lists Channel3 and Icecat with their env keys and factories", () => {
    expect(PRODUCT_SOURCE_REGISTRY.map((s) => [s.id, s.requiredEnv])).toEqual([
      ["channel3", ["CHANNEL3_API_KEY"]],
      ["icecat", ["ICECAT_SHOPNAME"]],
    ]);
    for (const s of PRODUCT_SOURCE_REGISTRY) expect(s.create({ env: {} }).status()).toBe("pending_configuration");
  });
});
