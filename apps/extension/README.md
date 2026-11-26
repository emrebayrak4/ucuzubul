# Browser extension (`@pricora/extension`)

Chrome / Edge (Manifest V3) and Firefox (MV3) extension for the price comparison site. The product name and logos come from
`packages/config` (`brand.ts`, `assets/whichless-*.png`); nothing brand-specific is hardcoded here.

- **Popup**: on a supported store it lists the store's coupon codes (title, success rate from real reports or "Not verified yet",
  "Demo data" label for demo coupons, **Copy**), a link to the store page on the website, and "Follow this store's coupons"
  when you are logged in on the website. On any other site it shows a search box and a link to recent price drops.
- **Price banner** (product pages, content script): parses the URL with `parseProductUrl`, asks `GET /v1/extension/product`
  and, if another store has a lower estimated total, shows a small collapsible card (closed shadow DOM, design tokens):
  "Lower price at <store>: $X (est. total)" linking through `/v1/go/:offerId?placement=extension_banner`. "Demo data" label
  when the offer or product is demo data.
- **Checkout coupon tester** (content script): only when the URL matches `checkoutUrlPatterns` of a config from
  `GET /v1/extension/config` (admin-managed, enabled only). Shows "N coupon codes available — Try them". Nothing happens until you
  click. Then it fills the promo field, clicks apply, waits for the success/error indicator or a total change (timeouts),
  removes failed codes, keeps the one that saves the most and reports each result to `POST /v1/coupons/:id/result`.
  It never clicks anything that looks like "Place order / Pay now", never touches payment fields, tests at most 10 codes
  (hard cap 20) and stops with "This store's checkout isn't supported yet" when a selector is missing.
- **Background service worker**: all API calls (content scripts never see cookies or tokens), config cache 24 h
  (`chrome.storage.local`), per-store coupons 1 h and product lookups 15 min (`chrome.storage.session`, memory only),
  toolbar badge with the number of codes on supported store tabs.
- **Options page**: toggles for price banner, coupon finder, anonymous result sharing; privacy notes; "Clear cached data".

## Build and load

```bash
pnpm -C apps/extension build            # → dist/chrome-mv3 and dist/firefox-mv3
pnpm -C apps/extension build:chrome     # one target only
pnpm -C apps/extension typecheck && pnpm -C apps/extension lint && pnpm -C apps/extension test
```

Packages it imports (`@pricora/config`, `contracts`, `algorithms`, `utils`, `design-tokens`) must be built first
(`pnpm build` at the root does that through Turborepo).

**Chrome / Edge**
1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and select `apps/extension/dist/chrome-mv3`.
3. The options page opens once on install. Pin the extension from the puzzle-piece menu.
4. After rebuilding, press the reload icon on the extension card.

**Firefox** (128+)
1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `apps/extension/dist/firefox-mv3/manifest.json`.
2. Firefox treats MV3 host permissions as optional: open the extension's **Permissions** tab in `about:addons` and allow the
   store sites and the API origin, otherwise nothing runs.

## Configuration

Build-time variables (see `.env.example`; copy to `.env.local`):

| Variable | Default | Notes |
|---|---|---|
| `VITE_PRICORA_API_URL` | `http://localhost:4400` | Its origin is added to `host_permissions`. |
| `VITE_PRICORA_WEB_URL` | `http://localhost:3100` | Store pages, search, login, privacy links. |

For local testing the API needs to run on :4400 (`pnpm -C apps/api dev`). Log in on the website (:3100) in the same
browser profile to enable "Follow this store's coupons" (the API session cookie is sent only by the background worker).

## Permissions and privacy

- `permissions`: `storage`, `activeTab` (read the current tab's URL when you open the popup). No `tabs`, `history`, `cookies`,
  `scripting` or `<all_urls>`.
- `host_permissions`: `https://<domain>/*` and `https://*.<domain>/*` for the 22 seeded stores (`src/shared/retailers.ts`) plus the
  API origin. Content scripts are only injected there; the API is only called for those hosts.
- Product URLs are reduced to origin + path (+ `skuId`/`preselect`/`Item` where a store needs it) before lookup.
- Coupon results are sent without cookies, with a random per-install id (reset by "Clear cached data") so the API can drop
  duplicates. Turning sharing off stops all result reports.
- Nunito Sans (OFL) and the logo are bundled; no remote fonts, analytics or trackers. Extension pages run under
  `script-src 'self'`; Zod runs `jitless` so nothing needs `eval`.

## Checkout configs (admin)

Configs are managed in the admin panel and served by `GET /v1/extension/config`. Pattern rules used by the extension:

- `hostPatterns`: `target.com` (that domain and its subdomains), `*.target.com` (same), `www.target.com` (that host and below).
  Only hosts in the built-in store list can ever be acted on.
- `checkoutUrlPatterns`: a glob on path + query (`/checkout*`, `/cart/*/promo`), a full-URL glob (`https://secure.*.com/checkout*`)
  or a regex prefixed with `re:` (`re:^/(cart|checkout)(/|$)`, case-insensitive). Invalid patterns never match.
- `couponInputSelector`, `applyButtonSelector`, `totalSelector` are required (configs missing one are ignored);
  `successIndicatorSelector`, `errorIndicatorSelector`, `removeButtonSelector` are optional but make results faster and allow
  testing more than one working code. Without a remove control the first working code is kept.

Every selector has to be verified on the real checkout page before enabling a config; the tests use a fake checkout page only.

## Layout

```
scripts/build.mjs     Vite builds (pages + background as ES modules, each content script as an IIFE) + manifests
scripts/assets.mjs    icons/logos from packages/config/assets (sharp), bundled font → public/
src/background/       service worker: api.ts (fetch, credentials policy), service.ts (logic, testable), index.ts (wiring)
src/content/          product.ts (banner), checkout.ts (panel), autoApply.ts (tester state machine), ui.ts (shadow DOM)
src/popup/, options/  React 19 + Tailwind v4 with @pricora/design-tokens
src/shared/           retailers, URL matching, coupon ranking, cache, settings, message types, contract mapping
test/                 vitest (jsdom for the tester; fixtures/ are test-only)
```
