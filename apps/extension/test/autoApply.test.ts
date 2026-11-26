// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isShown,
  looksLikeOrderButton,
  parseTotalText,
  runAutoApply,
  UNSUPPORTED_MESSAGE,
  type AutoApplyProgress,
  type CouponAttempt,
} from "../src/content/autoApply";
import { FIXTURE_CONFIG, installFakeCheckout, loadCheckoutFixture } from "./fixtures/fakeCheckout";

const timing = { applyTimeoutMs: 400, pollMs: 5, settleMs: 40 };
const coupons = (...codes: string[]) => codes.map((code, i) => ({ id: `c${i + 1}`, code }));

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("parseTotalText", () => {
  it("parses the last amount in the text", () => {
    expect(parseTotalText("Order total: $1,234.56")).toBe(123456);
    expect(parseTotalText("$100.00")).toBe(10000);
    expect(parseTotalText("Items (2) $19.99")).toBe(1999);
    expect(parseTotalText("Total")).toBeNull();
    expect(parseTotalText(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("detects order/payment buttons", () => {
    const b = document.createElement("button");
    for (const label of ["Place order", "Place your order", "Pay now", "Complete purchase", "Buy now", "Submit Order"]) {
      b.textContent = label;
      expect(looksLikeOrderButton(b), label).toBe(true);
    }
    for (const label of ["Apply", "Apply code", "Remove", "Redeem"]) {
      b.textContent = label;
      expect(looksLikeOrderButton(b), label).toBe(false);
    }
  });

  it("isShown honours hidden ancestors", () => {
    document.body.innerHTML = `<div id="a" hidden><span id="b">x</span></div><span id="c" style="display:none">y</span><span id="d">z</span>`;
    expect(isShown(document.getElementById("b"))).toBe(false);
    expect(isShown(document.getElementById("c"))).toBe(false);
    expect(isShown(document.getElementById("d"))).toBe(true);
    expect(isShown(null)).toBe(false);
  });
});

describe("runAutoApply", () => {
  it("tries codes in order, reports each outcome, and leaves the best code applied", async () => {
    const page = installFakeCheckout(document, { validCodes: { SAVE10: 1000, SAVE25: 2500 } });
    const reports: CouponAttempt[] = [];
    const phases: AutoApplyProgress["phase"][] = [];
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("BAD1", "SAVE10", "SAVE25", "BAD2"), 10, {
      doc: document,
      timing,
      report: (a) => {
        reports.push(a);
      },
      onProgress: (p) => phases.push(p.phase),
    });

    expect(result.status).toBe("done");
    expect(result.startTotalCents).toBe(10000);
    expect(result.best).toEqual({ couponId: "c3", code: "SAVE25", savingsCents: 2500 });
    expect(result.finalTotalCents).toBe(7500);
    expect(page.appliedCode).toBe("SAVE25");
    expect(reports.map((r) => [r.code, r.worked, r.savingsCents])).toEqual([
      ["BAD1", false, 0],
      ["SAVE10", true, 1000],
      ["SAVE25", true, 2500],
      ["BAD2", false, 0],
    ]);
    expect(reports[0]?.signal).toBe("error_indicator");
    expect(reports[1]?.signal).toBe("success_indicator");
    expect(reports.every((r) => r.totalBeforeCents === 10000)).toBe(true);
    expect(phases).toContain("reapplying");
    expect(page.placeOrderClicks).toBe(0);
  });

  it("does not re-apply when the best code is the one still applied", async () => {
    const page = installFakeCheckout(document, { validCodes: { SAVE5: 500, SAVE30: 3000 } });
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("SAVE5", "SAVE30"), 10, { doc: document, timing });
    expect(result.best?.code).toBe("SAVE30");
    expect(result.finalTotalCents).toBe(7000);
    expect(page.applyClicks).toBe(2);
  });

  it("reports unsupported and touches nothing when required selectors are missing", async () => {
    const page = installFakeCheckout(document, { validCodes: { SAVE10: 1000 } });
    const report = vi.fn();
    const result = await runAutoApply({ ...FIXTURE_CONFIG, couponInputSelector: "#does-not-exist" }, coupons("SAVE10"), 10, {
      doc: document,
      timing,
      report,
    });
    expect(result.status).toBe("unsupported");
    expect(result.message).toBe(UNSUPPORTED_MESSAGE);
    expect(report).not.toHaveBeenCalled();
    expect(page.applyClicks).toBe(0);
  });

  it("treats an invalid selector as missing", async () => {
    installFakeCheckout(document, { validCodes: {} });
    const result = await runAutoApply({ ...FIXTURE_CONFIG, totalSelector: "##bad[" }, coupons("X"), 10, { doc: document, timing });
    expect(result.status).toBe("unsupported");
  });

  it("refuses to click an apply selector that points at the Place order button", async () => {
    const page = installFakeCheckout(document, { validCodes: { SAVE10: 1000 } });
    const result = await runAutoApply({ ...FIXTURE_CONFIG, applyButtonSelector: "#place-order" }, coupons("SAVE10"), 10, {
      doc: document,
      timing,
    });
    expect(result.status).toBe("unsupported");
    expect(page.placeOrderClicks).toBe(0);
  });

  it("keeps the first working code and stops when the store has no remove control", async () => {
    const page = installFakeCheckout(document, { validCodes: { SAVE10: 1000, SAVE25: 2500 }, removable: false });
    const report = vi.fn();
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("BAD", "SAVE10", "SAVE25"), 10, { doc: document, timing, report });
    expect(result.status).toBe("done");
    expect(result.best?.code).toBe("SAVE10");
    expect(report).toHaveBeenCalledTimes(2);
    expect(page.appliedCode).toBe("SAVE10");
  });

  it("respects maxCodes", async () => {
    const page = installFakeCheckout(document, { validCodes: {} });
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("A", "B", "C", "D", "E"), 2, { doc: document, timing });
    expect(result.attempts).toHaveLength(2);
    expect(page.applyClicks).toBe(2);
    expect(result.message).toBe("None of the codes worked for this order.");
  });

  it("detects success from a total change alone (no indicator selectors)", async () => {
    installFakeCheckout(document, { validCodes: { SAVE10: 1000 }, indicators: false });
    const result = await runAutoApply(
      { ...FIXTURE_CONFIG, successIndicatorSelector: null, errorIndicatorSelector: null },
      coupons("NOPE", "SAVE10"),
      10,
      { doc: document, timing },
    );
    expect(result.attempts.map((a) => [a.code, a.worked, a.signal])).toEqual([
      ["NOPE", false, "timeout"],
      ["SAVE10", true, "total_changed"],
    ]);
    expect(result.finalTotalCents).toBe(9000);
  });

  it("times out on a code the site ignores and moves on", async () => {
    installFakeCheckout(document, { validCodes: { SAVE10: 1000 }, ignoredCodes: ["SILENT"] });
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("SILENT", "SAVE10"), 10, { doc: document, timing });
    expect(result.attempts[0]).toMatchObject({ code: "SILENT", worked: false, signal: "timeout" });
    expect(result.best?.code).toBe("SAVE10");
  });

  it("can be cancelled between codes", async () => {
    installFakeCheckout(document, { validCodes: {} });
    const ctrl = new AbortController();
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("A", "B", "C"), 10, {
      doc: document,
      timing,
      signal: ctrl.signal,
      report: () => ctrl.abort(),
    });
    expect(result.status).toBe("cancelled");
    expect(result.attempts).toHaveLength(1);
  });

  it("stops with unsupported if the coupon field disappears mid-run", async () => {
    installFakeCheckout(document, { validCodes: {} });
    const result = await runAutoApply(FIXTURE_CONFIG, coupons("A", "B"), 10, {
      doc: document,
      timing,
      report: () => document.getElementById("promo")?.remove(),
    });
    expect(result.status).toBe("unsupported");
    expect(result.attempts).toHaveLength(1);
  });

  it("skips coupons without a code and does nothing for an empty list", async () => {
    loadCheckoutFixture(document);
    const result = await runAutoApply(FIXTURE_CONFIG, [{ id: "x", code: null }], 10, { doc: document, timing });
    expect(result.status).toBe("done");
    expect(result.attempts).toHaveLength(0);
  });

  it("fires input/change events so framework-controlled inputs see the value", async () => {
    installFakeCheckout(document, { validCodes: { SAVE10: 1000 } });
    const seen: string[] = [];
    document.getElementById("promo")?.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    await runAutoApply(FIXTURE_CONFIG, coupons("SAVE10"), 10, { doc: document, timing });
    expect(seen).toContain("SAVE10");
  });
});
