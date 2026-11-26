import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AmazonCreatorsAdapter,
  BestBuyAdapter,
  EbayBrowseAdapter,
  KrogerAdapter,
  PendingConfigurationError,
  WalmartAffiliateAdapter,
  bestBuySearchFilter,
  ebayCondition,
  krogerGtin,
  normalizePem,
  validateListing,
  walmartAuthHeaders,
} from "../src/index";
import { fakeClock, fixture, mockFetch } from "./helpers";

const U1 = "012345678905";
const rl = { rateLimit: { capacity: 100, refillPerSecond: 100 } };

describe("pending configuration (no credentials => no data, typed error)", () => {
  const adapters = [
    new AmazonCreatorsAdapter({ env: {} }),
    new WalmartAffiliateAdapter({ env: {} }),
    new BestBuyAdapter({ env: {} }),
    new EbayBrowseAdapter({ env: {} }),
    new KrogerAdapter({ env: {} }),
  ];
  for (const a of adapters) {
    it(`${a.id}: status pending_configuration and fetch throws`, async () => {
      expect(a.status()).toBe("pending_configuration");
      expect(a.missingEnv()).toEqual([...a.requiredEnv]);
      await expect(a.fetchProducts({ keywords: "tv" })).rejects.toBeInstanceOf(PendingConfigurationError);
      await expect(a.fetchOffers({ keywords: "tv" })).rejects.toBeInstanceOf(PendingConfigurationError);
      await expect(a.fetchProductDetails("1")).rejects.toBeInstanceOf(PendingConfigurationError);
      await expect(a.fetchAvailability(["1"])).rejects.toBeInstanceOf(PendingConfigurationError);
      const h = await a.healthCheck();
      expect(h).toMatchObject({ status: "pending_configuration", ok: false });
    });
  }

  it("PendingConfigurationError lists missing env", async () => {
    const a = new BestBuyAdapter({ env: { BESTBUY_API_KEY: "  " } });
    const err = await a.fetchProducts({ keywords: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PendingConfigurationError);
    expect((err as PendingConfigurationError).missingEnv).toEqual(["BESTBUY_API_KEY"]);
    expect((err as PendingConfigurationError).code).toBe("PENDING_CONFIGURATION");
  });
});

describe("Amazon Creators API", () => {
  const env = {
    AMAZON_CREATORS_CREDENTIAL_ID: "id",
    AMAZON_CREATORS_CREDENTIAL_SECRET: "secret",
    AMAZON_CREATORS_CREDENTIAL_VERSION: "3.1",
    AMAZON_ASSOCIATE_TAG: "test-20",
  };

  it("gets a token, calls searchItems and maps OffersV2", async () => {
    const f = mockFetch([
      { match: "api.amazon.com/auth/o2/token", body: { access_token: "tok", expires_in: 3600 } },
      { match: "creatorsapi.amazon/catalog/v1/searchItems", body: fixture("amazon-search-items.json") },
    ]);
    const a = new AmazonCreatorsAdapter({ env, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProducts({ keywords: "headphones", maxPriceCents: 25000 });
    expect(a.status()).toBe("live");
    const tokenCall = f.calls[0];
    expect(JSON.parse(tokenCall?.init.body ?? "{}")).toMatchObject({ grant_type: "client_credentials", scope: "creatorsapi::default" });
    const call = f.calls[1];
    expect(call?.init.headers.Authorization).toBe("Bearer tok");
    expect(call?.init.headers["x-marketplace"]).toBe("www.amazon.com");
    expect(JSON.parse(call?.init.body ?? "{}")).toMatchObject({ keywords: "headphones", partnerTag: "test-20", maxPrice: 25000 });
    expect(r.data).toHaveLength(2);
    const [first, second] = r.data;
    expect(first?.product).toMatchObject({ retailerSku: "B0TEST0001", brand: "Acme", mpn: "X100-BLK", model: "X100", gtin: U1 });
    expect(first?.offer).toMatchObject({ priceCents: 19999, listPriceCents: 24999, availability: "in_stock", condition: "new", sellerName: "Amazon.com", source: "api" });
    expect(second?.offer).toBeNull(); // no listing => no invented price
    expect(r.freshness).toMatchObject({ provider: "amazon", source: "api", cached: false });
  });

  it("uses Cognito (v2.x) with Basic auth", async () => {
    const f = mockFetch([
      { match: "amazoncognito.com/oauth2/token", body: { access_token: "tok2", expires_in: 3600 } },
      { match: "getItems", body: { itemsResult: { items: [] } } },
    ]);
    const a = new AmazonCreatorsAdapter({ env: { ...env, AMAZON_CREATORS_CREDENTIAL_VERSION: "2.1" }, fetch: f, clock: fakeClock(), http: rl });
    await a.fetchProductDetails("B0TEST0001");
    expect(f.calls[0]?.init.headers.Authorization).toMatch(/^Basic /);
    expect(f.calls[0]?.init.body).toBe("grant_type=client_credentials&scope=creatorsapi%2Fdefault");
    expect(JSON.parse(f.calls[1]?.init.body ?? "{}")).toMatchObject({ itemIds: ["B0TEST0001"], itemIdType: "ASIN" });
  });

  it("builds tagged affiliate links only for amazon.com", () => {
    const a = new AmazonCreatorsAdapter({ env });
    expect(a.generateAffiliateLink("https://www.amazon.com/Some-Product/dp/b0test0001/ref=x", { subId: "c1" })).toBe("https://www.amazon.com/dp/B0TEST0001?tag=test-20&ascsubtag=c1");
    expect(a.generateAffiliateLink("https://evil.example/dp/B0TEST0001")).toBeNull();
  });

  it("auth failure flips status to error", async () => {
    const f = mockFetch([
      { match: "auth/o2/token", body: { access_token: "tok", expires_in: 3600 } },
      { match: "searchItems", status: 403, body: { errors: [{ code: "AccessDenied" }] } },
    ]);
    const a = new AmazonCreatorsAdapter({ env, fetch: f, clock: fakeClock(), http: rl });
    await expect(a.fetchProducts({ keywords: "x" })).rejects.toMatchObject({ status: 403 });
    expect(a.status()).toBe("error");
  });
});

describe("Walmart Affiliate API", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("signs requests with RSA-SHA256 over consumerId\\ntimestamp\\nkeyVersion\\n", () => {
    const h = walmartAuthHeaders("consumer-1", pem, "1", 1700000000000);
    expect(h["WM_CONSUMER.INTIMESTAMP"]).toBe("1700000000000");
    const v = createVerify("RSA-SHA256");
    v.update("consumer-1\n1700000000000\n1\n");
    expect(v.verify(publicKey, h["WM_SEC.AUTH_SIGNATURE"] as string, "base64")).toBe(true);
  });

  it("accepts PEMs with escaped newlines", () => {
    expect(normalizePem(pem.replace(/\n/g, "\\n"))).toBe(pem.trim());
    expect(normalizePem("QUJD")).toContain("-----BEGIN PRIVATE KEY-----\nQUJD\n");
  });

  it("maps search results", async () => {
    const f = mockFetch([{ match: "/affil/product/v2/search", body: fixture("walmart-search.json") }]);
    const a = new WalmartAffiliateAdapter({
      env: { WALMART_CONSUMER_ID: "c", WALMART_PRIVATE_KEY: pem, WALMART_KEY_VERSION: "1", WALMART_PUBLISHER_ID: "pub1" },
      fetch: f,
      clock: fakeClock(),
      http: rl,
    });
    const r = await a.fetchProducts({ keywords: "tv", pageSize: 10, page: 2 });
    const url = new URL(f.calls[0]?.url ?? "");
    expect(url.searchParams.get("query")).toBe("tv");
    expect(url.searchParams.get("start")).toBe("11");
    expect(url.searchParams.get("publisherId")).toBe("pub1");
    expect(f.calls[0]?.init.headers["WM_CONSUMER.ID"]).toBe("c");
    expect(r.data).toHaveLength(2);
    expect(r.data[0]?.product).toMatchObject({ retailerSku: "123456789", brand: "Acme", model: "A55U", categoryPath: ["Electronics", "TV & Video", "Smart TVs"], attributes: { color: "Black" } });
    expect(r.data[0]?.offer).toMatchObject({ priceCents: 29800, listPriceCents: 37999, availability: "in_stock", shippingCents: 0, affiliateUrl: "https://goto.walmart.com/c/TEST/123456789" });
    expect(r.data[1]?.offer).toBeNull();
  });
});

describe("Best Buy Products API", () => {
  it("builds the products() filter and maps fields", async () => {
    const f = mockFetch([{ match: "api.bestbuy.com/v1/products(", body: fixture("bestbuy-products.json") }]);
    const a = new BestBuyAdapter({ env: { BESTBUY_API_KEY: "k", BESTBUY_AFFILIATE_LINK_TEMPLATE: "https://aff.example/c?u={url}&s={subId}" }, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProducts({ keywords: "X100 headphones!", maxPriceCents: 20000 });
    expect(f.calls[0]?.url).toContain("products(search=x100&search=headphones&salePrice<=200.00)");
    expect(f.calls[0]?.url).toContain("format=json");
    expect(r.data[0]?.offer).toMatchObject({ priceCents: 17999, listPriceCents: 19999, availability: "in_stock", shippingCents: 0, condition: "new" });
    expect(r.data[0]?.offer?.affiliateUrl).toContain("https://aff.example/c?u=https%3A%2F%2Fwww.bestbuy.com");
    expect(r.data[0]?.product.categoryPath).toEqual(["Best Buy", "Headphones"]);
    expect(r.data[1]?.offer).toMatchObject({ condition: "refurbished", availability: "out_of_stock", shippingCents: 599, listPriceCents: null });
    expect(r.data[1]?.product.gtin).toBeNull();
  });

  it("looks up by UPC (EAN-13 with leading 0 converted)", async () => {
    const f = mockFetch([{ match: "api.bestbuy.com", body: { products: [] } }]);
    const a = new BestBuyAdapter({ env: { BESTBUY_API_KEY: "k" }, fetch: f, clock: fakeClock(), http: rl });
    await a.fetchProducts({ gtin: `0${U1}` });
    expect(f.calls[0]?.url).toContain(`products(upc=${U1})`);
    await expect(a.fetchProducts({ gtin: "123" })).rejects.toBeInstanceOf(RangeError);
    expect(a.generateAffiliateLink("https://www.bestbuy.com/x")).toBeNull();
  });

  it("sanitizes search terms", () => {
    expect(bestBuySearchFilter("OLED (65\") & more|stuff")).toBe("search=oled&search=65&search=more&search=stuff");
  });
});

describe("eBay Browse API", () => {
  const env = { EBAY_CLIENT_ID: "cid", EBAY_CLIENT_SECRET: "sec", EBAY_EPN_CAMPAIGN_ID: "5330000000" };

  it("searches with EPN context header and maps summaries", async () => {
    const f = mockFetch([
      { match: "/identity/v1/oauth2/token", body: { access_token: "etok", expires_in: 7200, token_type: "Application Access Token" } },
      { match: "/item_summary/search", body: fixture("ebay-search.json") },
    ]);
    const a = new EbayBrowseAdapter({ env, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProducts({ keywords: "x100", minPriceCents: 10000 });
    const search = f.calls[1];
    expect(search?.init.headers["X-EBAY-C-ENDUSERCTX"]).toBe("affiliateCampaignId=5330000000");
    expect(search?.init.headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");
    expect(new URL(search?.url ?? "").searchParams.get("filter")).toBe("buyingOptions:{FIXED_PRICE},priceCurrency:USD,price:[100.00..]");
    expect(r.data[0]?.offer).toMatchObject({ priceCents: 14950, listPriceCents: 19999, condition: "open_box", shippingCents: 0, sellerName: "test_seller" });
    expect(r.data[0]?.offer?.affiliateUrl).toContain("campid=5330000000");
    expect(r.data[1]?.offer).toBeNull(); // non-USD price is not converted
  });

  it("maps item details incl. GTIN and availability", async () => {
    const f = mockFetch([
      { match: "/identity/v1/oauth2/token", body: { access_token: "etok", expires_in: 7200 } },
      { match: "/buy/browse/v1/item/", body: fixture("ebay-item.json") },
    ]);
    const a = new EbayBrowseAdapter({ env, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProductDetails("v1|110000000003|0");
    expect(f.calls[1]?.url).toContain("/item/v1%7C110000000003%7C0");
    expect(r.data?.product).toMatchObject({ gtin: U1, brand: "Acme", mpn: "X100-BLK" });
    expect(r.data?.offer).toMatchObject({ availability: "limited", shippingCents: 795, condition: "new" });
    const av = await a.fetchAvailability(["v1|110000000003|0"]);
    expect(av.data[0]).toMatchObject({ availability: "limited", priceCents: 18900 });
  });

  it("generates EPN links and maps condition ids", () => {
    const a = new EbayBrowseAdapter({ env });
    const link = a.generateAffiliateLink("https://www.ebay.com/itm/123", { subId: "s1" });
    expect(link).toContain("campid=5330000000");
    expect(link).toContain("customid=s1");
    expect(a.generateAffiliateLink("https://ebay.com.evil.example/itm/1")).toBeNull();
    expect(ebayCondition("2500", "")).toBe("refurbished");
    expect(ebayCondition("3000", "")).toBe("used");
    expect(ebayCondition(undefined, "Open box")).toBe("open_box");
  });
});

describe("Kroger Products API", () => {
  it("requires a location and maps promo pricing", async () => {
    const f = mockFetch([
      { match: "/connect/oauth2/token", body: { access_token: "ktok", expires_in: 1800 } },
      { match: "/v1/products?", body: fixture("kroger-products.json") },
    ]);
    const a = new KrogerAdapter({ env: { KROGER_CLIENT_ID: "a", KROGER_CLIENT_SECRET: "b", KROGER_LOCATION_ID: "01400943" }, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProducts({ keywords: "milk" });
    expect(f.calls[0]?.init.body).toBe("grant_type=client_credentials&scope=product.compact");
    const url = new URL(f.calls[1]?.url ?? "");
    expect(url.searchParams.get("filter.locationId")).toBe("01400943");
    expect(url.searchParams.get("filter.term")).toBe("milk");
    expect(r.data[0]?.offer).toMatchObject({ priceCents: 299, listPriceCents: 349, availability: "limited" });
    expect(r.data[0]?.product).toMatchObject({ productUrl: "https://www.kroger.com/p/kroger-2-reduced-fat-milk/0001111041700?cid=test", attributes: { size: "1 gal" } });
    expect(r.data[0]?.product.imageUrl).toContain("/large/front/");
    expect(r.data[1]?.offer).toBeNull();
  });

  it("repairs 13-digit UPCs without a check digit", () => {
    expect(krogerGtin("0001111041700")).toMatch(/^0001111041700\d$/);
    expect(krogerGtin(U1)).toBe(U1);
    expect(krogerGtin("12")).toBeNull();
  });
});

describe("validateListing", () => {
  it("flags invalid data", () => {
    const v = validateListing({
      product: { retailerId: "x", retailerSku: "", title: "ab", brand: null, mpn: null, model: null, gtin: "123", imageUrl: null, productUrl: "http://x", categoryPath: [], description: null, attributes: {} },
      offer: { retailerId: "x", retailerSku: "", priceCents: 10.5, listPriceCents: 5, currency: "usd", availability: "unknown", condition: "new", productUrl: null, affiliateUrl: null, shippingCents: -1, sellerName: null, source: "api", observedAt: "" },
    });
    expect(v.valid).toBe(false);
    const fields = v.issues.filter((i) => i.severity === "error").map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["product.retailerSku", "product.title", "product.gtin", "offer.priceCents", "offer.currency", "offer.shippingCents"]));
  });
});
