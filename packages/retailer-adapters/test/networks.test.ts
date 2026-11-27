/** Network clients: mappers + request shapes against TEST-ONLY recorded-shape fixtures. No live calls. */
import { describe, expect, it } from "vitest";
import {
  AwinNetworkClient,
  CjNetworkClient,
  EbayPartnerNetworkClient,
  ImpactNetworkClient,
  NETWORK_REGISTRY,
  NotSupportedError,
  PartnerizeNetworkClient,
  PendingConfigurationError,
  RakutenNetworkClient,
  chunkRange,
  collectPages,
  conversionState,
  createNetworkClients,
  isoDate,
  nextCursor,
  parseAwinFeedList,
  parseDiscount,
  parseMinSpend,
  signedCents,
} from "../src/index";
import { fakeClock, fixture, fixtureText, mockFetch } from "./helpers";

const rl = { rateLimit: { capacity: 100, refillPerSecond: 100 } };
const range = { since: new Date("2026-11-01T00:00:00Z"), until: new Date("2026-11-26T00:00:00Z") };

const CJ_ENV = { CJ_PERSONAL_ACCESS_TOKEN: "pat", CJ_COMPANY_ID: "1000001", CJ_WEBSITE_ID: "100000" };
const IMPACT_ENV = { IMPACT_ACCOUNT_SID: "IRTEST123", IMPACT_AUTH_TOKEN: "tok" };
const RAKUTEN_ENV = { RAKUTEN_CLIENT_ID: "cid", RAKUTEN_CLIENT_SECRET: "sec", RAKUTEN_SID: "3000000" };
const AWIN_ENV = { AWIN_API_TOKEN: "tok", AWIN_PUBLISHER_ID: "123456" };
const PZ_ENV = { PARTNERIZE_USER_API_KEY: "api", PARTNERIZE_USER_APPLICATION_KEY: "app", PARTNERIZE_PUBLISHER_ID: "1l100" };

describe("pending configuration", () => {
  for (const c of createNetworkClients({ env: {} })) {
    it(`${c.id}: no credentials → pending, typed error, no request`, async () => {
      const f = mockFetch([]);
      const client = NETWORK_REGISTRY.find((n) => n.id === c.id)!.create({ env: {}, fetch: f });
      expect(client.status()).toBe("pending_configuration");
      const h = await client.healthCheck();
      expect(h.status).toBe("pending_configuration");
      expect(h.ok).toBe(false);
      await expect(client.fetchConversions(range)).rejects.toBeInstanceOf(PendingConfigurationError);
      expect(f.calls).toHaveLength(0);
    });
  }
});

describe("helpers", () => {
  it("parses discounts without inventing values", () => {
    expect(parseDiscount("20% off sitewide")).toEqual({ discountType: "percent", discountValue: 20 });
    expect(parseDiscount("$15 off orders over $75")).toEqual({ discountType: "amount", discountValue: 1500 });
    expect(parseDiscount("Free shipping on everything")).toEqual({ discountType: "free_shipping", discountValue: null });
    expect(parseDiscount("Buy one, get one")).toEqual({ discountType: "bogo", discountValue: null });
    expect(parseDiscount("Black Friday sale")).toEqual({ discountType: "other", discountValue: null });
    expect(parseMinSpend("Min. purchase $50")).toBe(5000);
    expect(parseMinSpend("orders over $75")).toBe(7500);
    expect(parseMinSpend("no minimum")).toBeNull();
  });
  it("maps states, signed money, dates", () => {
    expect(conversionState("APPROVED")).toBe("approved");
    expect(conversionState("declined")).toBe("reversed");
    expect(conversionState("REVERSED")).toBe("reversed");
    expect(conversionState("new")).toBe("pending");
    expect(signedCents("-6.00")).toBe(-600);
    expect(signedCents(2.5)).toBe(250);
    expect(isoDate("11/30/2026")).toBe("2026-11-30T00:00:00.000Z");
    expect(isoDate("2026-11-18 21:00:00")).toBe("2026-11-18T21:00:00.000Z");
    expect(isoDate("Ongoing")).toBeNull();
  });
  it("chunks report ranges to network limits", () => {
    const chunks = chunkRange({ since: new Date("2026-09-01T00:00:00Z"), until: new Date("2026-11-15T00:00:00Z") }, 30);
    expect(chunks).toHaveLength(3);
    expect(chunks[2]!.until.toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
  it("collectPages follows cursors and stops at the page cap", async () => {
    const r = await collectPages(async (c) => ({ items: [Number(c ?? 0)], next: String(Number(c ?? 0) + 1), warnings: [] }), 3);
    expect(r.items).toEqual([0, 1, 2]);
    expect(r.truncated).toBe(true);
  });
});

describe("CJ", () => {
  it("maps Product Search (Shopping fragment fields, sale price, tracking URL; skips unpriced listing)", async () => {
    const f = mockFetch([{ match: "ads.api.cj.com", body: fixture("cj-products.json") }]);
    const c = new CjNetworkClient({ env: CJ_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchProducts({ advertiserId: "1234567", pageSize: 2 });
    expect(page.items).toHaveLength(2);
    const p = page.items[0]!;
    expect(p.advertiserId).toBe("1234567");
    expect(p.listing.product.gtin).toBe("012345678905");
    expect(p.listing.offer?.priceCents).toBe(17999);
    expect(p.listing.offer?.listPriceCents).toBe(19999);
    expect(p.listing.offer?.source).toBe("affiliate");
    expect(p.listing.offer?.affiliateUrl).toContain("anrdoezrs.net/click-100000-200000");
    expect(page.items[1]!.listing.offer).toBeNull();
    expect(page.next).toBe("3");
    const body = JSON.parse(f.calls[0]!.init.body as string) as { query: string; variables: Record<string, unknown> };
    expect(body.query).toContain("... on Shopping");
    expect(body.variables).toMatchObject({ companyId: "1000001", pid: "100000", partnerIds: ["1234567"], offset: 1 });
    expect(f.calls[0]!.init.headers.Authorization).toBe("Bearer pat");
  });
  it("maps Commission Detail incl. negative correction records and cursor paging", async () => {
    const f = mockFetch([{ match: "commissions.api.cj.com", body: fixture("cj-commissions.json") }]);
    const c = new CjNetworkClient({ env: CJ_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items.map((i) => [i.externalId, i.subId, i.commissionCents, i.state])).toEqual([
      ["9000001", "clk_abc123", 600, "pending"],
      ["9000002", null, 250, "approved"],
      ["9000003", "clk_abc123", -600, "reversed"],
    ]);
    expect(page.next).toBe("9000003");
  });
  it("maps Link Search XML coupons", async () => {
    const f = mockFetch([{ match: "link-search.api.cj.com", body: fixtureText("cj-link-search.TEST-ONLY.xml") }]);
    const c = new CjNetworkClient({ env: CJ_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchCoupons();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ externalId: "13000001", code: "TEST20", discountType: "percent", discountValue: 20, minSpendCents: 5000, expiresAt: "2026-12-31T00:00:00.000Z" });
    expect(page.items[0]!.trackingUrl).toContain("anrdoezrs.net");
    expect(f.calls[0]!.url).toContain("advertiser-ids=joined");
    expect(page.next).toBeNull();
  });
  it("buildLink uses the CJ deep link with sid", () => {
    const c = new CjNetworkClient({ env: CJ_ENV });
    expect(c.buildLink({ destinationUrl: "https://www.example-retailer.test/p/1", subId: "clk1" })).toBe("https://www.anrdoezrs.net/links/100000/type/dlg/sid/clk1/https://www.example-retailer.test/p/1");
  });
  it("healthCheck turns 401 into an honest error", async () => {
    const f = mockFetch([{ match: "ads.api.cj.com", status: 401, body: { errors: [{ message: "unauthorized" }] } }]);
    const c = new CjNetworkClient({ env: CJ_ENV, fetch: f, clock: fakeClock(), http: rl });
    const h = await c.healthCheck();
    expect(h.ok).toBe(false);
    expect(h.status).toBe("error");
  });
});

describe("Impact", () => {
  it("maps catalog items (Url is the tracking link) and follows @nextpageuri", async () => {
    const f = mockFetch([{ match: "/Catalogs/555/Items", body: fixture("impact-catalog-items.json") }]);
    const c = new ImpactNetworkClient({ env: IMPACT_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchProducts({ catalogId: "555" });
    expect(page.items).toHaveLength(2);
    const p = page.items[0]!;
    expect(p.advertiserId).toBe("3333");
    expect(p.listing.offer?.priceCents).toBe(16900);
    expect(p.listing.offer?.listPriceCents).toBe(19900);
    expect(p.listing.offer?.affiliateUrl).toContain("/c/1111/2222/3333");
    expect(p.listing.offer?.availability).toBe("in_stock");
    expect(page.items[1]!.listing.offer).toBeNull();
    expect(page.next).toBe("/Mediapartners/IRTEST123/Catalogs/555/Items?PageSize=1000&Page=2");
    expect(f.calls[0]!.init.headers.Authorization).toBe(`Basic ${Buffer.from("IRTEST123:tok").toString("base64")}`);
    expect(f.calls[0]!.init.headers["IR-Version"]).toBe("16");
  });
  it("lists deals per campaign, attaches a program tracking link, drops inactive deals", async () => {
    const f = mockFetch([
      { match: "/Campaigns/3333/Deals", body: fixture("impact-deals.json") },
      { match: "/Programs/3333/TrackingLinks", body: { TrackingURL: "https://goto.example-retailer.test/c/1111/2222/3333" } },
      { match: "/Campaigns?", body: { Campaigns: [{ CampaignId: "3333", CampaignName: "Test Campaign", ContractStatus: "Active" }] } },
    ]);
    const c = new ImpactNetworkClient({ env: IMPACT_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchCoupons();
    expect(page.items.map((d) => [d.externalId, d.code, d.discountType, d.discountValue, d.minSpendCents])).toEqual([
      ["77001", "SAVE15", "amount", 1500, 7500],
      ["77002", null, "free_shipping", null, null],
    ]);
    expect(page.items[0]!.trackingUrl).toBe("https://goto.example-retailer.test/c/1111/2222/3333");
    expect(f.calls.find((x) => x.url.includes("TrackingLinks"))!.init.method).toBe("POST");
  });
  it("maps Actions with StartDate/EndDate (last-updated window)", async () => {
    const f = mockFetch([{ match: "/Actions", body: fixture("impact-actions.json") }]);
    const c = new ImpactNetworkClient({ env: IMPACT_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items.map((a) => [a.externalId, a.subId, a.saleAmountCents, a.commissionCents, a.state])).toEqual([
      ["1000.2000.3000", "clk_imp1", 25000, 1000, "approved"],
      ["1000.2000.3001", null, 4000, 160, "reversed"],
    ]);
    expect(f.calls[0]!.url).toContain("StartDate=2026-11-01T00%3A00%3A00Z");
  });
});

describe("Rakuten", () => {
  const routes = (extra: { match: string; body: unknown }) => [{ match: "/token", body: { access_token: "at", expires_in: 3600 } }, extra];
  it("gets a token with Bearer base64(id:secret) and scope=SID", async () => {
    const f = mockFetch(routes({ match: "/coupon/1.0", body: fixtureText("rakuten-coupons.TEST-ONLY.xml") }));
    const c = new RakutenNetworkClient({ env: RAKUTEN_ENV, fetch: f, clock: fakeClock(), http: rl });
    await c.fetchCoupons();
    const tok = f.calls[0]!;
    expect(tok.init.headers.Authorization).toBe(`Bearer ${Buffer.from("cid:sec").toString("base64")}`);
    expect(tok.init.body).toContain("scope=3000000");
    expect(f.calls[1]!.init.headers.Authorization).toBe("Bearer at");
  });
  it("maps coupons (offerid as id, free-shipping promo type, hashed id when absent)", async () => {
    const f = mockFetch(routes({ match: "/coupon/1.0", body: fixtureText("rakuten-coupons.TEST-ONLY.xml") }));
    const c = new RakutenNetworkClient({ env: RAKUTEN_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchCoupons();
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ externalId: "999.111", code: "HEAD10", discountType: "percent", discountValue: 10, advertiserId: "44583" });
    expect(page.items[1]!.discountType).toBe("free_shipping");
    expect(page.items[1]!.externalId).toMatch(/^[0-9a-f]{32}$/);
  });
  it("maps product search XML", async () => {
    const f = mockFetch(routes({ match: "/productsearch/1.0", body: fixtureText("rakuten-productsearch.TEST-ONLY.xml") }));
    const c = new RakutenNetworkClient({ env: RAKUTEN_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchProducts({ advertiserId: "44583", keywords: "headphones" });
    const p = page.items[0]!;
    expect(p.listing.offer?.priceCents).toBe(17499);
    expect(p.listing.offer?.affiliateUrl).toContain("click.linksynergy.com");
    expect(p.listing.product.categoryPath).toEqual(["Electronics", "Audio"]);
    expect(page.next).toBeNull();
  });
  it("maps Events transactions; negative rows are reversals", async () => {
    const f = mockFetch(routes({ match: "/events/1.0/transactions", body: fixture("rakuten-transactions.json") }));
    const c = new RakutenNetworkClient({ env: RAKUTEN_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items.map((t) => [t.externalId, t.subId, t.commissionCents, t.state])).toEqual([
      ["ET-1", "clk_rak1", 875, "pending"],
      ["ET-2", "clk_rak1", -875, "reversed"],
    ]);
    expect(c.maxLookbackDays).toBeLessThanOrEqual(30);
  });
});

describe("Awin", () => {
  it("maps promotions (POST body: joined + active) incl. voucher code", async () => {
    const f = mockFetch([{ match: "/publisher/123456/promotions", body: fixture("awin-promotions.json") }]);
    const c = new AwinNetworkClient({ env: AWIN_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchCoupons();
    expect(page.items[0]).toMatchObject({ externalId: "5550001", code: "AWIN10", discountType: "amount", discountValue: 1000, minSpendCents: 6000, advertiserId: "7001" });
    expect(page.items[1]!.code).toBeNull();
    expect(JSON.parse(f.calls[0]!.init.body as string)).toMatchObject({ filters: { membership: "joined", status: "active" } });
  });
  it("maps transactions (clickRef = sub id, declined → reversed)", async () => {
    const f = mockFetch([{ match: "/publishers/123456/transactions/", body: fixture("awin-transactions.json") }]);
    const c = new AwinNetworkClient({ env: AWIN_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items.map((t) => [t.externalId, t.subId, t.saleAmountCents, t.commissionCents, t.state])).toEqual([
      ["880001", "clk_awin1", 8400, 420, "approved"],
      ["880002", null, 2000, 100, "reversed"],
    ]);
    expect(f.calls[0]!.url).toContain("timezone=UTC");
  });
  it("parses the feed list and downloads only joined Awin-format feeds (uncompressed)", async () => {
    expect(parseAwinFeedList(fixtureText("awin-feed-list.TEST-ONLY.csv"))).toHaveLength(2);
    const f = mockFetch([
      { match: "/feedList", body: fixtureText("awin-feed-list.TEST-ONLY.csv") },
      { match: "/fid/40001/", body: fixtureText("awin-feed.TEST-ONLY.csv") },
    ]);
    const c = new AwinNetworkClient({ env: { ...AWIN_ENV, AWIN_FEED_API_KEY: "TESTKEY" }, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchProducts({});
    expect(page.items).toHaveLength(1);
    const l = page.items[0]!.listing;
    expect(l.product.retailerSku).toBe("AW-SKU-1");
    expect(l.offer?.priceCents).toBe(15900);
    expect(l.offer?.listPriceCents).toBe(19900);
    expect(l.offer?.affiliateUrl).toContain("awin1.com");
    expect(f.calls[1]!.url).not.toContain("compression");
    expect(f.calls[0]!.url).toContain("/publisher/123456/TESTKEY/1/feedList");
  });
  it("products without a feed key report a warning, not data", async () => {
    const c = new AwinNetworkClient({ env: AWIN_ENV, fetch: mockFetch([]), http: rl });
    const page = await c.fetchProducts({});
    expect(page.items).toHaveLength(0);
    expect(page.warnings[0]).toContain("AWIN_FEED_API_KEY");
  });
});

describe("Partnerize", () => {
  it("maps conversions from conversion_value and uses Basic app_key:api_key", async () => {
    const f = mockFetch([{ match: "/conversion.json", body: fixture("partnerize-conversions.json") }]);
    const c = new PartnerizeNetworkClient({ env: PZ_ENV, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items[0]).toMatchObject({ externalId: "1011l123456", subId: "clk_pz1", saleAmountCents: 30000, commissionCents: 1500, state: "pending", advertiserId: "10l176" });
    expect(f.calls[0]!.init.headers.Authorization).toBe(`Basic ${Buffer.from("app:api").toString("base64")}`);
    expect(page.next).toBeNull();
  });
  it("reads cursor_id from hypermedia next_page", () => {
    expect(nextCursor("/reporting/report_publisher/publisher/1/conversion.json?cursor_id=abc123&limit=300")).toBe("abc123");
    expect(nextCursor(null)).toBeNull();
  });
  it("does not claim coupons/products", async () => {
    const c = new PartnerizeNetworkClient({ env: PZ_ENV });
    await expect(c.fetchCoupons()).rejects.toBeInstanceOf(NotSupportedError);
    expect(c.buildLink({ destinationUrl: "https://www.example-retailer.test/", subId: "s1", trackingBase: "camref:1100lAbc" })).toBe(
      "https://prf.hn/click/camref:1100lAbc/pubref:s1/destination:https%3A%2F%2Fwww.example-retailer.test%2F",
    );
  });
});

describe("eBay Partner Network", () => {
  it("maps transaction detail rows (customid = sub id)", async () => {
    const f = mockFetch([{ match: "ebay_partner_transaction_detail", body: fixture("epn-transactions.json") }]);
    const c = new EbayPartnerNetworkClient({ env: { EBAY_EPN_ACCOUNT_SID: "sid", EBAY_EPN_AUTH_TOKEN: "t" }, fetch: f, clock: fakeClock(), http: rl });
    const page = await c.fetchConversions(range);
    expect(page.items[0]).toMatchObject({ externalId: "5100000001", subId: "clk_epn1", saleAmountCents: 8950, commissionCents: 358, state: "approved" });
  });
});
