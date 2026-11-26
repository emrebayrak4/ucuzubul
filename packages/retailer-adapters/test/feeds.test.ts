import { describe, expect, it } from "vitest";
import {
  AffiliateFeedAdapter,
  PendingConfigurationError,
  createAdapter,
  csvToRecords,
  decodeXmlText,
  detectDelimiter,
  detectFeedFormat,
  parseCsv,
  parseShipping,
  saleActive,
  xmlToRecords,
} from "../src/index";
import { fakeClock, fixtureText, mockFetch } from "./helpers";

const U1 = "012345678905";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF and BOM", () => {
    const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","say ""hi"""\r\n2,"multi\nline",\r\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "x, y", 'say "hi"'],
      ["2", "multi\nline", ""],
    ]);
  });

  it("auto-detects delimiters", () => {
    expect(detectDelimiter("id\ttitle\tprice")).toBe("\t");
    expect(detectDelimiter("id|title|price")).toBe("|");
    expect(detectDelimiter('id,"a;b",c')).toBe(",");
    expect(csvToRecords("ID\tProduct Name\n1\tThing")).toEqual([{ id: "1", product_name: "Thing" }]);
  });

  it("detects feed format", () => {
    expect(detectFeedFormat("<?xml version='1.0'?><rss/>")).toBe("xml");
    expect(detectFeedFormat("id,title")).toBe("csv");
  });
});

describe("XML parsing", () => {
  it("extracts Google Merchant items with namespaces, CDATA, entities and nested shipping", () => {
    const recs = xmlToRecords(fixtureText("google-merchant-feed.TEST-ONLY.xml"));
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({
      id: "XML-1",
      title: "Acme X100 Headphones & Case",
      price: "199.99 USD",
      "shipping.price": "4.99 USD",
      "shipping.country": "US",
      product_type: "Electronics > Audio",
      gtin: U1,
    });
  });

  it("supports Atom entries with self-closing links and generic <product> lists", () => {
    const atom = xmlToRecords('<feed><entry><id>1</id><title>T</title><link href="https://x.example/p/1"/></entry></feed>');
    expect(atom[0]).toMatchObject({ id: "1", title: "T", link: "https://x.example/p/1" });
    const generic = xmlToRecords("<products><product><sku>A</sku><name>N &amp; M</name><price>9.99</price></product></products>");
    expect(generic[0]).toEqual({ sku: "A", name: "N & M", price: "9.99" });
    expect(decodeXmlText("&#36;5 &#x41;")).toBe("$5 A");
  });
});

describe("Google shipping & sale windows", () => {
  it("parses shipping attribute", () => {
    expect(parseShipping("US::Standard:4.99 USD")).toBe(499);
    expect(parseShipping("US:CA:Ground:0 USD")).toBe(0);
    expect(parseShipping("5.00")).toBe(500);
    expect(parseShipping("free")).toBe(0);
    expect(parseShipping(null)).toBeNull();
  });

  it("evaluates sale_price_effective_date", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(saleActive(null, now)).toBe(true);
    expect(saleActive("2026-11-01T00:00:00Z/2026-12-31T00:00:00Z", now)).toBe(true);
    expect(saleActive("2025-01-01T00:00:00Z/2025-01-31T00:00:00Z", now)).toBe(false);
    expect(saleActive("2027-01-01T00:00:00Z/2027-01-31T00:00:00Z", now)).toBe(false);
  });
});

describe("AffiliateFeedAdapter.parseFeed (merchant uploads)", () => {
  const adapter = new AffiliateFeedAdapter({ id: "merchant_feed", name: "Merchant", source: "merchant_upload" }, { env: {}, clock: fakeClock() });

  it("is usable without credentials", () => {
    expect(adapter.status()).toBe("live");
    expect(adapter.requiredEnv).toEqual([]);
  });

  it("parses CSV with validation errors per row", () => {
    const feed = adapter.parseFeed(fixtureText("merchant-feed.TEST-ONLY.csv"));
    expect(feed.format).toBe("csv");
    expect(feed.stats).toEqual({ rows: 5, valid: 3, invalid: 2, withoutPrice: 0 });
    const [a, b, c] = feed.listings;
    expect(a?.product).toMatchObject({ retailerSku: "SKU-1", title: "Acme X100 Headphones, Black", gtin: U1, brand: "Acme", mpn: "X100-BLK", categoryPath: ["Electronics", "Audio", "Headphones"] });
    expect(a?.product.description).toBe('Wireless, "noise cancelling"');
    expect(a?.offer).toMatchObject({ priceCents: 17999, listPriceCents: 19999, currency: "USD", availability: "in_stock", shippingCents: 0, source: "merchant_upload" });
    expect(b?.offer).toMatchObject({ priceCents: 14900, listPriceCents: null, availability: "out_of_stock", condition: "refurbished", shippingCents: 599 });
    expect(c?.offer).toMatchObject({ priceCents: 8950, availability: "preorder" });
    expect(feed.errors.map((e) => e.row)).toEqual([3, 4]);
    expect(feed.errors[0]?.issues[0]?.field).toBe("product.gtin");
  });

  it("parses Google Merchant XML incl. expired sale price", () => {
    const feed = adapter.parseFeed(fixtureText("google-merchant-feed.TEST-ONLY.xml"));
    expect(feed.format).toBe("xml");
    expect(feed.listings[0]?.offer).toMatchObject({ priceCents: 16999, listPriceCents: 19999, shippingCents: 499 });
    // sale ended in 2025 -> regular price, no fake "was" price
    expect(feed.listings[1]?.offer).toMatchObject({ priceCents: 5000, listPriceCents: null, condition: "used", availability: "out_of_stock" });
  });
});

describe("network feed retailers (registry-created)", () => {
  it("pending without a feed URL", async () => {
    const target = createAdapter("target", { env: {} }) as AffiliateFeedAdapter;
    expect(target.status()).toBe("pending_configuration");
    expect(target.missingEnv()).toEqual(["TARGET_FEED_URL"]);
    await expect(target.fetchProducts({ keywords: "x" })).rejects.toBeInstanceOf(PendingConfigurationError);
    await expect(target.fetchAvailability(["1"])).rejects.toBeInstanceOf(PendingConfigurationError);
  });

  it("downloads, caches, filters and wraps affiliate links", async () => {
    const f = mockFetch([{ match: "feeds.example/target.csv", body: fixtureText("merchant-feed.TEST-ONLY.csv") }]);
    const clock = fakeClock();
    const target = createAdapter("target", {
      env: {
        TARGET_FEED_URL: "https://feeds.example/target.csv",
        TARGET_FEED_AUTH_HEADER: "Authorization: Basic abc",
        TARGET_AFFILIATE_LINK_TEMPLATE: "https://goto.example/c/1/2/3?u={url}&subId1={subId}",
      },
      fetch: f,
      clock,
      http: { rateLimit: { capacity: 10, refillPerSecond: 10 } },
    }) as AffiliateFeedAdapter;
    const r = await target.fetchProducts({ keywords: "acme x100" });
    expect(f.calls[0]?.init.headers.Authorization).toBe("Basic abc");
    expect(r.data.map((l) => l.product.retailerSku)).toEqual(["SKU-1", "SKU-2"]);
    expect(r.data[0]?.offer?.affiliateUrl).toBe("https://goto.example/c/1/2/3?u=https%3A%2F%2Fshop.example.com%2Fp%2Fsku-1&subId1=");
    expect(r.freshness.cached).toBe(false);
    expect(r.warnings[0]).toContain("2 feed rows");

    const byGtin = await target.fetchProducts({ gtin: `00${U1}` });
    expect(byGtin.data.map((l) => l.product.retailerSku)).toEqual(["SKU-1"]);
    expect(byGtin.freshness.cached).toBe(true);
    expect(f.calls).toHaveLength(1);

    const price = await target.fetchOffers({ maxPriceCents: 10000 });
    expect(price.data.map((o) => o.retailerSku)).toEqual(["SKU-4"]);

    const av = await target.fetchAvailability(["SKU-2", "NOPE"]);
    expect(av.data).toMatchObject([{ retailerSku: "SKU-2", availability: "out_of_stock", priceCents: 14900 }, { retailerSku: "NOPE", availability: "unknown", priceCents: null }]);

    const details = await target.fetchProductDetails("SKU-4");
    expect(details.data?.product.title).toBe("Acme Speaker 2-Pack");

    clock.advance(7 * 3600 * 1000);
    await target.fetchProducts({ keywords: "acme" });
    expect(f.calls).toHaveLength(2); // TTL expired -> re-downloaded
    expect(target.generateAffiliateLink("https://shop.example.com/p/x", { subId: "abc" })).toBe("https://goto.example/c/1/2/3?u=https%3A%2F%2Fshop.example.com%2Fp%2Fx&subId1=abc");
  });
});
