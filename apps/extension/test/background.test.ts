import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, createApi, type PricoraApi } from "../src/background/api";
import { createBackground } from "../src/background/service";
import { TTL, TtlCache, type KeyValueArea } from "../src/shared/cache";
import type { RetailerCheckoutConfig } from "../src/shared/types";

function memoryArea(): KeyValueArea & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(keys) {
      const list = keys === null ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, structuredClone(v));
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) data.delete(k);
    },
  };
}

const targetConfig: RetailerCheckoutConfig = {
  retailerSlug: "target",
  retailerName: "Target",
  enabled: true,
  hostPatterns: ["target.com"],
  checkoutUrlPatterns: ["/checkout*"],
  couponInputSelector: "#promo",
  applyButtonSelector: "#apply",
  totalSelector: "#total",
  successIndicatorSelector: null,
  errorIndicatorSelector: null,
  removeButtonSelector: null,
  version: 1,
};

function fakeApi(overrides: Partial<PricoraApi> = {}): PricoraApi & { calls: string[] } {
  const calls: string[] = [];
  const api: PricoraApi = {
    extensionConfig: vi.fn(async () => {
      calls.push("config");
      return [targetConfig, { ...targetConfig, retailerSlug: "walmart", retailerName: "Walmart", enabled: false, hostPatterns: ["walmart.com"] }];
    }),
    coupons: vi.fn(async (host: string) => {
      calls.push(`coupons:${host}`);
      return {
        retailer: { id: "r_target", slug: "target", name: "Target" },
        coupons: [
          { id: "k1", code: "SAVE10", title: "10% off", successRate: 0.4 },
          { id: "k2", code: "TAKE20", title: "$20 off $100", successRate: 0.9 },
          { id: "k3", code: null, title: "Free shipping" },
        ],
      };
    }),
    product: vi.fn(async (url: string) => {
      calls.push(`product:${url}`);
      return {
        matched: true,
        product: { slug: "demo-tv", title: "Demo TV", hasDemoData: true },
        current: { offerId: "o1", retailerName: "Amazon", retailerSlug: "amazon", estimatedTotalCents: 50000, currency: "USD", source: "demo", goUrl: "/v1/go/o1" },
        cheapest: { offerId: "o2", retailerName: "Walmart", retailerSlug: "walmart", estimatedTotalCents: 45000, currency: "USD", source: "demo", goUrl: "/v1/go/o2" },
      };
    }),
    me: vi.fn(async () => ({ user: null, csrfToken: "t" })),
    followStore: vi.fn(async () => undefined),
    reportCouponResult: vi.fn(async () => undefined),
    ...overrides,
  };
  return Object.assign(api, { calls });
}

let local: ReturnType<typeof memoryArea>;
let session: ReturnType<typeof memoryArea>;
beforeEach(() => {
  local = memoryArea();
  session = memoryArea();
});

describe("TtlCache", () => {
  it("serves fresh data, reloads when stale, and falls back to stale on error", async () => {
    let t = 1_000_000;
    const cache = new TtlCache(memoryArea(), () => t);
    const load = vi.fn(async () => "v1");
    expect((await cache.getOrLoad("k", TTL.coupons, load)).data).toBe("v1");
    expect((await cache.getOrLoad("k", TTL.coupons, load)).data).toBe("v1");
    expect(load).toHaveBeenCalledTimes(1);
    t += TTL.coupons + 1;
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await cache.getOrLoad("k", TTL.coupons, failing)).toEqual({ data: "v1", stale: true });
    await expect(cache.getOrLoad("other", TTL.coupons, failing)).rejects.toThrow("down");
  });

  it("shares one request between concurrent loads of the same key", async () => {
    const cache = new TtlCache(memoryArea());
    const load = vi.fn(() => new Promise<string>((r) => setTimeout(() => r("v"), 10)));
    const [a, b] = await Promise.all([cache.getOrLoad("k", 1000, load), cache.getOrLoad("k", 1000, load)]);
    expect(a.data).toBe("v");
    expect(b.data).toBe("v");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("clearAll removes only cache keys", async () => {
    const area = memoryArea();
    await area.set({ settings: { a: 1 } });
    const cache = new TtlCache(area);
    await cache.write("x", 1);
    await cache.clearAll();
    expect([...area.data.keys()]).toEqual(["settings"]);
  });
});

describe("background service", () => {
  it("never calls the API for unsupported sites", async () => {
    const api = fakeApi();
    const bg = createBackground({ api, local, session });
    expect((await bg.popupState("https://news.example.com/article")).kind).toBe("unsupported");
    expect(await bg.badgeText("https://news.example.com/")).toBe("");
    expect(await bg.productLookup("https://news.example.com/dp/B0TEST1234")).toEqual({ kind: "none" });
    expect(api.calls.filter((c) => c !== "config")).toEqual([]);
    expect(api.me).not.toHaveBeenCalled();
  });

  it("builds the popup state for a supported store and caches coupons per store in session storage", async () => {
    const api = fakeApi();
    const bg = createBackground({ api, local, session });
    const s = await bg.popupState("https://www.target.com/p/thing/-/A-12345678");
    expect(s.kind).toBe("store");
    if (s.kind !== "store") return;
    expect(s.store).toMatchObject({ slug: "target", name: "Target" });
    expect(s.coupons.map((c) => c.id)).toEqual(["k2", "k1", "k3"]);
    expect(s.checkoutSupported).toBe(true);
    await bg.popupState("https://target.com/");
    expect(api.calls.filter((c) => c.startsWith("coupons:"))).toEqual(["coupons:target.com"]);
    expect([...session.data.keys()]).toContain("cache:coupons:target.com");
    expect([...local.data.keys()].some((k) => k.includes("coupons"))).toBe(false);
  });

  it("badge shows the number of usable codes", async () => {
    const bg = createBackground({ api: fakeApi(), local, session });
    expect(await bg.badgeText("https://www.target.com/")).toBe("2");
    await bg.setSettings({ couponFinder: false });
    expect(await bg.badgeText("https://www.target.com/")).toBe("");
  });

  it("product lookup: only parsed product pages, minimized URL, go-link through the API", async () => {
    const api = fakeApi();
    const bg = createBackground({ api, local, session });
    expect(await bg.productLookup("https://www.amazon.com/gp/cart/view.html")).toEqual({ kind: "none" });
    const res = await bg.productLookup("https://www.amazon.com/dp/B0TEST1234?tag=x-20&psc=1");
    expect(api.calls).toContain("product:https://www.amazon.com/dp/B0TEST1234");
    expect(res.kind).toBe("cheaper");
    if (res.kind !== "cheaper") return;
    expect(res.cheapest.source).toBe("demo");
    expect(res.hasDemoData).toBe(true);
    expect(res.goUrl).toBe("http://localhost:4400/v1/go/o2?placement=extension_banner");
  });

  it("product lookup: no banner when not cheaper, disabled, or go URL points elsewhere", async () => {
    const notCheaper = fakeApi({
      product: async () => ({
        matched: true,
        product: null,
        current: { offerId: "o1", retailerName: "Amazon", retailerSlug: null, estimatedTotalCents: 40000, currency: "USD", source: "api", goUrl: null },
        cheapest: { offerId: "o2", retailerName: "Walmart", retailerSlug: null, estimatedTotalCents: 40000, currency: "USD", source: "api", goUrl: null },
      }),
    });
    expect(await createBackground({ api: notCheaper, local, session }).productLookup("https://www.amazon.com/dp/B0TEST1234")).toEqual({ kind: "none" });

    const evil = fakeApi({
      product: async () => ({
        matched: true,
        product: null,
        current: null,
        cheapest: { offerId: "o2", retailerName: "X", retailerSlug: null, estimatedTotalCents: 1, currency: "USD", source: "api", goUrl: "https://evil.example/phish" },
      }),
    });
    const s2 = memoryArea();
    const res = await createBackground({ api: evil, local: memoryArea(), session: s2 }).productLookup("https://www.amazon.com/dp/B0TEST1234");
    // foreign goUrl is ignored and replaced by the API's own /v1/go/:offerId
    expect(res.kind === "cheaper" && res.goUrl).toBe("http://localhost:4400/v1/go/o2?placement=extension_banner");

    const api = fakeApi();
    const bg = createBackground({ api, local: memoryArea(), session: memoryArea() });
    await bg.setSettings({ priceComparison: false });
    expect(await bg.productLookup("https://www.amazon.com/dp/B0TEST1234")).toEqual({ kind: "none" });
    expect(api.calls.some((c) => c.startsWith("product:"))).toBe(false);
  });

  it("checkout match requires an enabled config whose patterns match", async () => {
    const bg = createBackground({ api: fakeApi(), local, session });
    const m = await bg.checkoutMatch("https://www.target.com/checkout");
    expect(m.kind).toBe("available");
    if (m.kind === "available") expect(m.coupons.map((c) => c.code)).toEqual(["TAKE20", "SAVE10"]);
    expect((await bg.checkoutMatch("https://www.target.com/cart")).kind).toBe("none");
    expect((await bg.checkoutMatch("https://www.walmart.com/checkout")).kind).toBe("none"); // config disabled
    await bg.setSettings({ couponFinder: false });
    expect((await bg.checkoutMatch("https://www.target.com/checkout")).kind).toBe("none");
  });

  it("config is cached for 24h in local storage", async () => {
    let t = 5_000_000;
    const api = fakeApi();
    const bg = createBackground({ api, local, session, now: () => t });
    await bg.getConfigs();
    await bg.getConfigs();
    expect(api.extensionConfig).toHaveBeenCalledTimes(1);
    t += TTL.config + 1;
    await bg.getConfigs();
    expect(api.extensionConfig).toHaveBeenCalledTimes(2);
  });

  it("coupon results are only sent when sharing is on, and sanitized", async () => {
    const api = fakeApi();
    const bg = createBackground({ api, local, session });
    await bg.couponResult({ couponId: "k1", worked: false, orderTotalCents: 10000, savingsCents: 500 });
    const deviceId = (vi.mocked(api.reportCouponResult).mock.calls[0]?.[1] as { deviceId?: string }).deviceId;
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(api.reportCouponResult).toHaveBeenCalledWith("k1", { worked: false, orderTotalCents: 10000, savingsCents: undefined, source: "extension", deviceId });
    await bg.couponResult({ couponId: "k2", worked: true, orderTotalCents: -3, savingsCents: 1.5 });
    expect(api.reportCouponResult).toHaveBeenLastCalledWith("k2", { worked: true, orderTotalCents: undefined, savingsCents: undefined, source: "extension", deviceId });
    await bg.setSettings({ shareResults: false });
    await bg.couponResult({ couponId: "k3", worked: true, savingsCents: 100 });
    expect(api.reportCouponResult).toHaveBeenCalledTimes(2);
  });

  it("follow maps API errors to friendly messages", async () => {
    const notFound = fakeApi({ followStore: async () => Promise.reject(new ApiRequestError("x", 404)) });
    expect(await createBackground({ api: notFound, local, session }).follow("r1")).toEqual({ ok: false, error: "Following stores isn't available yet." });
    const anon = fakeApi({ followStore: async () => Promise.reject(new ApiRequestError("x", 401)) });
    expect((await createBackground({ api: anon, local, session }).follow("r1")).ok).toBe(false);
    expect(await createBackground({ api: fakeApi(), local, session }).follow("r1")).toEqual({ ok: true });
  });
});

describe("api client", () => {
  it("sends anonymous reads without cookies and account calls with cookies + CSRF", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      const u = new URL(String(url));
      const body =
        u.pathname === "/v1/auth/me"
          ? { user: { id: "u1", email: "a@b.c", name: "A" }, csrfToken: "csrf123" }
          : u.pathname === "/v1/extension/config"
            ? { version: "v", generatedAt: "2026-11-26T00:00:00.000Z", configs: [targetConfig, { broken: true }, { ...targetConfig, totalSelector: null }] }
            : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    const api = createApi({ origin: "http://localhost:4400", fetch: fetchMock as unknown as typeof fetch });

    const configs = await api.extensionConfig();
    expect(configs).toHaveLength(1); // invalid entry and entry without required selectors dropped
    expect(configs[0]?.enabled).toBe(true);
    expect(seen[0]?.init.credentials).toBe("omit");

    await api.followStore("target");
    const post = seen.find((s) => s.url.endsWith("/v1/me/coupon-follows"));
    expect(post?.init.credentials).toBe("include");
    expect((post?.init.headers as Record<string, string>)["x-csrf-token"]).toBe("csrf123");

    await api.reportCouponResult("k 1", { worked: true, source: "extension" });
    const report = seen.at(-1);
    expect(report?.url).toBe("http://localhost:4400/v1/coupons/k%201/result");
    expect(report?.init.credentials).toBe("omit");
  });

  it("maps error envelopes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Nope" } }), { status: 404 }));
    const api = createApi({ origin: "http://localhost:4400", fetch: fetchMock as unknown as typeof fetch });
    await expect(api.coupons("target.com")).rejects.toMatchObject({ status: 404, code: "not_found", message: "Nope" });
  });
});
