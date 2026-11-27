import { describe, expect, it } from "vitest";
import {
  ADAPTER_REGISTRY,
  EbayBrowseAdapter,
  EtsyAdapter,
  KrogerAdapter,
  PendingConfigurationError,
  allAdapterEnvKeys,
  ebayLocalPickupFilter,
  etsyIsVintage,
  etsyPriceToCents,
  getAdapterStatuses,
  krogerStock,
} from "../src/index";
import { fakeClock, fixture, mockFetch } from "./helpers";

const rl = { rateLimit: { capacity: 100, refillPerSecond: 100 }, retry: { retries: 0 } };

describe("eBay local pickup", () => {
  const env = { EBAY_CLIENT_ID: "cid", EBAY_CLIENT_SECRET: "sec", EBAY_EPN_CAMPAIGN_ID: "5338000000" };

  it("builds the pickup filter string", () => {
    expect(ebayLocalPickupFilter("78701", 25)).toBe(
      "deliveryOptions:{SELLER_ARRANGED_LOCAL_PICKUP},pickupCountry:US,pickupPostalCode:78701,pickupRadius:25,pickupRadiusUnit:mi,itemLocationCountry:US",
    );
    expect(() => ebayLocalPickupFilter("7870", 25)).toThrow(RangeError);
    expect(() => ebayLocalPickupFilter("78701", 0)).toThrow(RangeError);
    expect(() => ebayLocalPickupFilter("78701", 2.5)).toThrow(RangeError);
  });

  it("searches and maps seller, item location and pickup flag", async () => {
    const f = mockFetch([
      { match: "/identity/v1/oauth2/token", body: { access_token: "tok", expires_in: 7200 } },
      { match: "/item_summary/search", body: fixture("ebay-pickup-search.json") },
    ]);
    const a = new EbayBrowseAdapter({ env, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.searchLocalPickup({ keywords: "road bike", zip: "78701", radiusMiles: 25 });
    const url = new URL(f.calls[1]?.url ?? "");
    expect(url.searchParams.get("q")).toBe("road bike");
    expect(url.searchParams.get("filter")).toBe(`${ebayLocalPickupFilter("78701", 25)},buyingOptions:{FIXED_PRICE},priceCurrency:USD`);
    expect(f.calls[1]?.init.headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_US");
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({
      sellerName: "test_seller_austin",
      pickupAvailable: true,
      itemLocation: { postalCode: "787**", city: "Austin", stateOrProvince: "Texas", country: "US" },
      offer: { priceCents: 35000, condition: "used", currency: "USD", source: "api" },
    });
    expect(r.data[1]).toMatchObject({ sellerName: "test_seller_rr", itemLocation: { postalCode: "786**", city: null }, offer: { priceCents: 2550, condition: "new" } });
  });

  it("without keys => PendingConfigurationError and no network", async () => {
    const f = mockFetch([]);
    const a = new EbayBrowseAdapter({ env: {}, fetch: f });
    expect(a.status()).toBe("pending_configuration");
    await expect(a.searchLocalPickup({ keywords: "x", zip: "78701", radiusMiles: 10 })).rejects.toBeInstanceOf(PendingConfigurationError);
    expect(f.calls).toHaveLength(0);
  });
});

describe("Etsy", () => {
  it("price divisor math is exact", () => {
    expect(etsyPriceToCents({ amount: 2450, divisor: 100, currency_code: "USD" })).toBe(2450);
    expect(etsyPriceToCents({ amount: 5, divisor: 1 })).toBe(500);
    expect(etsyPriceToCents({ amount: 12345, divisor: 1000 })).toBe(1235); // 12.345 -> half-up
    expect(etsyPriceToCents({ amount: 12344, divisor: 1000 })).toBe(1234);
    expect(etsyPriceToCents({ amount: 1, divisor: 3 })).toBe(33);
    expect(etsyPriceToCents({ amount: 435, divisor: 100 })).toBe(435);
    expect(etsyPriceToCents({ amount: 10, divisor: 0 })).toBeNull();
    expect(etsyPriceToCents({ amount: "10", divisor: 100 })).toBeNull();
    expect(etsyIsVintage("1970s")).toBe(true);
    expect(etsyIsVintage("before_2006")).toBe(true);
    expect(etsyIsVintage("made_to_order")).toBe(false);
    expect(etsyIsVintage("2020_2025")).toBe(false);
  });

  it("searches active listings and enriches with images + shop", async () => {
    const f = mockFetch([
      { match: "/v3/application/listings/active", body: fixture("etsy-listings-active.json") },
      { match: "/v3/application/listings/batch", body: fixture("etsy-listings-batch.json") },
    ]);
    const a = new EtsyAdapter({ env: { ETSY_API_KEY: "key1", ETSY_SHARED_SECRET: "sec1" }, fetch: f, clock: fakeClock(), http: rl });
    expect(a.status()).toBe("live");
    const r = await a.fetchProducts({ keywords: "mug", pageSize: 3, page: 2 });
    const search = new URL(f.calls[0]?.url ?? "");
    expect(Object.fromEntries(search.searchParams)).toEqual({ keywords: "mug", limit: "3", offset: "3" });
    expect(f.calls[0]?.init.headers["x-api-key"]).toBe("key1:sec1");
    const batch = new URL(f.calls[1]?.url ?? "");
    expect(batch.searchParams.get("listing_ids")).toBe("1111111111,2222222222,3333333333");
    expect(batch.searchParams.get("includes")).toBe("Images,Shop");
    expect(r.data).toHaveLength(3);
    expect(r.data[0]?.product).toMatchObject({ retailerId: "etsy", retailerSku: "1111111111", gtin: null, imageUrl: "https://i.etsystatic.com/test/il_570xN.1.jpg", attributes: { etsyType: "handmade" } });
    expect(r.data[0]?.offer).toMatchObject({ priceCents: 2450, currency: "USD", condition: "new", sellerName: "TestClayStudio", availability: "in_stock" });
    expect(r.data[1]?.offer).toMatchObject({ priceCents: 8900, condition: "used", availability: "limited", sellerName: "TestVintageFinds" });
    expect(r.data[1]?.product.attributes.etsyType).toBe("vintage");
    expect(r.data[2]?.offer).toBeNull(); // GBP listing: no USD price invented
  });

  it("keystring-only header when no shared secret", async () => {
    const f = mockFetch([{ match: "/listings/123", body: fixture("etsy-listings-batch.json") }]);
    const a = new EtsyAdapter({ env: { ETSY_API_KEY: "key1" }, fetch: f, clock: fakeClock(), http: rl });
    await a.fetchProductDetails("123");
    expect(f.calls[0]?.init.headers["x-api-key"]).toBe("key1");
    expect(f.calls[0]?.url).toBe("https://openapi.etsy.com/v3/application/listings/123?includes=Images,Shop");
  });

  it("without ETSY_API_KEY => pending_configuration, no network", async () => {
    const f = mockFetch([]);
    const a = new EtsyAdapter({ env: {}, fetch: f });
    expect(a.status()).toBe("pending_configuration");
    expect(a.missingEnv()).toEqual(["ETSY_API_KEY"]);
    await expect(a.fetchProducts({ keywords: "mug" })).rejects.toBeInstanceOf(PendingConfigurationError);
    await expect(a.fetchProductDetails("1")).rejects.toBeInstanceOf(PendingConfigurationError);
    expect((await a.healthCheck()).status).toBe("pending_configuration");
    expect(f.calls).toHaveLength(0);
  });

  it("is registered with its env keys", () => {
    const meta = ADAPTER_REGISTRY.find((m) => m.id === "etsy");
    expect(meta).toMatchObject({ kind: "retailer", requiredEnv: ["ETSY_API_KEY"], optionalEnv: ["ETSY_SHARED_SECRET"], goLive: "api_key" });
    expect(allAdapterEnvKeys()).toEqual(expect.arrayContaining(["ETSY_API_KEY", "ETSY_SHARED_SECRET"]));
    expect(getAdapterStatuses({ ETSY_API_KEY: "k" }).find((s) => s.id === "etsy")?.status).toBe("live");
  });
});

describe("Kroger per-store", () => {
  const creds = { KROGER_CLIENT_ID: "a", KROGER_CLIENT_SECRET: "b" };
  const token = { match: "/v1/connect/oauth2/token", body: { access_token: "tok", expires_in: 1800 } };

  it("locationsNear maps Kroger locations", async () => {
    const f = mockFetch([token, { match: "/v1/locations?", body: fixture("kroger-locations.json") }]);
    const a = new KrogerAdapter({ env: creds, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.locationsNear("45202", 15, 5);
    const url = new URL(f.calls[1]?.url ?? "");
    expect(url.pathname).toBe("/v1/locations");
    expect(Object.fromEntries(url.searchParams)).toEqual({ "filter.zipCode.near": "45202", "filter.radiusInMiles": "15", "filter.limit": "5" });
    expect(f.calls[1]?.init.headers.Authorization).toBe("Bearer tok");
    expect(r.data).toEqual([
      { externalId: "01400943", name: "Kroger - Test Pike", address1: "100 Test Pike", city: "Cincinnati", state: "OH", zip: "45202", lat: 39.1031, lng: -84.512, phone: "5135550100", chain: "KROGER" },
      { externalId: "01400376", name: "Kroger - Example Ave", address1: "200 Example Ave", city: "Cincinnati", state: "OH", zip: "45206", lat: 39.12, lng: -84.49, phone: null, chain: "KROGER" },
    ]);
    await expect(a.locationsNear("4520")).rejects.toBeInstanceOf(RangeError);
  });

  it("fetchProductsAtLocation returns store price, stock and fulfillment", async () => {
    const f = mockFetch([token, { match: "/v1/products?", body: fixture("kroger-products.json") }]);
    const a = new KrogerAdapter({ env: creds, fetch: f, clock: fakeClock(), http: rl });
    const r = await a.fetchProductsAtLocation("01400376", { keywords: "milk" });
    expect(new URL(f.calls[1]?.url ?? "").searchParams.get("filter.locationId")).toBe("01400376");
    expect(r.data[0]).toMatchObject({
      locationId: "01400376",
      stock: "low_stock",
      fulfillment: { curbside: true, instore: true, delivery: true, shipToHome: false },
      offer: { priceCents: 299, listPriceCents: 349, availability: "limited" },
    });
  });

  it("fetchProducts / fetchProductDetails accept a locationId override", async () => {
    const f = mockFetch([token, { match: "/v1/products", body: fixture("kroger-products.json") }]);
    const a = new KrogerAdapter({ env: { ...creds, KROGER_LOCATION_ID: "01400943" }, fetch: f, clock: fakeClock(), http: rl });
    await a.fetchProducts({ keywords: "milk" }, "01400376");
    expect(new URL(f.calls[1]?.url ?? "").searchParams.get("filter.locationId")).toBe("01400376");
    await a.fetchProducts({ keywords: "milk" });
    expect(new URL(f.calls[2]?.url ?? "").searchParams.get("filter.locationId")).toBe("01400943");
    await expect(a.fetchProductDetails("1", "bad id!")).rejects.toBeInstanceOf(RangeError);
  });

  it("without credentials => PendingConfigurationError, no network", async () => {
    const f = mockFetch([]);
    const a = new KrogerAdapter({ env: {}, fetch: f });
    await expect(a.locationsNear("45202")).rejects.toBeInstanceOf(PendingConfigurationError);
    await expect(a.fetchProductsAtLocation("01400376", { keywords: "milk" })).rejects.toBeInstanceOf(PendingConfigurationError);
    const noLoc = new KrogerAdapter({ env: creds, fetch: f });
    const err = await noLoc.fetchProducts({ keywords: "milk" }).catch((e: unknown) => e);
    expect((err as PendingConfigurationError).missingEnv).toEqual(["KROGER_LOCATION_ID"]);
    expect(f.calls).toHaveLength(0);
    expect(krogerStock("HIGH")).toBe("in_stock");
    expect(krogerStock("TEMPORARILY_OUT_OF_STOCK")).toBe("out_of_stock");
    expect(krogerStock(undefined)).toBe("unknown");
  });
});
