/**
 * Checkout coupon tester ("Try them"). Runs only after an explicit user click in the checkout panel.
 *
 * Safety rules (enforced here, covered by tests):
 *  - only ever clicks the store config's apply / remove buttons; never anything that looks like "Place order" / "Pay now";
 *  - never submits an order, never touches payment fields;
 *  - stops immediately if a required selector is missing → "unsupported";
 *  - tests at most `maxCodes` codes (capped by HARD_MAX_CODES upstream) and can be cancelled.
 */
import { parseMoneyToCents } from "@pricora/utils";
import type { RetailerCheckoutConfig } from "../shared/types";

export const UNSUPPORTED_MESSAGE = "This store's checkout isn't supported yet";

export type AutoApplyPhase = "checking" | "testing" | "removing" | "reapplying" | "done" | "unsupported" | "cancelled";

export interface CouponToTry {
  id: string;
  code: string | null;
  title?: string;
}

export type OutcomeSignal = "success_indicator" | "error_indicator" | "total_changed" | "timeout";

export interface CouponAttempt {
  couponId: string;
  code: string;
  worked: boolean;
  signal: OutcomeSignal;
  totalBeforeCents: number | null;
  totalAfterCents: number | null;
  savingsCents: number;
}

export interface AutoApplyProgress {
  phase: AutoApplyPhase;
  /** 1-based index of the code being tested (0 when not testing a specific code). */
  index: number;
  total: number;
  code?: string;
}

export interface AutoApplyResult {
  status: "done" | "unsupported" | "cancelled";
  message: string;
  attempts: CouponAttempt[];
  best: { couponId: string; code: string; savingsCents: number } | null;
  startTotalCents: number | null;
  finalTotalCents: number | null;
}

export interface AutoApplyTiming {
  /** Max wait for a success/error indicator or total change after clicking apply. */
  applyTimeoutMs: number;
  /** Poll interval while waiting. */
  pollMs: number;
  /** Extra wait for the total to update after an indicator appeared / after removing a code. */
  settleMs: number;
}

export const DEFAULT_TIMING: AutoApplyTiming = { applyTimeoutMs: 8000, pollMs: 150, settleMs: 900 };

export interface AutoApplyDeps {
  doc: Document;
  /** Called once per tested code (the caller forwards it to the background, which respects the sharing toggle). */
  report?: (attempt: CouponAttempt) => void | Promise<void>;
  onProgress?: (p: AutoApplyProgress) => void;
  signal?: AbortSignal;
  timing?: Partial<AutoApplyTiming>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type AutoApplyConfig = Pick<
  RetailerCheckoutConfig,
  | "couponInputSelector"
  | "applyButtonSelector"
  | "totalSelector"
  | "successIndicatorSelector"
  | "errorIndicatorSelector"
  | "removeButtonSelector"
>;

const DANGEROUS_LABEL =
  /\b(place|submit|complete|confirm|review)\s+(my\s+|your\s+|the\s+)?(order|purchase|payment)\b|\bcomplete\s+checkout\b|\bpay\s+now\b|\bbuy\s+now\b|\bpurchase\s+now\b|\bpay\s+\$/i;

/** True when an element's visible label looks like an order/payment action. Such elements are never clicked. */
export function looksLikeOrderButton(el: Element): boolean {
  const parts = [
    el.textContent ?? "",
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("value") ?? "",
    el.getAttribute("title") ?? "",
  ];
  return DANGEROUS_LABEL.test(parts.join(" ").replace(/\s+/g, " "));
}

export function safeQuery(doc: Document, selector: string | null | undefined): Element | null {
  if (!selector) return null;
  try {
    return doc.querySelector(selector);
  } catch {
    return null; // invalid selector from config → treated as missing
  }
}

/** Shown = attached, not hidden by attribute / aria-hidden / display:none / visibility:hidden on itself or an ancestor. */
export function isShown(el: Element | null): boolean {
  if (!el || !el.isConnected) return false;
  const view = el.ownerDocument.defaultView;
  let node: Element | null = el;
  for (let depth = 0; node && depth < 25; depth++, node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  }
  return true;
}

/** Extracts the last money amount in a text ("Order total: $1,234.56" → 123456). */
export function parseTotalText(text: string | null | undefined): number | null {
  if (!text) return null;
  const matches = text.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g);
  if (!matches || matches.length === 0) return null;
  const cents = parseMoneyToCents(matches[matches.length - 1] as string);
  return cents !== null && cents >= 0 ? cents : null;
}

/** Sets an input's value in a way framework-controlled inputs (React/Vue) notice, then fires input + change. */
export function fillInput(input: Element, value: string): void {
  const el = input as HTMLInputElement;
  const proto = Object.getPrototypeOf(el) as object | null;
  const setter = proto ? Object.getOwnPropertyDescriptor(proto, "value")?.set : undefined;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.focus?.();
  const EventCtor = el.ownerDocument.defaultView?.Event ?? Event;
  el.dispatchEvent(new EventCtor("input", { bubbles: true }));
  el.dispatchEvent(new EventCtor("change", { bubbles: true }));
}

function indicatorState(doc: Document, selector: string | null | undefined): string {
  const el = safeQuery(doc, selector);
  return isShown(el) ? `shown:${(el?.textContent ?? "").trim()}` : "hidden";
}

type CodedCoupon = CouponToTry & { code: string };

export async function runAutoApply(
  config: AutoApplyConfig,
  coupons: readonly CouponToTry[],
  maxCodes: number,
  deps: AutoApplyDeps,
): Promise<AutoApplyResult> {
  const { doc } = deps;
  const timing: AutoApplyTiming = { ...DEFAULT_TIMING, ...deps.timing };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  const list = coupons
    .filter((c): c is CodedCoupon => typeof c.code === "string" && c.code.trim() !== "")
    .slice(0, Math.max(0, Math.floor(maxCodes)));
  const attempts: CouponAttempt[] = [];

  const q = (sel: string | null | undefined) => safeQuery(doc, sel);
  const readTotal = () => parseTotalText(q(config.totalSelector)?.textContent);
  const aborted = () => deps.signal?.aborted === true;
  const progress = (phase: AutoApplyPhase, index = 0, code?: string) =>
    deps.onProgress?.({ phase, index, total: list.length, code });

  const finish = (
    status: AutoApplyResult["status"],
    message: string,
    best: AutoApplyResult["best"],
    startTotalCents: number | null,
  ): AutoApplyResult => {
    progress(status);
    return { status, message, attempts, best, startTotalCents, finalTotalCents: readTotal() };
  };

  progress("checking");
  const input0 = q(config.couponInputSelector);
  const apply0 = q(config.applyButtonSelector);
  const startTotal = readTotal();
  if (!input0 || !apply0 || startTotal === null || looksLikeOrderButton(apply0)) {
    return finish("unsupported", UNSUPPORTED_MESSAGE, null, startTotal);
  }
  if (list.length === 0) return finish("done", "No codes to try for this store.", null, startTotal);

  /** Waits until a success/error indicator becomes shown (or changes text), or the total changes, or timeout. */
  const waitForOutcome = async (totalBefore: number | null, prevSuccess: string, prevError: string): Promise<OutcomeSignal> => {
    const deadline = now() + timing.applyTimeoutMs;
    while (now() < deadline) {
      await sleep(timing.pollMs);
      if (config.successIndicatorSelector) {
        const s = indicatorState(doc, config.successIndicatorSelector);
        if (s !== prevSuccess && s.startsWith("shown")) return "success_indicator";
      }
      if (config.errorIndicatorSelector) {
        const e = indicatorState(doc, config.errorIndicatorSelector);
        if (e !== prevError && e.startsWith("shown")) return "error_indicator";
      }
      const t = readTotal();
      if (t !== null && totalBefore !== null && t !== totalBefore) return "total_changed";
    }
    return "timeout";
  };

  /** Gives the total a moment to update; returns as soon as it differs from `from` or after settleMs. */
  const settleTotal = async (from: number | null): Promise<number | null> => {
    const deadline = now() + timing.settleMs;
    let t = readTotal();
    while (now() < deadline && t === from) {
      await sleep(timing.pollMs);
      t = readTotal();
    }
    return t;
  };

  const applyCode = async (code: string): Promise<{ signal: OutcomeSignal; before: number | null; after: number | null } | null> => {
    const input = q(config.couponInputSelector);
    const apply = q(config.applyButtonSelector);
    if (!input || !apply || looksLikeOrderButton(apply)) return null;
    const before = readTotal();
    const prevSuccess = indicatorState(doc, config.successIndicatorSelector);
    const prevError = indicatorState(doc, config.errorIndicatorSelector);
    fillInput(input, code);
    (apply as HTMLElement).click();
    const signal = await waitForOutcome(before, prevSuccess, prevError);
    const after = signal === "total_changed" ? readTotal() : await settleTotal(before);
    return { signal, before, after };
  };

  /** Clicks the configured remove control if it is present and shown. */
  const removeCode = async (): Promise<boolean> => {
    const btn = q(config.removeButtonSelector);
    if (!btn || !isShown(btn) || looksLikeOrderButton(btn)) return false;
    const before = readTotal();
    (btn as HTMLElement).click();
    await settleTotal(before);
    return true;
  };

  const clearInput = () => {
    const input = q(config.couponInputSelector);
    if (input && (input as HTMLInputElement).value) fillInput(input, "");
  };

  let best: { coupon: CodedCoupon; savingsCents: number } | null = null;
  /** Code we currently left applied on the page (null = baseline). */
  let applied: string | null = null;
  let unsupportedMidway = false;
  let cancelled = false;

  for (let i = 0; i < list.length; i++) {
    const coupon = list[i] as CodedCoupon;
    if (aborted()) {
      cancelled = true;
      break;
    }
    progress("testing", i + 1, coupon.code);
    const res = await applyCode(coupon.code);
    if (!res) {
      unsupportedMidway = true;
      break;
    }
    const savings = res.before !== null && res.after !== null ? Math.max(0, res.before - res.after) : 0;
    const worked = res.signal === "error_indicator" ? savings > 0 : savings > 0 || res.signal === "success_indicator";
    const attempt: CouponAttempt = {
      couponId: coupon.id,
      code: coupon.code,
      worked,
      signal: res.signal,
      totalBeforeCents: res.before,
      totalAfterCents: res.after,
      savingsCents: worked ? savings : 0,
    };
    attempts.push(attempt);
    try {
      await deps.report?.(attempt);
    } catch {
      // reporting is best-effort and must never break the run
    }

    if (worked) {
      if (!best || savings > best.savingsCents) best = { coupon, savingsCents: savings };
      applied = coupon.code;
      const more = i < list.length - 1;
      if (more && !aborted()) {
        progress("removing", i + 1, coupon.code);
        if (await removeCode()) {
          applied = null;
          clearInput();
        } else {
          // Can't undo a working code: keep it and stop testing rather than stacking unknown state.
          break;
        }
      }
    } else {
      // Failed code: remove it if the store shows a remove control, and clear the field.
      await removeCode();
      clearInput();
    }
  }

  // Leave the best code applied.
  if (best && applied !== best.coupon.code && !unsupportedMidway) {
    progress("reapplying", 0, best.coupon.code);
    if (applied) await removeCode();
    const res = await applyCode(best.coupon.code);
    if (!res) unsupportedMidway = true;
  }

  const bestOut = best ? { couponId: best.coupon.id, code: best.coupon.code, savingsCents: best.savingsCents } : null;
  if (unsupportedMidway) return finish("unsupported", UNSUPPORTED_MESSAGE, bestOut, startTotal);
  if (cancelled) return finish("cancelled", "Stopped.", bestOut, startTotal);
  const msg = bestOut
    ? bestOut.savingsCents > 0
      ? `Applied ${bestOut.code}.`
      : `Applied ${bestOut.code} (the total shown didn't change).`
    : "None of the codes worked for this order.";
  return finish("done", msg, bestOut, startTotal);
}
