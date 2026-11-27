import { describe, expect, it } from "vitest";
import { parseEdgeZip } from "../src/edge-geo";

describe("parseEdgeZip", () => {
  it("reads Vercel headers (Headers-like and plain object)", () => {
    const h = new Headers({ "x-vercel-ip-country": "US", "x-vercel-ip-country-region": "NY", "x-vercel-ip-postal-code": "10001" });
    expect(parseEdgeZip(h)).toEqual({ zip: "10001", state: "NY", source: "vercel" });
    expect(parseEdgeZip({ "x-vercel-ip-country": "US", "x-vercel-ip-postal-code": "94107" })).toEqual({ zip: "94107", state: null, source: "vercel" });
  });
  it("reads Cloudflare headers", () => {
    expect(parseEdgeZip({ "cf-ipcountry": "US", "cf-region-code": "TX", "cf-postal-code": "78701" })).toEqual({ zip: "78701", state: "TX", source: "cloudflare" });
  });
  it("ignores non-US visitors and junk", () => {
    expect(parseEdgeZip({ "x-vercel-ip-country": "CA", "x-vercel-ip-postal-code": "M5V" }).source).toBe("none");
    expect(parseEdgeZip({ "x-vercel-ip-country": "US", "x-vercel-ip-postal-code": "00000" }).source).toBe("none");
    expect(parseEdgeZip({}).source).toBe("none");
  });
});
