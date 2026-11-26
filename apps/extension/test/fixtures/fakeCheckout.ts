/**
 * TEST-ONLY: behaviour for fixtures/checkout.html, simulating an async promo-code widget.
 * One code at a time (a new code replaces the previous one), like most single-field checkouts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FakeCheckoutOptions {
  /** code → discount in cents */
  validCodes: Record<string, number>;
  subtotalCents?: number;
  latencyMs?: number;
  /** Render the remove button after a successful code. */
  removable?: boolean;
  /** Show success/error messages (false = only the total changes). */
  indicators?: boolean;
  /** Codes the site silently ignores (no message, no change). */
  ignoredCodes?: string[];
}

export interface FakeCheckout {
  placeOrderClicks: number;
  appliedCode: string | null;
  applyClicks: number;
  removeClicks: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export function loadCheckoutFixture(doc: Document): void {
  doc.body.innerHTML = readFileSync(join(here, "checkout.html"), "utf8");
}

export function installFakeCheckout(doc: Document, opts: FakeCheckoutOptions): FakeCheckout {
  loadCheckoutFixture(doc);
  const state: FakeCheckout = { placeOrderClicks: 0, appliedCode: null, applyClicks: 0, removeClicks: 0 };
  const subtotal = opts.subtotalCents ?? 10000;
  const latency = opts.latencyMs ?? 10;
  const indicators = opts.indicators ?? true;
  const q = <T extends Element>(sel: string) => doc.querySelector(sel) as T;
  const success = q<HTMLElement>(".promo-success");
  const error = q<HTMLElement>(".promo-error");
  const removeBtn = q<HTMLButtonElement>("#remove");

  const render = () => {
    const discount = state.appliedCode ? (opts.validCodes[state.appliedCode] ?? 0) : 0;
    q<HTMLElement>("#discount").textContent = `-${fmt(discount)}`;
    q<HTMLElement>("#total").textContent = fmt(subtotal - discount);
    removeBtn.hidden = !(opts.removable ?? true) || !state.appliedCode;
  };

  q<HTMLButtonElement>("#apply").addEventListener("click", () => {
    state.applyClicks++;
    const code = q<HTMLInputElement>("#promo").value.trim().toUpperCase();
    setTimeout(() => {
      if (opts.ignoredCodes?.includes(code)) return;
      if (code in opts.validCodes) {
        state.appliedCode = code;
        if (indicators) {
          success.textContent = `Code ${code} applied`;
          success.hidden = false;
          error.hidden = true;
        }
      } else if (indicators) {
        error.textContent = `Sorry, "${code}" isn't a valid code`;
        error.hidden = false;
        success.hidden = true;
      }
      render();
    }, latency);
  });
  removeBtn.addEventListener("click", () => {
    state.removeClicks++;
    setTimeout(() => {
      state.appliedCode = null;
      success.hidden = true;
      render();
    }, latency);
  });
  q<HTMLButtonElement>("#place-order").addEventListener("click", () => {
    state.placeOrderClicks++;
  });
  render();
  return state;
}

export const FIXTURE_CONFIG = {
  couponInputSelector: "#promo",
  applyButtonSelector: "#apply",
  totalSelector: "#total",
  successIndicatorSelector: ".promo-success",
  errorIndicatorSelector: ".promo-error",
  removeButtonSelector: "#remove",
};
