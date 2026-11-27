import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  COMMERCE_PROVIDERS,
  UnsafeUrlError,
  assertPublicHttpsUrl,
  assertSafeHttpsUrl,
  buildShopifyAuthorizeUrl,
  createCommerceConnector,
  exchangeShopifyCode,
  isPrivateAddress,
  nextScheduledFetch,
  parseGoogleMerchantFeed,
  stockFromQuantity,
  validateShopDomain,
  verifyShopifyHmac,
  type CommerceProvider,
} from "../src/index";
import { fakeClock, fixture, fixtureText, mockFetch } from "./helpers";

const U1 = "012345678905";
const http = { rateLimit: { capacity: 100, refillPerSecond: 100 }, retry: { retries: 0 } };
const publicDns = async (): Promise<string[]> => ["93.184.216.34"];

describe("commerce: pending configuration (no network)", () => {
  for (const meta of COMMERCE_PROVIDERS) {
    it(`${meta.id}: missing config => pending_configuration, no fetch`, async () => {
      const f = mockFetch([]);
      const c = createCommerceConnector(meta.id, {}, { fetch: f, resolveHost: publicDns });
      expect(c.provider).toBe(meta.id);
      expect(c.status()).toBe("pending_configuration");
      expect(c.missingConfig()).toEqual([...meta.requiredConfig]);
      expect([...c.requiredConfig]).toEqual([...meta.requiredConfig]);
      const r = await c.sync();
      expect(r).toMatchObject({ provider: meta.id, status: "pending_configuration", products: [], locations: [] });
      expect(f.calls).toHaveLength(0);
    });
  }

  it("blank values count as missing", () => {
    const c = createCommerceConnector("shopify", { shopDomain: "a.myshopify.com", accessToken: "   " });
    expect(c.missingConfig()).toEqual(["accessToken"]);
  });

  it("metadata covers all providers", () => {
    const ids: CommerceProvider[] = ["shopify", "woocommerce", "square", "clover", "google_merchant"];
    expect(COMMERCE_PROVIDERS.map((p) => p.id)).toEqual(ids);
    for (const p of COMMERCE_PROVIDERS) expect(p.docsUrl).toMatch(/^https:\/\//);
  });

  it("stock buckets", () => {
    expect([null, -1, 0, 1, 3, 4].map((q) => stockFromQuantity(q))).toEqual(["unknown", "out_of_stock", "out_of_stock", "low_stock", "low_stock", "in_stock"]);
  });
});

describe("Shopify", () => {
  const cfg = { shopDomain: "acme-test.myshopify.com", accessToken: "shpat_test", defaultCondition: "new" };

  it("maps variants, per-location inventory, locations and cursor", async () => {
    const f = mockFetch([{ match: "/admin/api/2025-10/graphql.json", body: fixture("shopify-product-variants.json") }]);
    const c = createCommerceConnector("shopify", cfg, { fetch: f, clock: fakeClock(), http });
    const r = await c.sync({ limit: 25 });
    expect(r.status).toBe("ok");
    expect(f.calls[0]?.init.headers["X-Shopify-Access-Token"]).toBe("shpat_test");
    const body = JSON.parse(f.calls[0]?.init.body ?? "{}") as { query: string; variables: Record<string, unknown> };
    expect(body.variables).toEqual({ first: 25, after: null });
    expect(body.query).toContain("locations(first: 100)");
    expect(body.query).toContain('quantities(names: ["available"])');
    expect(r.nextCursor).toBe("eyJsYXN0X2lkIjoxMDAzfQ==");
    expect(r.products).toHaveLength(2); // draft product skipped
    const [a, b] = r.products;
    expect(a).toMatchObject({
      externalId: "gid://shopify/ProductVariant/1001",
      sku: "ACME-X100",
      title: "Acme X100 Headphones",
      brand: "Acme",
      gtin: U1,
      priceCents: 1299,
      listPriceCents: 1999,
      currency: "USD",
      url: "https://acme-test.myshopify.com/products/x100?variant=1001",
      imageUrl: "https://cdn.shopify.com/s/files/test/x100.jpg",
      condition: "new",
    });
    expect(a?.inventory).toEqual([
      { locationExternalId: "gid://shopify/Location/1", quantity: 12, stock: "in_stock" },
      { locationExternalId: "gid://shopify/Location/2", quantity: 2, stock: "low_stock" },
    ]);
    expect(b).toMatchObject({ title: "Acme Case - Red", priceCents: 435, gtin: null, listPriceCents: null, url: null });
    expect(b?.inventory).toEqual([{ locationExternalId: null, quantity: null, stock: "unknown" }]);
    expect(r.locations).toHaveLength(2);
    expect(r.locations[0]).toEqual({
      externalId: "gid://shopify/Location/1",
      name: "Austin Store",
      address1: "100 Congress Ave",
      city: "Austin",
      state: "TX",
      zip: "78701",
      lat: 30.2672,
      lng: -97.7431,
      phone: "+15125550100",
    });
  });

  it("next page sends the cursor and skips locations", async () => {
    const f = mockFetch([{ match: "graphql.json", body: fixture("shopify-product-variants.json") }]);
    const c = createCommerceConnector("shopify", cfg, { fetch: f, clock: fakeClock(), http });
    const r = await c.sync({ cursor: "abc" });
    const body = JSON.parse(f.calls[0]?.init.body ?? "{}") as { query: string; variables: Record<string, unknown> };
    expect(body.variables.after).toBe("abc");
    expect(body.query).not.toContain("locations(");
    expect(r.locations).toEqual([]);
  });

  it("GraphQL errors and auth failures become status error", async () => {
    const f = mockFetch([{ match: "graphql.json", body: { errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }] } }]);
    const r = await createCommerceConnector("shopify", cfg, { fetch: f, clock: fakeClock(), http }).sync();
    expect(r).toMatchObject({ status: "error", products: [] });
    expect(r.message).toContain("Throttled");
    const f2 = mockFetch([{ match: "graphql.json", status: 401, body: { errors: "Invalid API key" } }]);
    const r2 = await createCommerceConnector("shopify", cfg, { fetch: f2, clock: fakeClock(), http }).sync();
    expect(r2).toMatchObject({ status: "error", message: "Authentication failed (HTTP 401)" });
  });

  it("rejects non-myshopify domains without calling out", async () => {
    expect(() => validateShopDomain("evil.example.com")).toThrow(RangeError);
    expect(() => validateShopDomain("acme.myshopify.com.evil.io")).toThrow(RangeError);
    expect(validateShopDomain("https://Acme-Test.myshopify.com/")).toBe("acme-test.myshopify.com");
    const f = mockFetch([]);
    const r = await createCommerceConnector("shopify", { shopDomain: "shop.example.com", accessToken: "t" }, { fetch: f }).sync();
    expect(r.status).toBe("error");
    expect(f.calls).toHaveLength(0);
  });

  it("builds the authorize URL with scopes and state", () => {
    const u = new URL(buildShopifyAuthorizeUrl({ shop: "acme-test.myshopify.com", apiKey: "key123", redirectUri: "https://api.example.com/cb", state: "nonce-1" }));
    expect(u.origin + u.pathname).toBe("https://acme-test.myshopify.com/admin/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("key123");
    expect(u.searchParams.get("scope")).toBe("read_products,read_inventory,read_locations");
    expect(u.searchParams.get("state")).toBe("nonce-1");
    expect(u.searchParams.get("redirect_uri")).toBe("https://api.example.com/cb");
    expect(() => buildShopifyAuthorizeUrl({ shop: "x.com", apiKey: "k", redirectUri: "https://a/cb", state: "s" })).toThrow();
  });

  it("verifies callback HMAC and rejects tampering", () => {
    const secret = "shpss_test_secret";
    const params = { code: "0907a61c0c8d55e99db179b68161bc00", host: "YWNtZS10ZXN0Lm15c2hvcGlmeS5jb20vYWRtaW4=", shop: "acme-test.myshopify.com", state: "nonce-1", timestamp: "1764158400" };
    const message = new URLSearchParams(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1))).toString();
    const hmac = createHmac("sha256", secret).update(message).digest("hex");
    expect(verifyShopifyHmac({ ...params, hmac }, secret)).toBe(true);
    expect(verifyShopifyHmac(new URLSearchParams({ ...params, hmac }), secret)).toBe(true);
    expect(verifyShopifyHmac({ ...params, shop: "evil.myshopify.com", hmac }, secret)).toBe(false);
    expect(verifyShopifyHmac({ ...params, hmac }, "wrong-secret")).toBe(false);
    expect(verifyShopifyHmac({ ...params, hmac: hmac.slice(0, 63) }, secret)).toBe(false);
    expect(verifyShopifyHmac(params, secret)).toBe(false);
  });

  it("exchanges the code for a token", async () => {
    const f = mockFetch([{ match: "https://acme-test.myshopify.com/admin/oauth/access_token", body: { access_token: "shpat_new", scope: "read_products,read_inventory,read_locations" } }]);
    const t = await exchangeShopifyCode({ shop: "acme-test.myshopify.com", apiKey: "k", apiSecret: "s", code: "c" }, { fetch: f });
    expect(t).toEqual({ accessToken: "shpat_new", scope: ["read_products", "read_inventory", "read_locations"] });
    expect(f.calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(f.calls[0]?.init.body ?? "{}")).toEqual({ client_id: "k", client_secret: "s", code: "c" });
  });
});

describe("WooCommerce", () => {
  const cfg = { storeUrl: "https://shop.example.com/", consumerKey: "ck_test", consumerSecret: "cs_test" };

  it("maps products, sale prices, stock and page cursor", async () => {
    const f = mockFetch([
      { match: "/wp-json/wc/v3/data/currencies/current", body: fixture("woocommerce-currency.json") },
      { match: "/wp-json/wc/v3/products?", body: fixture("woocommerce-products.json"), headers: { "X-WP-TotalPages": "3", "X-WP-Total": "7" } },
    ]);
    const c = createCommerceConnector("woocommerce", cfg, { fetch: f, clock: fakeClock(), http, resolveHost: publicDns });
    const r = await c.sync({ limit: 3 });
    expect(r.status).toBe("ok");
    const call = f.calls[1];
    expect(call?.url).toBe("https://shop.example.com/wp-json/wc/v3/products?per_page=3&page=1&status=publish");
    expect(call?.init.headers.Authorization).toBe(`Basic ${Buffer.from("ck_test:cs_test").toString("base64")}`);
    expect(r.nextCursor).toBe("2");
    expect(r.locations).toEqual([]);
    expect(r.products).toHaveLength(2); // priceless product skipped
    expect(r.products[0]).toMatchObject({
      externalId: "501",
      sku: "MUG-1",
      title: "Acme Mug",
      description: "Ceramic & dishwasher safe",
      brand: "Acme",
      gtin: U1,
      priceCents: 899,
      listPriceCents: 1299,
      currency: "USD",
      url: "https://shop.example.com/product/acme-mug/",
      imageUrl: "https://shop.example.com/wp-content/uploads/mug.jpg",
      condition: "unknown",
      inventory: [{ locationExternalId: null, quantity: 2, stock: "low_stock" }],
    });
    expect(r.products[1]).toMatchObject({ priceCents: 2010, listPriceCents: null, inventory: [{ locationExternalId: null, quantity: null, stock: "out_of_stock" }] });
  });

  it("last page has no cursor", async () => {
    const f = mockFetch([
      { match: "/currencies/current", body: fixture("woocommerce-currency.json") },
      { match: "/wc/v3/products?", body: [], headers: { "X-WP-TotalPages": "3" } },
    ]);
    const r = await createCommerceConnector("woocommerce", cfg, { fetch: f, clock: fakeClock(), http, resolveHost: publicDns }).sync({ cursor: "3" });
    expect(f.calls[1]?.url).toContain("page=3");
    expect(r.nextCursor).toBeNull();
  });

  it("rejects http:// and private store URLs without fetching", async () => {
    for (const storeUrl of ["http://shop.example.com", "https://localhost", "https://192.168.0.10"]) {
      const f = mockFetch([]);
      const r = await createCommerceConnector("woocommerce", { ...cfg, storeUrl }, { fetch: f, resolveHost: publicDns }).sync();
      expect(r.status).toBe("error");
      expect(f.calls).toHaveLength(0);
    }
  });
});

describe("Square", () => {
  it("maps catalog variations, per-location counts, locations and cursor", async () => {
    const f = mockFetch([
      { match: "/v2/locations", body: fixture("square-locations.json") },
      { match: "/v2/catalog/list", body: fixture("square-catalog-list.json") },
      { match: "/v2/inventory/counts/batch-retrieve", body: fixture("square-inventory-counts.json") },
    ]);
    const c = createCommerceConnector("square", { accessToken: "EAAA_test", defaultCondition: "new" }, { fetch: f, clock: fakeClock(), http });
    const r = await c.sync();
    expect(r.status).toBe("ok");
    expect(f.calls[0]?.url).toBe("https://connect.squareup.com/v2/locations");
    expect(f.calls[0]?.init.headers.Authorization).toBe("Bearer EAAA_test");
    expect(f.calls[0]?.init.headers["Square-Version"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(f.calls[1]?.url).toBe("https://connect.squareup.com/v2/catalog/list?types=ITEM%2CIMAGE");
    const inv = JSON.parse(f.calls[2]?.init.body ?? "{}") as Record<string, unknown>;
    expect(inv).toEqual({ catalog_object_ids: ["VAR1", "VAR2", "VAR3", "VAR4"], states: ["IN_STOCK"], location_ids: ["L1"] });
    expect(r.nextCursor).toBe("CURSOR-PAGE-2");
    expect(r.locations).toEqual([
      { externalId: "L1", name: "Downtown", address1: "1 Main St", city: "Austin", state: "TX", zip: "78701", lat: 30.2669, lng: -97.7428, phone: "+1 512-555-0101" },
    ]);
    expect(r.products.map((p) => p.externalId)).toEqual(["VAR1", "VAR3", "VAR4"]); // variable pricing skipped
    expect(r.products[0]).toMatchObject({
      title: "Cold Brew - Small",
      sku: "CB-S",
      gtin: U1,
      priceCents: 450,
      currency: "USD",
      url: "https://test-coffee.square.site/product/cold-brew/1",
      imageUrl: "https://items-images-production.s3.us-west-2.amazonaws.com/files/test/cold-brew.jpg",
      condition: "new",
      inventory: [{ locationExternalId: "L1", quantity: 7, stock: "in_stock" }],
    });
    expect(r.products[1]?.inventory).toEqual([{ locationExternalId: "L1", quantity: 1, stock: "low_stock" }]);
    expect(r.products[2]?.inventory).toEqual([{ locationExternalId: null, quantity: null, stock: "unknown" }]);
  });

  it("sandbox host and cursor; later pages omit locations", async () => {
    const f = mockFetch([
      { match: "/v2/locations", body: fixture("square-locations.json") },
      { match: "/v2/catalog/list", body: { objects: [] } },
    ]);
    const r = await createCommerceConnector("square", { accessToken: "t", environment: "sandbox" }, { fetch: f, clock: fakeClock(), http }).sync({ cursor: "CURSOR-PAGE-2" });
    expect(f.calls[1]?.url).toBe("https://connect.squareupsandbox.com/v2/catalog/list?types=ITEM%2CIMAGE&cursor=CURSOR-PAGE-2");
    expect(r).toMatchObject({ status: "ok", products: [], locations: [], nextCursor: null });
  });
});

describe("Clover", () => {
  it("maps items (cents), merchant location and offset cursor", async () => {
    const f = mockFetch([
      { match: "/v3/merchants/MID123ABC/items", body: fixture("clover-items.json") },
      { match: "/v3/merchants/MID123ABC?expand=address", body: fixture("clover-merchant.json") },
    ]);
    const c = createCommerceConnector("clover", { merchantId: "MID123ABC", accessToken: "clv_test" }, { fetch: f, clock: fakeClock(), http });
    const r = await c.sync({ limit: 3 });
    expect(r.status).toBe("ok");
    expect(f.calls[0]?.url).toBe("https://api.clover.com/v3/merchants/MID123ABC?expand=address,properties");
    expect(f.calls[1]?.url).toBe("https://api.clover.com/v3/merchants/MID123ABC/items?expand=itemStock&limit=3&offset=0");
    expect(f.calls[1]?.init.headers.Authorization).toBe("Bearer clv_test");
    expect(r.nextCursor).toBe("3");
    expect(r.locations).toEqual([
      { externalId: "MID123ABC", name: "Corner Store", address1: "500 Lamar Blvd", city: "Austin", state: "TX", zip: "78703", lat: null, lng: null, phone: "512-555-0102" },
    ]);
    expect(r.products.map((p) => p.externalId)).toEqual(["ITM1", "ITM3"]); // per-unit pricing skipped
    expect(r.products[0]).toMatchObject({ sku: "BAT-AA4", gtin: U1, priceCents: 599, currency: "USD", condition: "unknown", inventory: [{ locationExternalId: "MID123ABC", quantity: 3, stock: "low_stock" }] });
    expect(r.products[1]?.inventory).toEqual([{ locationExternalId: "MID123ABC", quantity: null, stock: "out_of_stock" }]);
  });

  it("sandbox region, later page, short page ends pagination", async () => {
    const f = mockFetch([
      { match: "/items", body: { elements: [] } },
      { match: "/v3/merchants/M1?", body: fixture("clover-merchant.json") },
    ]);
    const r = await createCommerceConnector("clover", { merchantId: "M1", accessToken: "t", region: "sandbox" }, { fetch: f, clock: fakeClock(), http }).sync({ cursor: "100" });
    expect(f.calls.some((c) => c.url === "https://apisandbox.dev.clover.com/v3/merchants/M1/items?expand=itemStock&limit=100&offset=100")).toBe(true);
    expect(r).toMatchObject({ status: "ok", locations: [], nextCursor: null });
  });
});

describe("Google Merchant feed", () => {
  it("parses RSS 2.0 XML fixture", async () => {
    const f = mockFetch([{ match: "https://feeds.example.com/products.xml", body: fixtureText("google-merchant-feed.TEST-ONLY.xml") }]);
    const c = createCommerceConnector("google_merchant", { feedUrl: "https://feeds.example.com/products.xml" }, { fetch: f, clock: fakeClock(), resolveHost: publicDns });
    const r = await c.sync();
    expect(r.status).toBe("ok");
    expect(r.nextCursor).toBeNull();
    expect(r.products).toHaveLength(2);
    expect(r.products[0]).toMatchObject({
      externalId: "XML-1",
      title: "Acme X100 Headphones & Case",
      url: "https://shop.example.com/p/xml-1",
      imageUrl: "https://shop.example.com/i/xml-1.jpg",
      priceCents: 16999,
      listPriceCents: 19999,
      currency: "USD",
      brand: "Acme",
      gtin: U1,
      mpn: "X100-BLK",
      condition: "new",
      inventory: [{ locationExternalId: null, quantity: null, stock: "in_stock" }],
    });
    // expired sale ignored
    expect(r.products[1]).toMatchObject({ priceCents: 5000, listPriceCents: null, condition: "used", inventory: [{ locationExternalId: null, quantity: null, stock: "out_of_stock" }] });
  });

  it("parses TSV and skips rows without a currency", () => {
    const { products, skipped } = parseGoogleMerchantFeed(fixtureText("google-merchant-feed.TEST-ONLY.tsv"), Date.parse("2026-11-26T12:00:00Z"));
    expect(skipped).toBe(1);
    expect(products.map((p) => [p.externalId, p.priceCents, p.listPriceCents, p.condition, p.inventory[0]?.stock])).toEqual([
      ["TSV-1", 3999, null, "refurbished", "in_stock"],
      ["TSV-3", 715, 995, "new", "low_stock"],
    ]);
    expect(products[0]?.gtin).toBe(U1);
  });

  it("SSRF guard rejects http, localhost and private addresses", () => {
    for (const bad of [
      "http://feeds.example.com/f.xml",
      "https://localhost/f.xml",
      "https://foo.localhost/f.xml",
      "https://127.0.0.1/f.xml",
      "https://2130706433/f.xml",
      "https://10.1.2.3/f.xml",
      "https://192.168.1.20/f.xml",
      "https://172.16.5.5/f.xml",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/f.xml",
      "https://[fd00::1]/f.xml",
      "https://user:pw@feeds.example.com/f.xml",
      "ftp://feeds.example.com/f.xml",
      "not a url",
    ]) expect(() => assertSafeHttpsUrl(bad), bad).toThrow(UnsafeUrlError);
    expect(assertSafeHttpsUrl("https://feeds.example.com/f.xml").hostname).toBe("feeds.example.com");
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
  });

  it("rejects hostnames that resolve to private IPs and unsafe redirects", async () => {
    await expect(assertPublicHttpsUrl("https://internal.example.com/f.xml", async () => ["10.0.0.5"])).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpsUrl("https://feeds.example.com/f.xml", publicDns)).resolves.toBeInstanceOf(URL);

    const f = mockFetch([{ match: "feeds.example.com", status: 302, body: "", headers: { Location: "https://127.0.0.1/admin" } }]);
    const r = await createCommerceConnector("google_merchant", { feedUrl: "https://feeds.example.com/f.xml" }, { fetch: f, resolveHost: publicDns }).sync();
    expect(r.status).toBe("error");
    expect(f.calls).toHaveLength(1);
  });

  it("connector refuses unsafe URLs without fetching", async () => {
    for (const feedUrl of ["http://feeds.example.com/f.xml", "https://localhost/f.xml", "https://127.0.0.1/f.xml", "https://10.0.0.8/f.xml", "https://192.168.1.1/f.xml"]) {
      const f = mockFetch([]);
      const r = await createCommerceConnector("google_merchant", { feedUrl }, { fetch: f, resolveHost: publicDns }).sync();
      expect(r.status, feedUrl).toBe("error");
      expect(f.calls).toHaveLength(0);
    }
  });

  it("enforces the max response size", async () => {
    const f = mockFetch([{ match: "feeds.example.com", body: "x".repeat(2048), headers: { "Content-Length": "2048" } }]);
    const r = await createCommerceConnector("google_merchant", { feedUrl: "https://feeds.example.com/f.xml" }, { fetch: f, resolveHost: publicDns, maxBytes: 1024 }).sync();
    expect(r.status).toBe("error");
    expect(r.message).toContain("exceeds");
  });

  it("nextScheduledFetch", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    expect(nextScheduledFetch(null, 24, now)).toEqual(now);
    expect(nextScheduledFetch("2026-11-26T06:00:00Z", 24, now).toISOString()).toBe("2026-11-27T06:00:00.000Z");
    expect(nextScheduledFetch(new Date("2026-11-26T06:00:00Z"), 6).toISOString()).toBe("2026-11-26T12:00:00.000Z");
    expect(nextScheduledFetch("garbage", 24, now)).toEqual(now);
    expect(() => nextScheduledFetch(null, 0)).toThrow(RangeError);
  });
});
