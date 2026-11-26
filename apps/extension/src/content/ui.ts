/**
 * Shadow-DOM host for content-script UI. The page cannot style into it and (closed mode) cannot read it from its own
 * scripts. Styling uses the design-token CSS variables re-scoped from :root to :host, plus a small hand-written sheet
 * (no Tailwind inside shadow roots: its @property-based utilities do not work there).
 */
import tokensCss from "@pricora/design-tokens/tokens.css?raw";

export const FONT_FAMILY = "Nunito Sans (extension)";
const FONT_FILE = "fonts/nunito-sans-latin-wght-normal.woff2";

/** tokens.css targets :root / .dark; inside a shadow root those must apply to :host and our wrapper. */
export function scopeTokensToShadow(css: string): string {
  return css
    .replace(/:root,\s*\[data-theme="light"\]/g, ':host, [data-theme="light"]')
    .replace(/:root\s*\{/g, ":host {")
    .replace(/\.dark,\s*\[data-theme="dark"\]/g, '[data-theme="dark"]');
}

let fontRequested = false;
/** Registers the bundled Nunito Sans with the page's FontFaceSet under a private family name (no network beyond the extension). */
export function ensureFont(): void {
  if (fontRequested || typeof FontFace === "undefined") return;
  fontRequested = true;
  try {
    const face = new FontFace(FONT_FAMILY, `url("${chrome.runtime.getURL(FONT_FILE)}") format("woff2")`, {
      weight: "200 1000",
      style: "normal",
      display: "swap",
    });
    document.fonts.add(face);
    void face.load().catch(() => undefined); // page CSP may block it; system fonts are the fallback
  } catch {
    // ignore
  }
}

export const BASE_CSS = `
:host { all: initial; }
.pc-root {
  --font-nunito-sans: "${FONT_FAMILY}";
  font-family: "${FONT_FAMILY}", var(--pc-font-sans, ui-sans-serif, system-ui, sans-serif);
  font-size: 14px; line-height: 20px; color: var(--pc-color-text);
  -webkit-font-smoothing: antialiased;
}
.pc-root *, .pc-root *::before, .pc-root *::after { box-sizing: border-box; }
.pc-root [hidden] { display: none !important; }
.pc-card {
  background: var(--pc-color-surface); color: var(--pc-color-text);
  border: 1px solid var(--pc-color-border); border-radius: var(--pc-radius-lg, 10px);
  box-shadow: var(--pc-shadow-lg, 0 10px 30px rgba(0,0,0,.15));
  padding: 12px 14px; max-width: 340px;
}
.pc-row { display: flex; align-items: center; gap: 8px; }
.pc-grow { flex: 1 1 auto; min-width: 0; }
.pc-brand { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; font-size: 13px; color: var(--pc-color-text); }
.pc-mark { width: 18px; height: 18px; flex: none; object-fit: contain; }
.pc-title { font-weight: 700; font-size: 14px; margin: 6px 0 2px; }
.pc-price { font-weight: 800; font-variant-numeric: tabular-nums; }
.pc-muted { color: var(--pc-color-text-muted); font-size: 12px; line-height: 16px; }
.pc-btn {
  appearance: none; border: 0; cursor: pointer; font: inherit; font-weight: 700; font-size: 13px;
  border-radius: var(--pc-radius-md, 6px); padding: 7px 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
}
.pc-btn:focus-visible, .pc-icon-btn:focus-visible { outline: 2px solid var(--pc-color-ring); outline-offset: 2px; }
.pc-btn-primary { background: var(--pc-color-primary); color: var(--pc-color-primary-fg); }
.pc-btn-primary:hover { background: var(--pc-color-primary-hover); }
.pc-btn-secondary { background: var(--pc-color-surface-2); color: var(--pc-color-text); border: 1px solid var(--pc-color-border); }
.pc-btn[disabled] { opacity: .6; cursor: default; }
.pc-icon-btn {
  appearance: none; border: 0; background: transparent; color: var(--pc-color-text-muted); cursor: pointer;
  width: 26px; height: 26px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1;
}
.pc-icon-btn:hover { background: var(--pc-color-surface-2); color: var(--pc-color-text); }
.pc-badge-demo {
  display: inline-flex; align-items: center; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700;
  background: var(--pc-color-demo); color: var(--pc-color-demo-fg);
  border: 1px solid var(--pc-color-demo-border);
}
.pc-pill {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font: inherit; font-weight: 700; font-size: 13px;
  background: var(--pc-color-surface); color: var(--pc-color-text); border: 1px solid var(--pc-color-border);
  border-radius: 999px; padding: 6px 12px 6px 8px; box-shadow: var(--pc-shadow-md, 0 4px 12px rgba(0,0,0,.12));
}
.pc-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.pc-status { margin-top: 8px; font-size: 13px; }
.pc-status-ok { color: var(--pc-color-success); font-weight: 700; }
.pc-status-err { color: var(--pc-color-error); font-weight: 700; }
@media (prefers-reduced-motion: no-preference) {
  .pc-anim { animation: pc-in var(--pc-duration-base, 180ms) var(--pc-ease-out, ease-out); }
  @keyframes pc-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
}
`;

/** Brand mark from the extension package (icons are generated from packages/config/assets/whichless-mark.png). */
export function brandMark(): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "pc-mark";
  img.alt = "";
  img.width = 18;
  img.height = 18;
  img.src = chrome.runtime.getURL("icons/icon-32.png");
  return img;
}

export interface ShadowMount {
  host: HTMLElement;
  root: ShadowRoot;
  wrap: HTMLDivElement;
  destroy(): void;
}

/** Creates a fixed-position shadow host. `position` decides the corner. */
export function mountShadow(id: string, position: { bottom?: number; top?: number; right: number }): ShadowMount {
  document.getElementById(id)?.remove();
  ensureFont();
  const host = document.createElement("pricora-ui");
  host.id = id;
  const pos = [
    `right:${position.right}px`,
    position.bottom !== undefined ? `bottom:${position.bottom}px` : "",
    position.top !== undefined ? `top:${position.top}px` : "",
  ]
    .filter(Boolean)
    .join(";");
  host.setAttribute("style", `all:initial;display:block;position:fixed;z-index:2147483646;${pos}`);
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = scopeTokensToShadow(tokensCss) + BASE_CSS;
  const wrap = document.createElement("div");
  wrap.className = "pc-root";
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  wrap.setAttribute("data-theme", dark ? "dark" : "light");
  root.append(style, wrap);
  (document.body ?? document.documentElement).appendChild(host);
  return { host, root, wrap, destroy: () => host.remove() };
}

/** Tiny element builder (textContent only — never innerHTML with API data). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; attrs?: Record<string, string> } = {},
  children: (Node | string | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

/** Calls `onChange` when the page URL changes (SPA navigations included). */
export function watchUrl(onChange: (url: string) => void, intervalMs = 1200): () => void {
  let last = location.href;
  const tick = () => {
    if (location.href !== last) {
      last = location.href;
      onChange(last);
    }
  };
  const timer = window.setInterval(tick, intervalMs);
  window.addEventListener("popstate", tick);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("popstate", tick);
  };
}
