import { describe, expect, it, vi } from "vitest";
import { EVENT_NAMES, analytics, consoleSink, createAnalytics, isEventName, memorySink, noopSink, sanitizeProperties, track, type AnalyticsSink } from "../src/index";

const NOW = () => new Date("2026-11-26T12:00:00Z");

describe("event catalog", () => {
  it("contains the core events", () => {
    for (const e of ["search_performed", "product_viewed", "offer_clicked", "alert_created", "flight_search", "hotel_search", "signup", "login", "basket_optimized"]) {
      expect(isEventName(e)).toBe(true);
    }
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
    expect(isEventName("made_up")).toBe(false);
  });
});

describe("createAnalytics", () => {
  it("delivers typed events to sinks with context and timestamp", () => {
    const mem = memorySink();
    const a = createAnalytics({ context: { app: "web", anonymousId: "anon-1" }, sinks: [mem], now: NOW });
    const ev = a.track("offer_clicked", { offerId: "o1", productId: "p1", retailerId: "bestbuy", position: 1, priceCents: 9999, isSponsored: false, source: "demo" });
    expect(ev?.timestamp).toBe("2026-11-26T12:00:00.000Z");
    expect(mem.events).toHaveLength(1);
    expect(mem.events[0]?.context).toEqual({ app: "web", anonymousId: "anon-1" });
    expect(mem.events[0]?.properties).toMatchObject({ offerId: "o1", priceCents: 9999 });
  });

  it("is a no-op when disabled (consent) and by default", () => {
    const mem = memorySink();
    const a = createAnalytics({ context: { app: "web" }, sinks: [mem], enabled: false });
    expect(a.track("logout", {})).toBeNull();
    expect(mem.events).toHaveLength(0);
    a.setEnabled(true);
    a.track("logout", {});
    expect(mem.events).toHaveLength(1);
    // default instance uses the no-op sink
    expect(track("logout", {})).not.toBeNull();
  });

  it("strips PII keys and redacts PII-looking values", () => {
    const mem = memorySink();
    const a = createAnalytics({ context: { app: "api" }, sinks: [mem] });
    // Simulate an untyped caller passing PII through a cast.
    a.track("signup", { method: "email", email: "jane@example.com", note: "call 415-555-0100" } as never);
    a.track("page_viewed", { route: "/search", card: "4111 1111 1111 1111" } as never);
    a.track("page_viewed", { route: "/x", meta: { password: "hunter2", ok: 1 } } as never);
    expect(mem.events[0]?.properties).toEqual({ method: "email", note: "[redacted]" });
    expect(mem.events[0]?.redactions).toEqual(["email", "note"]);
    expect(mem.events[1]?.properties).toEqual({ route: "/search" });
    expect(mem.events[2]?.properties).toEqual({ route: "/x", meta: { ok: 1 } });
  });

  it("does not redact ordinary ids and numbers", () => {
    const r = sanitizeProperties({ productId: "5689919121", offerId: "123456789012", when: "2026-11-26T12:00:00Z", priceCents: 4111111111111111 });
    expect(r.redactions).toEqual([]);
  });

  it("rejects unknown event names at runtime", () => {
    const onError = vi.fn();
    const a = createAnalytics({ context: { app: "web" }, sinks: [memorySink()], onError });
    expect(a.track("nope" as never, {} as never)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("never throws when a sink fails; async sinks are flushed", async () => {
    const onError = vi.fn();
    const sent: string[] = [];
    const bad: AnalyticsSink = { name: "bad", send: () => { throw new Error("boom"); } };
    const slow: AnalyticsSink = { name: "slow", send: async (e) => { await new Promise((r) => setTimeout(r, 5)); sent.push(e.name); }, flush: vi.fn() };
    const rejecting: AnalyticsSink = { name: "rej", send: () => Promise.reject(new Error("nope")) };
    const a = createAnalytics({ context: { app: "worker" }, sinks: [bad, slow, rejecting], onError });
    expect(() => a.track("logout", {})).not.toThrow();
    await a.flush();
    expect(sent).toEqual(["logout"]);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(slow.flush).toHaveBeenCalled();
  });

  it("console sink prints in dev; setContext/setSinks work", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const a = createAnalytics({ context: { app: "web" }, sinks: [noopSink] });
    a.setSinks([consoleSink("[t]")]);
    a.setContext({ sessionId: "s1" });
    const ev = a.track("sort_changed", { sort: "lowest_total" });
    expect(spy).toHaveBeenCalledWith("[t]", "sort_changed", { sort: "lowest_total" });
    expect(ev?.context.sessionId).toBe("s1");
    spy.mockRestore();
    expect(analytics).toBeDefined();
  });
});
