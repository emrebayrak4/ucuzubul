import { describe, expect, it } from "vitest";
import {
  addDays,
  applyBasisPoints,
  createRng,
  discountRatio,
  formatBasisPoints,
  formatCents,
  formatDateShortUS,
  formatDateUS,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  isIsoDate,
  isValidZip,
  nightsBetween,
  normalizeZip,
  parseMoneyToCents,
  percentChange,
  pluralize,
  slugify,
  sumCents,
  truncate,
  zip5,
} from "../src";

describe("money", () => {
  it("formats cents as USD", () => {
    expect(formatCents(129999)).toBe("$1,299.99");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-2500)).toBe("-$25.00");
    expect(formatCents(100000000)).toBe("$1,000,000.00");
  });
  it("supports cents modes and sign", () => {
    expect(formatCents(129900, { cents: "auto" })).toBe("$1,299");
    expect(formatCents(129950, { cents: "auto" })).toBe("$1,299.50");
    expect(formatCents(129950, { cents: "never" })).toBe("$1,300");
    expect(formatCents(500, { signed: true })).toBe("+$5.00");
  });
  it("rejects non-integer cents", () => {
    expect(() => formatCents(12.5)).toThrow(TypeError);
  });
  it("parses money strings without float drift", () => {
    expect(parseMoneyToCents("$1,299.99")).toBe(129999);
    expect(parseMoneyToCents("1299.9")).toBe(129990);
    expect(parseMoneyToCents("1,299")).toBe(129900);
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("19.995")).toBe(2000);
    expect(parseMoneyToCents("-$5.00")).toBe(-500);
    expect(parseMoneyToCents("(5.00)")).toBe(-500);
    expect(parseMoneyToCents("USD 12.50")).toBe(1250);
    expect(parseMoneyToCents(".99")).toBe(99);
    expect(parseMoneyToCents(19.99)).toBe(1999);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("1.2.3")).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
  });
  it("sums and applies rates", () => {
    expect(sumCents([1999, 2999, 1])).toBe(4999);
    expect(applyBasisPoints(10000, 825)).toBe(825);
    expect(applyBasisPoints(1999, 725)).toBe(145);
  });
});

describe("percent", () => {
  it("formats ratios", () => {
    expect(formatPercent(0.125)).toBe("13%");
    expect(formatPercent(0.125, { decimals: 1 })).toBe("12.5%");
    expect(formatPercent(0.05, { signed: true })).toBe("+5%");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatBasisPoints(825)).toBe("8.25%");
  });
  it("computes change and discount", () => {
    expect(percentChange(10000, 8000)).toBeCloseTo(-0.2);
    expect(percentChange(0, 100)).toBeNull();
    expect(discountRatio(10000, 6000)).toBeCloseTo(0.4);
    expect(discountRatio(0, 1)).toBeNull();
  });
});

describe("text", () => {
  it("slugifies", () => {
    expect(slugify("Apple iPhone 16 Pro (256 GB) – Black Titanium")).toBe(
      "apple-iphone-16-pro-256-gb-black-titanium",
    );
    expect(slugify("Crème Brûlée & Co.")).toBe("creme-brulee-and-co");
    expect(slugify("Levi's 501® Original")).toBe("levis-501-original");
    expect(slugify("  --Hello--  ")).toBe("hello");
    expect(slugify("a".repeat(10) + " " + "b".repeat(10), { maxLength: 15 })).toBe("aaaaaaaaaa");
  });
  it("truncates and pluralizes", () => {
    expect(truncate("Hello world", 8)).toBe("Hello w…");
    expect(truncate("Hi", 8)).toBe("Hi");
    expect(pluralize(1, "store")).toBe("1 store");
    expect(pluralize(3, "store")).toBe("3 stores");
  });
});

describe("dates", () => {
  const d = new Date("2026-11-26T20:05:00Z");
  it("formats US dates", () => {
    expect(formatDateUS(d)).toBe("Nov 26, 2026");
    expect(formatDateShortUS(d)).toBe("11/26/2026");
    expect(formatDateUS("2026-01-01T03:00:00Z")).toBe("Dec 31, 2025");
  });
  it("relative time and durations", () => {
    expect(formatRelativeTime(new Date(d.getTime() - 5 * 60_000), d)).toBe("5 minutes ago");
    expect(formatRelativeTime(new Date(d.getTime() + 2 * 86_400_000), d)).toBe("in 2 days");
    expect(formatRelativeTime(d, d)).toBe("just now");
    expect(formatDuration(155)).toBe("2h 35m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
  });
  it("iso helpers", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-2026")).toBe(false);
    expect(addDays("2026-11-26T00:00:00Z", 7).toISOString().slice(0, 10)).toBe("2026-12-03");
    expect(nightsBetween("2026-12-01", "2026-12-04")).toBe(3);
  });
});

describe("zip", () => {
  it("validates US ZIP codes", () => {
    expect(isValidZip("94107")).toBe(true);
    expect(isValidZip("94107-1234")).toBe(true);
    expect(isValidZip("941071234")).toBe(true);
    expect(isValidZip("9410")).toBe(false);
    expect(isValidZip("00000")).toBe(false);
    expect(isValidZip("ABCDE")).toBe(false);
  });
  it("normalizes", () => {
    expect(normalizeZip(" 941071234 ")).toBe("94107-1234");
    expect(normalizeZip("10001")).toBe("10001");
    expect(normalizeZip("bad")).toBeNull();
    expect(zip5("10001-0001")).toBe("10001");
  });
});

describe("rng", () => {
  it("is deterministic", () => {
    const a = createRng("pricora");
    const b = createRng("pricora");
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
