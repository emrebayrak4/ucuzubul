/**
 * Checkout content script. Injected on the built-in retailer domains, but stays inert unless the background says the
 * current URL matches the checkoutUrlPatterns of an ENABLED admin-managed store config (and coupon finder is on).
 * Then it shows a small "N coupons available — Try them" panel. Codes are only tried after the user clicks.
 */
import { formatCents } from "@pricora/utils";
import { DEFAULT_MAX_CODES, HARD_MAX_CODES } from "../shared/coupons";
import { BRAND_NAME } from "../shared/env";
import { sendMessage, type CheckoutMatch } from "../shared/messages";
import { runAutoApply, type AutoApplyProgress, type AutoApplyResult } from "./autoApply";
import { brandMark, el, mountShadow, watchUrl, type ShadowMount } from "./ui";

const HOST_ID = "pricora-checkout-panel";
let mount: ShadowMount | null = null;
let running: AbortController | null = null;
let hiddenForUrl: string | null = null;

function clear(): void {
  running?.abort();
  running = null;
  mount?.destroy();
  mount = null;
}

function progressText(p: AutoApplyProgress): string {
  switch (p.phase) {
    case "checking":
      return "Checking this checkout…";
    case "testing":
      return `Trying code ${p.index} of ${p.total}${p.code ? `: ${p.code}` : ""}…`;
    case "removing":
      return `Removing ${p.code ?? "code"} to try the next one…`;
    case "reapplying":
      return `Re-applying the best code${p.code ? ` (${p.code})` : ""}…`;
    default:
      return "";
  }
}

function render(url: string, match: Extract<CheckoutMatch, { kind: "available" }>): void {
  clear();
  mount = mountShadow(HOST_ID, { top: 16, right: 16 });
  const { wrap } = mount;
  const n = match.coupons.length;
  const max = Math.min(match.config.maxCodes ?? DEFAULT_MAX_CODES, HARD_MAX_CODES);
  const toTry = Math.min(n, max);

  const status = el("div", { className: "pc-status", attrs: { role: "status", "aria-live": "polite" } });
  const tryBtn = el("button", {
    className: "pc-btn pc-btn-primary",
    text: toTry < n ? `Try the top ${toTry}` : "Try them",
    attrs: { type: "button" },
  });
  const stopBtn = el("button", { className: "pc-btn pc-btn-secondary", text: "Stop", attrs: { type: "button", hidden: "" } });
  const closeBtn = el("button", { className: "pc-icon-btn", text: "×", attrs: { type: "button", "aria-label": "Close", title: "Close" } });
  closeBtn.addEventListener("click", () => {
    hiddenForUrl = url;
    clear();
  });

  const card = el("div", { className: "pc-card pc-anim", attrs: { role: "region", "aria-label": `${BRAND_NAME} coupons` } }, [
    el("div", { className: "pc-row" }, [el("span", { className: "pc-brand pc-grow" }, [brandMark(), BRAND_NAME]), closeBtn]),
    el("div", { className: "pc-title", text: `${n} coupon ${n === 1 ? "code" : "codes"} available for ${match.storeName}` }),
    el("div", {
      className: "pc-muted",
      text: "We'll enter each code in the promo field and keep the one that saves the most. We never place your order.",
    }),
    el("div", { className: "pc-actions" }, [tryBtn, stopBtn]),
    status,
  ]);
  wrap.append(card);

  const showResult = (r: AutoApplyResult) => {
    status.replaceChildren();
    if (r.status === "unsupported") {
      status.append(el("span", { className: "pc-status-err", text: r.message }));
      return;
    }
    if (r.best && r.best.savingsCents > 0 && r.startTotalCents !== null) {
      status.append(
        el("span", { className: "pc-status-ok", text: `${r.message} You save ${formatCents(r.best.savingsCents)}.` }),
        el("div", {
          className: "pc-muted",
          text: `Tried ${r.attempts.length} ${r.attempts.length === 1 ? "code" : "codes"}. Order total shown by the store: ${r.finalTotalCents !== null ? formatCents(r.finalTotalCents) : "unknown"}.`,
        }),
      );
      return;
    }
    status.append(
      el("span", { className: r.best ? "pc-status-ok" : "", text: r.message }),
      el("div", { className: "pc-muted", text: `Tried ${r.attempts.length} ${r.attempts.length === 1 ? "code" : "codes"}.` }),
    );
  };

  tryBtn.addEventListener("click", () => {
    if (running) return;
    const ctrl = new AbortController();
    running = ctrl;
    tryBtn.disabled = true;
    stopBtn.hidden = false;
    void runAutoApply(match.config, match.coupons, max, {
      doc: document,
      signal: ctrl.signal,
      timing: match.config.applyTimeoutMs ? { applyTimeoutMs: Math.min(match.config.applyTimeoutMs, 20000) } : undefined,
      onProgress: (p) => {
        const t = progressText(p);
        if (t) status.replaceChildren(el("span", { text: t }));
      },
      report: (a) =>
        sendMessage({
          type: "coupon:result",
          couponId: a.couponId,
          worked: a.worked,
          orderTotalCents: a.totalBeforeCents ?? undefined,
          savingsCents: a.worked ? a.savingsCents : undefined,
        }).then(() => undefined),
    })
      .then(showResult)
      .catch(() => status.replaceChildren(el("span", { className: "pc-status-err", text: "Something went wrong. No order was placed." })))
      .finally(() => {
        if (running === ctrl) running = null;
        tryBtn.disabled = false;
        tryBtn.textContent = "Try again";
        stopBtn.hidden = true;
      });
  });
  stopBtn.addEventListener("click", () => running?.abort());
}

async function check(url: string): Promise<void> {
  if (running) return; // don't tear down mid-run (some checkouts change the URL when a code is applied)
  clear();
  if (hiddenForUrl === url) return;
  let match: CheckoutMatch;
  try {
    match = await sendMessage({ type: "checkout:match", url });
  } catch {
    return;
  }
  if (match?.kind === "available" && match.coupons.length > 0 && location.href === url) render(url, match);
}

if (window.top === window) {
  void check(location.href);
  watchUrl((url) => void check(url));
}
