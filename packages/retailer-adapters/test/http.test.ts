import { describe, expect, it } from "vitest";
import {
  AdapterHttpError,
  AdapterTimeoutError,
  CircuitBreaker,
  CircuitOpenError,
  HttpClient,
  TokenBucket,
  TokenCache,
  backoffDelay,
  isRetryableStatus,
  parseRetryAfter,
  toCents,
  isoDurationToMinutes,
  mapAvailability,
  mapCondition,
  isValidGtin,
} from "../src/index";
import { fakeClock, mockFetch } from "./helpers";

describe("TokenBucket", () => {
  it("allows a burst up to capacity then refills over time", () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 2, refillPerSecond: 1 }, clock);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(true);
    expect(b.tryTake()).toBe(false);
    expect(b.waitTimeMs()).toBe(1000);
    clock.advance(500);
    expect(b.tryTake()).toBe(false);
    clock.advance(500);
    expect(b.tryTake()).toBe(true);
  });

  it("take() waits via the clock", async () => {
    const clock = fakeClock();
    const b = new TokenBucket({ capacity: 1, refillPerSecond: 2 }, clock);
    await b.take();
    await b.take();
    expect(clock.slept.reduce((a, c) => a + c, 0)).toBe(500);
  });

  it("rejects invalid config", () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow(RangeError);
  });
});

describe("CircuitBreaker", () => {
  it("opens after N failures, half-opens after the reset timeout, closes on success", () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker("x", { failureThreshold: 2, resetTimeoutMs: 1000 }, clock);
    cb.beforeCall();
    cb.onFailure();
    expect(cb.state).toBe("closed");
    cb.onFailure();
    expect(cb.state).toBe("open");
    expect(() => cb.beforeCall()).toThrow(CircuitOpenError);
    clock.advance(1000);
    expect(cb.state).toBe("half_open");
    cb.beforeCall(); // trial allowed
    expect(() => cb.beforeCall()).toThrow(CircuitOpenError); // only one trial at a time
    cb.onSuccess();
    expect(cb.state).toBe("closed");
  });

  it("a failed half-open trial re-opens", () => {
    const clock = fakeClock();
    const cb = new CircuitBreaker("x", { failureThreshold: 1, resetTimeoutMs: 1000 }, clock);
    cb.onFailure();
    clock.advance(1000);
    cb.beforeCall();
    cb.onFailure();
    expect(cb.state).toBe("open");
  });
});

describe("retry helpers", () => {
  it("backoff is jittered and capped", () => {
    const opts = { retries: 5, baseDelayMs: 100, maxDelayMs: 1000 };
    expect(backoffDelay(0, opts, () => 0.5)).toBe(50);
    expect(backoffDelay(3, opts, () => 0.999)).toBe(799);
    expect(backoffDelay(10, opts, () => 0.999)).toBe(999);
    expect(backoffDelay(2, opts, () => 0)).toBe(0);
  });

  it("parses Retry-After", () => {
    expect(parseRetryAfter("3", 0)).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(parseRetryAfter(null, 0)).toBeNull();
    expect(parseRetryAfter("soon", 0)).toBeNull();
  });

  it("classifies retryable statuses", () => {
    expect([429, 500, 503, 408].every(isRetryableStatus)).toBe(true);
    expect([400, 401, 403, 404].some(isRetryableStatus)).toBe(false);
  });
});

describe("HttpClient", () => {
  const rl = { capacity: 100, refillPerSecond: 100 };

  it("retries 5xx then succeeds", async () => {
    const clock = fakeClock();
    let n = 0;
    const f = mockFetch([]);
    const fetchImpl = async (url: string, init: Parameters<typeof f>[1]) => {
      n++;
      return n < 3 ? { status: 503, ok: false, headers: { get: () => null }, text: async () => "busy" } : f(url, init).then(() => ({ status: 200, ok: true, headers: { get: () => null }, text: async () => '{"ok":true}' }));
    };
    const c = new HttpClient({ adapterId: "t", fetch: fetchImpl, clock, rateLimit: rl, random: () => 0.5 });
    const res = await c.json<{ ok: boolean }>({ url: "https://x.test/a" });
    expect(res.ok).toBe(true);
    expect(n).toBe(3);
    expect(clock.slept.length).toBeGreaterThanOrEqual(2);
  });

  it("honors Retry-After on 429", async () => {
    const clock = fakeClock();
    let n = 0;
    const fetchImpl = async () => {
      n++;
      return n === 1
        ? { status: 429, ok: false, headers: { get: (h: string) => (h === "retry-after" ? "2" : null) }, text: async () => "slow down" }
        : { status: 200, ok: true, headers: { get: () => null }, text: async () => "{}" };
    };
    const c = new HttpClient({ adapterId: "t", fetch: fetchImpl, clock, rateLimit: rl });
    await c.request({ url: "https://x.test" });
    expect(clock.slept).toContain(2000);
  });

  it("does not retry 4xx and throws a typed error", async () => {
    const f = mockFetch([{ match: "x.test", status: 404, body: "nope" }]);
    const c = new HttpClient({ adapterId: "t", fetch: f, clock: fakeClock(), rateLimit: rl });
    await expect(c.request({ url: "https://x.test" })).rejects.toMatchObject({ status: 404, retryable: false });
    expect(f.calls).toHaveLength(1);
  });

  it("gives up after max retries and opens the circuit", async () => {
    const f = mockFetch([{ match: "x.test", status: 500, body: "err" }]);
    const c = new HttpClient({ adapterId: "t", fetch: f, clock: fakeClock(), rateLimit: rl, retry: { retries: 2 }, circuit: { failureThreshold: 3 } });
    await expect(c.request({ url: "https://x.test" })).rejects.toBeInstanceOf(AdapterHttpError);
    expect(f.calls).toHaveLength(3);
    await expect(c.request({ url: "https://x.test" })).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it("times out slow requests", async () => {
    const never = () => new Promise<never>(() => undefined);
    const c = new HttpClient({ adapterId: "t", fetch: never, timeoutMs: 20, retry: { retries: 0 }, rateLimit: rl });
    await expect(c.request({ url: "https://x.test" })).rejects.toBeInstanceOf(AdapterTimeoutError);
  });

  it("retries network errors", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      if (n === 1) throw new Error("ECONNRESET");
      return { status: 200, ok: true, headers: { get: () => null }, text: async () => "ok" };
    };
    const c = new HttpClient({ adapterId: "t", fetch: fetchImpl, clock: fakeClock(), rateLimit: rl });
    expect((await c.request({ url: "https://x.test" })).attempts).toBe(2);
  });

  it("rate-limits through the token bucket", async () => {
    const clock = fakeClock();
    const f = mockFetch([{ match: "x.test", body: "{}" }]);
    const c = new HttpClient({ adapterId: "t", fetch: f, clock, rateLimit: { capacity: 1, refillPerSecond: 1 } });
    await c.request({ url: "https://x.test" });
    await c.request({ url: "https://x.test" });
    expect(clock.slept.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("rejects invalid JSON", async () => {
    const f = mockFetch([{ match: "x.test", body: "<html>" }]);
    const c = new HttpClient({ adapterId: "t", fetch: f, clock: fakeClock(), rateLimit: rl });
    await expect(c.json({ url: "https://x.test" })).rejects.toBeInstanceOf(AdapterHttpError);
  });
});

describe("TokenCache", () => {
  it("caches until 60s before expiry and coalesces concurrent refreshes", async () => {
    const clock = fakeClock();
    const cache = new TokenCache(clock);
    let issued = 0;
    const issue = async () => ({ accessToken: `t${++issued}`, expiresInSec: 3600 });
    const [a, b] = await Promise.all([cache.get(issue), cache.get(issue)]);
    expect([a, b]).toEqual(["t1", "t1"]);
    clock.advance(3500 * 1000);
    expect(await cache.get(issue)).toBe("t1");
    clock.advance(60 * 1000);
    expect(await cache.get(issue)).toBe("t2");
    cache.invalidate();
    expect(await cache.get(issue)).toBe("t3");
  });
});

describe("util", () => {
  it("toCents parses safely without float drift", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("1,299.99")).toBe(129999);
    expect(toCents("$5")).toBe(500);
    expect(toCents("199.99 USD")).toBe(19999);
    expect(toCents("USD 12.5")).toBe(1250);
    expect(toCents("12.345")).toBe(1235);
    expect(toCents("-1")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(Number.NaN)).toBeNull();
  });

  it("maps availability and condition vocabularies", () => {
    expect(mapAvailability("In Stock")).toBe("in_stock");
    expect(mapAvailability("IN_STOCK_SCARCE")).toBe("limited");
    expect(mapAvailability("Not available")).toBe("out_of_stock");
    expect(mapAvailability("PREORDER")).toBe("preorder");
    expect(mapAvailability(false)).toBe("out_of_stock");
    expect(mapAvailability("weird")).toBe("unknown");
    expect(mapCondition("Certified - Refurbished")).toBe("refurbished");
    expect(mapCondition("Open box")).toBe("open_box");
    expect(mapCondition("Pre-Owned")).toBe("used");
    expect(mapCondition(undefined)).toBe("new");
  });

  it("parses ISO-8601 durations and GTINs", () => {
    expect(isoDurationToMinutes("PT8H5M")).toBe(485);
    expect(isoDurationToMinutes("P1DT2H")).toBe(1560);
    expect(isoDurationToMinutes("PT")).toBeNull();
    expect(isoDurationToMinutes("garbage")).toBeNull();
    expect(isValidGtin("036000291452")).toBe(true);
    expect(isValidGtin("036000291453")).toBe(false);
  });
});
