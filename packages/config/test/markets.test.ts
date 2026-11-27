import { describe, expect, it } from "vitest";
import {
  LOCALES,
  MARKETS,
  MARKET_LIST,
  caPostalToProvince,
  estimateMarketTax,
  getMarket,
  isValidPostalCode,
  marketLocalePairs,
  marketPathPrefix,
  parseMarketPathSegment,
  resolveMarketLocale,
} from "../src/markets";

describe("markets", () => {
  it("has 12 markets and every locale belongs to exactly one market", () => {
    expect(MARKET_LIST).toHaveLength(12);
    for (const l of LOCALES) expect(MARKET_LIST.filter((m) => m.locales.includes(l))).toHaveLength(1);
  });

  it("currency formats agree with Intl minor digits", () => {
    for (const m of MARKET_LIST) {
      const d = new Intl.NumberFormat("en", { style: "currency", currency: m.currency }).resolvedOptions().maximumFractionDigits;
      expect(d, m.id).toBe(m.currencyDigits);
    }
  });

  it("routes market segments both ways", () => {
    expect(marketPathPrefix(MARKETS.us)).toBe("");
    expect(marketPathPrefix(MARKETS.ca, "fr-CA")).toBe("/ca-fr");
    expect(parseMarketPathSegment("ca-fr")).toMatchObject({ locale: "fr-CA" });
    expect(parseMarketPathSegment("de")?.market.id).toBe("de");
    expect(parseMarketPathSegment("flights")).toBeNull();
    expect(marketLocalePairs()).toHaveLength(13);
    expect(getMarket("gb").id).toBe("uk");
    expect(resolveMarketLocale(MARKETS.ca, "de-DE")).toBe("en-CA");
  });

  it("validates postal codes", () => {
    expect(isValidPostalCode("uk", "sw1a 1aa")).toBe(true);
    expect(isValidPostalCode("ca", "M5V 2T6")).toBe(true);
    expect(isValidPostalCode("nl", "1012 AB")).toBe(true);
    expect(isValidPostalCode("jp", "100-0001")).toBe(true);
    expect(isValidPostalCode("br", "01310-100")).toBe(true);
    expect(isValidPostalCode("de", "1011")).toBe(false);
  });

  it("estimates tax per market", () => {
    // 119.00 EUR incl. 19% → 19.00 included
    expect(estimateMarketTax("de", 11900).includedTaxMinor).toBe(1900);
    expect(estimateMarketTax("jp", 1100).includedTaxMinor).toBe(100);
    expect(caPostalToProvince("H2X 1Y4")).toBe("QC");
    const qc = estimateMarketTax("ca", 10000, { postalCode: "H2X 1Y4" });
    expect(qc.addedTaxMinor).toBe(1498);
    expect(estimateMarketTax("ca", 10000).addedTaxMinor).toBeNull();
    expect(estimateMarketTax("br", 10000).includedTaxMinor).toBeNull();
  });
});
