/** Deep-link builders + sub-ID injection (pure functions; no network). */
import { describe, expect, it } from "vitest";
import { amazonLink, applySubId, awinDeepLink, cjDeepLink, detectLinkNetwork, epnLink, fillLinkTemplate, impactDeepLink, partnerizeDeepLink, rakutenDeepLink, readSubId, sanitizeSubId } from "../src/index";

const DEST = "https://www.example-retailer.test/p/x100?color=black";
const SUB = "AbC_12-xyz";

describe("builders", () => {
  it("CJ path-style deep link", () => {
    expect(cjDeepLink({ websiteId: "100000", destinationUrl: DEST, subId: SUB })).toBe(`https://www.anrdoezrs.net/links/100000/type/dlg/sid/${SUB}/${DEST}`);
    expect(cjDeepLink({ websiteId: "abc", destinationUrl: DEST })).toBeNull();
  });
  it("Impact tracking link with u + subId1", () => {
    const l = impactDeepLink({ trackingBase: "https://goto.walmart.com/c/1111/2222/3333", destinationUrl: DEST, subId: SUB })!;
    const u = new URL(l);
    expect(u.searchParams.get("u")).toBe(DEST);
    expect(u.searchParams.get("subId1")).toBe(SUB);
  });
  it("Rakuten deeplink", () => {
    const u = new URL(rakutenDeepLink({ siteId: "ENCID", advertiserId: "44583", destinationUrl: DEST, subId: SUB })!);
    expect(u.hostname).toBe("click.linksynergy.com");
    expect([u.searchParams.get("mid"), u.searchParams.get("murl"), u.searchParams.get("u1")]).toEqual(["44583", DEST, SUB]);
  });
  it("Awin cread link", () => {
    const u = new URL(awinDeepLink({ publisherId: "123456", advertiserId: "7001", destinationUrl: DEST, subId: SUB })!);
    expect(u.pathname).toBe("/cread.php");
    expect([u.searchParams.get("awinmid"), u.searchParams.get("awinaffid"), u.searchParams.get("clickref"), u.searchParams.get("ued")]).toEqual(["7001", "123456", SUB, DEST]);
  });
  it("Partnerize camref/pubref/destination", () => {
    expect(partnerizeDeepLink({ camref: "1100lAbc", destinationUrl: DEST, subId: SUB })).toBe(`https://prf.hn/click/camref:1100lAbc/pubref:${SUB}/destination:${encodeURIComponent(DEST)}`);
  });
  it("EPN link (US rotation id, campid, customid; no siteid)", () => {
    const u = new URL(epnLink({ campaignId: "5338000000", destinationUrl: "https://www.ebay.com/itm/110000000003", subId: SUB })!);
    expect(u.searchParams.get("mkrid")).toBe("711-53200-19255-0");
    expect(u.searchParams.get("campid")).toBe("5338000000");
    expect(u.searchParams.get("customid")).toBe(SUB);
    expect(u.searchParams.has("siteid")).toBe(false);
    expect(epnLink({ campaignId: "5338000000", destinationUrl: DEST })).toBeNull();
  });
  it("Amazon tag + ascsubtag on canonical /dp/ URL", () => {
    expect(amazonLink({ tag: "store-20", destinationUrl: "https://www.amazon.com/Some-Thing/dp/b0test1234/ref=x", subId: SUB })).toBe(`https://www.amazon.com/dp/B0TEST1234?tag=store-20&ascsubtag=${SUB}`);
    expect(amazonLink({ tag: "store-20", destinationUrl: DEST })).toBeNull();
  });
  it("templates require {url}", () => {
    expect(fillLinkTemplate("https://aff.example.test/c?u={url}&s={subId}", { destinationUrl: DEST, subId: SUB })).toBe(`https://aff.example.test/c?u=${encodeURIComponent(DEST)}&s=${SUB}`);
    expect(fillLinkTemplate("https://aff.example.test/c", { destinationUrl: DEST })).toBeNull();
  });
});

describe("applySubId (redirect-time attribution)", () => {
  const cases: [string, string, string][] = [
    ["cj", "https://www.kqzyfj.com/click-100000-200000?url=https%3A%2F%2Fwww.example-retailer.test%2F&cjsku=1", "sid"],
    ["impact", "https://goto.walmart.com/c/1111/2222/3333?u=https%3A%2F%2Fwww.walmart.com%2Fip%2F1", "subId1"],
    ["rakuten", "https://click.linksynergy.com/link?id=ENCID&offerid=1.2&type=15&murl=x", "u1"],
    ["awin", "https://www.awin1.com/cread.php?awinmid=7001&awinaffid=123456&ued=x", "clickref"],
    ["ebay_partner", "https://www.ebay.com/itm/1?mkcid=1&campid=5338000000", "customid"],
    ["amazon_associates", "https://www.amazon.com/dp/B0TEST1234?tag=store-20", "ascsubtag"],
    ["booking", "https://www.booking.com/hotel/us/test.html?aid=123", "label"],
  ];
  for (const [net, url, param] of cases) {
    it(`${net}: sets ${param}`, () => {
      expect(detectLinkNetwork(url)).toBe(net);
      const out = applySubId(url, SUB);
      expect(new URL(out).searchParams.get(param)).toBe(SUB);
      expect(readSubId(out)).toBe(SUB);
      // idempotent: re-applying replaces, never duplicates
      expect(new URL(applySubId(out, "second")).searchParams.getAll(param)).toEqual(["second"]);
    });
  }
  it("CJ path-style deep link gets /sid/ segment replaced", () => {
    const out = applySubId("https://www.anrdoezrs.net/links/100000/type/dlg/sid/old/https://www.example-retailer.test/p", SUB);
    expect(out).toBe(`https://www.anrdoezrs.net/links/100000/type/dlg/sid/${SUB}/https://www.example-retailer.test/p`);
  });
  it("Partnerize pubref segment inserted after camref", () => {
    const out = applySubId("https://prf.hn/click/camref:1100lAbc/destination:https%3A%2F%2Fx.test", SUB);
    expect(out).toBe(`https://prf.hn/click/camref:1100lAbc/pubref:${SUB}/destination:https%3A%2F%2Fx.test`);
    expect(readSubId(out)).toBe(SUB);
  });
  it("Travelpayouts marker gets .subid suffix", () => {
    const out = applySubId("https://www.aviasales.com/search/JFK0112LAX1?marker=12345", SUB);
    expect(new URL(out).searchParams.get("marker")).toBe(`12345.${SUB}`);
  });
  it("plain merchant URLs are left untouched", () => {
    expect(applySubId(DEST, SUB)).toBe(DEST);
    expect(applySubId("not a url", SUB)).toBe("not a url");
  });
  it("sub ids are sanitized to a network-safe charset", () => {
    expect(sanitizeSubId("a b<c>/d?e=f&g")).toBe("abcdefg");
    expect(sanitizeSubId("x".repeat(100))).toHaveLength(64);
  });
});
