/**
 * Product-page content script. Injected only on the built-in retailer domains (manifest matches).
 * It sends the current URL to the background, which decides (settings, parseProductUrl, cache) whether to ask the API.
 * Renders an unobtrusive, collapsible "Lower price at …" card when a cheaper estimated total exists elsewhere.
 */
import { formatCents } from "@pricora/utils";
import { BRAND_NAME } from "../shared/env";
import { sendMessage, type ProductLookupResult } from "../shared/messages";
import { brandMark, el, mountShadow, watchUrl, type ShadowMount } from "./ui";

const HOST_ID = "pricora-price-banner";
let mount: ShadowMount | null = null;
const dismissed = new Set<string>();
let collapsed = false;

function clear(): void {
  mount?.destroy();
  mount = null;
}

function render(url: string, res: Extract<ProductLookupResult, { kind: "cheaper" }>): void {
  clear();
  mount = mountShadow(HOST_ID, { bottom: 16, right: 16 });
  const { wrap } = mount;
  const price = formatCents(res.cheapest.estimatedTotalCents, { currency: res.cheapest.currency });
  const isDemo = res.hasDemoData || res.cheapest.source === "demo";
  const label = `Lower price at ${res.cheapest.retailerName}: ${price} (est. total)`;

  const draw = () => {
    wrap.replaceChildren();
    if (collapsed) {
      const pill = el("button", { className: "pc-pill pc-anim", attrs: { type: "button", "aria-label": `${label}. Expand` } }, [
        brandMark(),
        el("span", { className: "pc-price", text: price }),
        el("span", { text: `at ${res.cheapest.retailerName}` }),
      ]);
      pill.style.color = "var(--pc-color-text)";
      pill.addEventListener("click", () => {
        collapsed = false;
        draw();
      });
      wrap.append(pill);
      return;
    }
    const collapseBtn = el("button", { className: "pc-icon-btn", text: "–", attrs: { type: "button", "aria-label": "Collapse", title: "Collapse" } });
    collapseBtn.addEventListener("click", () => {
      collapsed = true;
      draw();
    });
    const closeBtn = el("button", { className: "pc-icon-btn", text: "×", attrs: { type: "button", "aria-label": "Hide on this page", title: "Hide on this page" } });
    closeBtn.addEventListener("click", () => {
      dismissed.add(url);
      clear();
    });
    const current = res.current
      ? el("div", {
          className: "pc-muted",
          text: `This store: ${formatCents(res.current.estimatedTotalCents, { currency: res.current.currency })} (est. total)`,
        })
      : null;
    const card = el("div", { className: "pc-card pc-anim", attrs: { role: "region", "aria-label": `${BRAND_NAME} price comparison` } }, [
      el("div", { className: "pc-row" }, [
        el("span", { className: "pc-brand pc-grow" }, [brandMark(), BRAND_NAME]),
        isDemo ? el("span", { className: "pc-badge-demo", text: "Demo data" }) : null,
        collapseBtn,
        closeBtn,
      ]),
      el("div", { className: "pc-title" }, [
        `Lower price at ${res.cheapest.retailerName}: `,
        el("span", { className: "pc-price", text: price }),
        el("span", { className: "pc-muted", text: " (est. total)" }),
      ]),
      current,
      el("div", { className: "pc-muted", text: "Estimated total incl. shipping and estimated tax. Check the store for the final price." }),
      el("div", { className: "pc-actions" }, [
        el("a", {
          className: "pc-btn pc-btn-primary",
          text: `View at ${res.cheapest.retailerName}`,
          attrs: { href: res.goUrl, target: "_blank", rel: "noopener noreferrer" },
        }),
      ]),
    ]);
    wrap.append(card);
  };
  draw();
}

async function check(url: string): Promise<void> {
  clear();
  if (dismissed.has(url)) return;
  let res: ProductLookupResult;
  try {
    res = await sendMessage({ type: "product:lookup", url });
  } catch {
    return; // extension reloaded / background unavailable
  }
  if (res?.kind === "cheaper" && location.href === url) render(url, res);
}

if (window.top === window) {
  void check(location.href);
  watchUrl((url) => void check(url));
}
