import { describe, expect, it } from "vitest";
import {
  computeGtinCheckDigit,
  ean13ToUpcA,
  extractBrand,
  extractModel,
  gtinType,
  gtinsEqual,
  isbn10ToIsbn13,
  isValidGtin,
  isValidIsbn10,
  isValidIsbn13,
  modelTokens,
  normalizeBrand,
  normalizeColor,
  normalizeCondition,
  normalizeGtin,
  normalizeModel,
  normalizeTitle,
  parseAttributes,
  parseColors,
  parseCondition,
  parsePackCount,
  parseRamGb,
  parseRefreshHz,
  parseScreenInches,
  parseSize,
  parseStorageGb,
  toDisplayGtin,
  toGtin14,
  tokenize,
  upcToEan13,
  variantTokens,
} from "../src/index";

describe("GTIN utilities", () => {
  it("computes check digits", () => {
    expect(computeGtinCheckDigit("03600029145")).toBe(2); // UPC-A 036000291452
    expect(computeGtinCheckDigit("400638133393")).toBe(1); // EAN-13 4006381333931
    expect(computeGtinCheckDigit("9638507")).toBe(4); // GTIN-8 96385074
  });

  it("validates UPC-A, EAN-13, GTIN-8, GTIN-14", () => {
    expect(gtinType("036000291452")).toBe("UPC-A");
    expect(gtinType("4006381333931")).toBe("EAN-13");
    expect(gtinType("96385074")).toBe("GTIN-8");
    expect(gtinType("10036000291459")).toBe("GTIN-14");
    expect(isValidGtin("036000291453")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
    expect(isValidGtin("abc")).toBe(false);
    expect(isValidGtin("0360-0029 1452")).toBe(true);
  });

  it("converts UPC <-> EAN and normalizes to GTIN-14", () => {
    expect(upcToEan13("036000291452")).toBe("0036000291452");
    expect(ean13ToUpcA("0036000291452")).toBe("036000291452");
    expect(ean13ToUpcA("4006381333931")).toBeNull();
    expect(upcToEan13("036000291453")).toBeNull();
    expect(toGtin14("036000291452")).toBe("00036000291452");
    expect(normalizeGtin("0036000291452")).toBe("00036000291452");
    expect(gtinsEqual("036000291452", "0036000291452")).toBe(true);
    expect(gtinsEqual("036000291452", "4006381333931")).toBe(false);
    expect(toDisplayGtin("00036000291452")).toBe("036000291452");
    expect(toDisplayGtin("04006381333931")).toBe("4006381333931");
  });

  it("handles ISBNs", () => {
    expect(isValidIsbn10("0-306-40615-2")).toBe(true);
    expect(isValidIsbn10("0306406153")).toBe(false);
    expect(isbn10ToIsbn13("0306406152")).toBe("9780306406157");
    expect(isValidIsbn13("9780306406157")).toBe(true);
    expect(isValidIsbn13("4006381333931")).toBe(false);
  });
});

describe("unit parsing", () => {
  it("parses storage and RAM separately", () => {
    expect(parseStorageGb("Apple iPhone 15 Pro 256GB")).toBe(256);
    expect(parseStorageGb("Galaxy S24 8GB RAM 512 GB Storage")).toBe(512);
    expect(parseRamGb("Galaxy S24 8GB RAM 512 GB Storage")).toBe(8);
    expect(parseStorageGb("Samsung 990 PRO 2TB NVMe SSD")).toBe(2048);
    expect(parseRamGb("MacBook Air 16GB Unified Memory 512GB SSD")).toBe(16);
    expect(parseStorageGb("MacBook Air 16GB Unified Memory 512GB SSD")).toBe(512);
    expect(parseStorageGb("USB-C cable")).toBeUndefined();
  });

  it("parses screen size and refresh rate", () => {
    expect(parseScreenInches('LG 65" Class OLED evo C4')).toBe(65);
    expect(parseScreenInches("Samsung 55-Inch QLED")).toBe(55);
    expect(parseScreenInches("Dell 27 inch monitor")).toBe(27);
    expect(parseScreenInches("TCL 75 Class Q7")).toBe(75);
    expect(parseScreenInches("2 in 1 laptop")).toBeUndefined();
    expect(parseRefreshHz("Gaming monitor 144Hz")).toBe(144);
    expect(parseRefreshHz("240 hz OLED")).toBe(240);
    expect(parseRefreshHz("no rate")).toBeUndefined();
  });

  it("parses colors with synonyms", () => {
    expect(parseColors("iPhone 15 Pro Natural Titanium")).toEqual(["natural titanium"]);
    expect(parseColors("MacBook Air Space Grey")).toEqual(["space gray"]);
    expect(parseColors("Black and White Case")).toEqual(["black", "white"]);
    expect(normalizeColor("Grey")).toBe("gray");
    expect(normalizeColor("Burgundy")).toBe("burgundy");
  });

  it("parses pack counts", () => {
    expect(parsePackCount("AirTag 4-Pack")).toBe(4);
    expect(parsePackCount("Duracell AA Batteries, 24 Count")).toBe(24);
    expect(parsePackCount("Pack of 2 toothbrush heads")).toBe(2);
    expect(parsePackCount("Twin Pack")).toBe(2);
    expect(parsePackCount("Single AirTag")).toBeUndefined();
  });

  it("parses condition", () => {
    expect(parseCondition("Apple iPhone 13 (Renewed)")).toBe("refurbished");
    expect(parseCondition("Open-Box Excellent")).toBe("open_box");
    expect(parseCondition("Pre-Owned PS5")).toBe("used");
    expect(parseCondition("PS5 Console")).toBeUndefined();
    expect(normalizeCondition("Certified Refurbished")).toBe("refurbished");
    expect(normalizeCondition("NEW")).toBe("new");
    expect(normalizeCondition("used_like_new")).toBe("used");
  });

  it("parses sizes", () => {
    expect(parseSize("Queen Size Mattress")).toBe("queen");
    expect(parseSize("Men's T-Shirt Size XL")).toBe("XL");
    expect(parseSize("Coca-Cola 12 fl oz cans")).toBe("12 floz");
    expect(parseSize("Dog food 30 lbs")).toBe("30 lb");
  });

  it("parseAttributes combines everything", () => {
    const a = parseAttributes("Apple iPhone 15 Pro Max 256GB Blue Titanium (Renewed)");
    expect(a).toMatchObject({ storageGb: 256, condition: "refurbished", colors: ["blue titanium"] });
  });
});

describe("title normalization", () => {
  it("normalizes symbols, units and spacing", () => {
    expect(normalizeTitle('Sony® WH-1000XM5   Wireless, 65" TV 256 GB')).toBe("sony wh-1000xm5 wireless 65in tv 256gb");
    expect(normalizeTitle("Café Crème")).toBe("cafe creme");
  });

  it("tokenizes without stopwords", () => {
    expect(tokenize("The Apple iPhone 15 with 128 GB")).toEqual(["apple", "iphone", "15", "128gb"]);
  });

  it("extracts model tokens and variants", () => {
    expect(modelTokens("Apple iPhone 15 Pro 256GB")).toEqual(["15"]);
    expect(modelTokens("Sony WH-1000XM5 Headphones")).toEqual(["WH1000XM5"]);
    expect(variantTokens("iPhone 15 Pro Max")).toEqual(["pro", "max"]);
    expect(variantTokens("Galaxy S24+")).toEqual(["plus"]);
    expect(normalizeModel("wh-1000xm5")).toBe("WH1000XM5");
  });

  it("extracts model numbers", () => {
    expect(extractModel("Samsung 65” QN65S90D OLED 4K")).toBe("QN65S90D");
    expect(extractModel("Sony WH-1000XM5 Wireless")).toBe("WH-1000XM5");
    expect(extractModel("Generic USB cable 6ft")).toBeNull();
  });

  it("extracts and normalizes brands", () => {
    expect(extractBrand("Apple iPhone 15")).toBe("Apple");
    expect(extractBrand("iPhone 15 Pro")).toBe("Apple");
    expect(extractBrand("New Samsung Galaxy S24")).toBe("Samsung");
    expect(extractBrand("Hewlett Packard OfficeJet")).toBe("HP");
    expect(extractBrand("Unknown widget")).toBeNull();
    expect(extractBrand("Acme Rocket", { Acme: ["acme"] })).toBe("Acme");
    expect(normalizeBrand("hewlett-packard")).toBe("HP");
    expect(normalizeBrand("  Some   Brand ")).toBe("Some Brand");
  });
});
