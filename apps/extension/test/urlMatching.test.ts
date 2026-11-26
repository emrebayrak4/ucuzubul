import { describe, expect, it } from "vitest";
import { BUILT_IN_RETAILERS, retailerMatchPatterns } from "../src/shared/retailers";
import {
  compileUrlPattern,
  findBuiltInRetailer,
  hostMatchesDomain,
  hostMatchesPattern,
  hostOf,
  urlMatchesAnyPattern,
} from "../src/shared/urlMatching";
import { minimizeProductUrl } from "../src/background/service";

describe("built-in retailers", () => {
  it("has the 22 seeded retailers with unique domains", () => {
    expect(BUILT_IN_RETAILERS).toHaveLength(22);
    expect(new Set(BUILT_IN_RETAILERS.map((r) => r.domain)).size).toBe(22);
  });

  it("generates https-only match patterns for apex + subdomains", () => {
    const patterns = retailerMatchPatterns();
    expect(patterns).toHaveLength(44);
    expect(patterns).toContain("https://amazon.com/*");
    expect(patterns).toContain("https://*.amazon.com/*");
    expect(patterns.every((p) => p.startsWith("https://"))).toBe(true);
  });
});

describe("hostOf", () => {
  it("returns lower-cased host for http(s) only", () => {
    expect(hostOf("https://WWW.Amazon.com/dp/B0TEST1234")).toBe("www.amazon.com");
    expect(hostOf("http://walmart.com/")).toBe("walmart.com");
    expect(hostOf("chrome://extensions")).toBeNull();
    expect(hostOf("file:///C:/x.html")).toBeNull();
    expect(hostOf("not a url")).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

describe("host matching", () => {
  it("matches domain and subdomains but not lookalikes", () => {
    expect(hostMatchesDomain("amazon.com", "amazon.com")).toBe(true);
    expect(hostMatchesDomain("www.amazon.com", "amazon.com")).toBe(true);
    expect(hostMatchesDomain("smile.amazon.com", "amazon.com")).toBe(true);
    expect(hostMatchesDomain("notamazon.com", "amazon.com")).toBe(false);
    expect(hostMatchesDomain("amazon.com.evil.io", "amazon.com")).toBe(false);
  });

  it("supports admin host patterns and fails closed on odd ones", () => {
    expect(hostMatchesPattern("www.target.com", "target.com")).toBe(true);
    expect(hostMatchesPattern("www.target.com", "*.target.com")).toBe(true);
    expect(hostMatchesPattern("target.com", "*.target.com")).toBe(true);
    expect(hostMatchesPattern("www.target.com", "www.target.com")).toBe(true);
    expect(hostMatchesPattern("target.com", "www.target.com")).toBe(false);
    expect(hostMatchesPattern("www.target.com", "https://target.com")).toBe(false);
    expect(hostMatchesPattern("www.target.com", "tar*.com")).toBe(false);
    expect(hostMatchesPattern("www.target.com", "")).toBe(false);
  });

  it("finds the built-in retailer for a host", () => {
    expect(findBuiltInRetailer("www.bestbuy.com")?.slug).toBe("best-buy");
    expect(findBuiltInRetailer("www.bhphotovideo.com")?.name).toBe("B&H Photo");
    expect(findBuiltInRetailer("example.com")).toBeNull();
    expect(findBuiltInRetailer(null)).toBeNull();
  });
});

describe("checkout URL patterns", () => {
  const u = (s: string) => new URL(s);

  it("globs against path + query", () => {
    const p = compileUrlPattern("/checkout*");
    expect(p?.test(u("https://www.target.com/checkout"))).toBe(true);
    expect(p?.test(u("https://www.target.com/checkout/payment?step=2"))).toBe(true);
    expect(p?.test(u("https://www.target.com/cart"))).toBe(false);
    expect(compileUrlPattern("/cart/*/promo")?.test(u("https://x.com/cart/abc/promo"))).toBe(true);
  });

  it("supports re: regexes (case-insensitive) and full-URL globs", () => {
    expect(compileUrlPattern("re:^/(checkout|cart)(/|$)")?.test(u("https://a.com/Cart/"))).toBe(true);
    expect(compileUrlPattern("re:^/(checkout|cart)(/|$)")?.test(u("https://a.com/carton"))).toBe(false);
    expect(compileUrlPattern("https://secure.*.com/checkout*")?.test(u("https://secure.newegg.com/checkout/step1"))).toBe(true);
  });

  it("treats invalid or empty patterns as never matching", () => {
    expect(compileUrlPattern("re:([")).toBeNull();
    expect(compileUrlPattern("re:")).toBeNull();
    expect(compileUrlPattern("  ")).toBeNull();
    expect(urlMatchesAnyPattern("https://a.com/checkout", ["re:([", ""])).toBe(false);
    expect(urlMatchesAnyPattern("not a url", ["*"])).toBe(false);
  });

  it("does not treat regex metacharacters in globs as regex", () => {
    expect(compileUrlPattern("/checkout.html")?.test(u("https://a.com/checkoutXhtml"))).toBe(false);
    expect(compileUrlPattern("/checkout.html")?.test(u("https://a.com/checkout.html"))).toBe(true);
  });
});

describe("minimizeProductUrl", () => {
  it("drops tracking params but keeps the product id params", () => {
    expect(minimizeProductUrl("https://www.amazon.com/dp/B0TEST1234?tag=aff-20&ref=sr_1&th=1")).toBe("https://www.amazon.com/dp/B0TEST1234");
    expect(minimizeProductUrl("https://www.bestbuy.com/site/x.p?skuId=6501234&intl=nosplash")).toBe(
      "https://www.bestbuy.com/site/x.p?skuId=6501234",
    );
    expect(minimizeProductUrl("https://www.target.com/p/x/-/A-12345678#lnk=sametab")).toBe("https://www.target.com/p/x/-/A-12345678");
    expect(minimizeProductUrl("javascript:alert(1)")).toBeNull();
  });
});
