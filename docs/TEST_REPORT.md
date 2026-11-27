# Test report: Wave 3 hardening (A09)

Date: 2026-11-26 · Environment: Windows 11 dev laptop, everything running locally in **dev mode** (`next dev` for web :3100 and admin :3001, `tsx watch` for the API :4400, Docker Postgres :5434 / Redis :6380 / Meilisearch :7700). Browser: system Google Chrome 158 through Playwright 1.65.1 (`channel: "chrome"`). The bundled Chromium revision for this Playwright version is not downloaded on this machine; `PW_CHANNEL=bundled` switches to it.

Status legend: ✅ verified by a run · ⚠️ finding · ❌ not verified

---

## 1. What was run

| # | Command | Result |
|---|---|---|
| 1 | `pnpm -C e2e test` (Playwright e2e, a11y and security, against the running servers) | ✅ **77/77 expected**, 0 unexpected, 0 flaky (82 s). The same result on two runs in a row. 4 of the 77 are `test.fail` known-bug tests (2 bugs × 2 viewports). They pass while the bug is still there. |
| 2 | `pnpm exec turbo run typecheck lint test --continue` (whole repo, including apps/mobile in its current state) | ✅ **51/51 tasks successful** (80 s, 22 cache hits). Mobile `typecheck` and `lint` passed in its current in-progress state. |
| 3 | `pnpm exec turbo run test --force --filter=!@pricora/e2e` (unit and integration tests, no cache) | ✅ 21/21 tasks. Tests: algorithms 133, retailer-adapters 70, utils 15, **api 15 (integration)**, analytics 8, contracts 8, api-client 3 = **252 passed, 0 failed**. config, database and worker have no test files. |
| 4 | `pnpm audit --prod` | ⚠️ 1 moderate: `minimatch` <11.0.1 (GHSA-g3hv-75wg-m249), only through `apps/mobile > expo > @expo/fingerprint` (Expo tooling). No high or critical. |
| 5 | Live security probes (Playwright `security.spec.ts` plus scripted probes for rate limits, oversized uploads and the redirect `next` param) | See §5 |
| 6 | Load sample (Node closed-loop sampler; autocannon 9.0.0 for the throttled baseline) | See §6 |
| 7 | Lighthouse 13.5.0 (mobile preset, simulated throttling, headless Chrome) on home and a product page | See §6 |

Lint coverage note: `@pricora/api` "lint" is `tsc --noEmit` (no ESLint). `design-tokens` and `ui` have no lint task. `web`, `admin` and `mobile` have no unit tests. Their coverage comes from e2e only, and mobile has none.

## 2. E2E suite (`e2e/`, package `@pricora/e2e`)

Run: `pnpm -C e2e test`. The suite needs the dev servers already running; it never starts or stops them. Projects: `setup` (session states through the API), `desktop-chromium` (1440×900), `mobile-chromium` (390×844, touch, DPR 3). Reports: `e2e/playwright-report/results.json` and `e2e/playwright-report/html`. axe JSON goes to `e2e/test-results/a11y/*.json`. The e2e `test` task has turbo caching disabled (`e2e/turbo.json`).

| Spec | Scenarios | Desktop | Mobile |
|---|---|---|---|
| home.spec | home rails (trending, best deals, price drops) + `demo-notice`, no `api-error` · unknown route → 404 page · unknown product slug renders not-found UI with `noindex` · **[BUG-W01, test.fail]** unknown product/category/brand/store slug returns HTTP 404 · dark mode toggle → `html.dark`, persists across reload, body background changes | 5/5 | 5/5 |
| search.spec | "best laptop under $800" → every result ≤ $800, cap shown in chips or URL · sort + brand facet persist in URL across reload / back / forward, sorted low→high | 2/2 | 2/2 |
| product.spec | organic offers sorted by estimated total, cheapest first, matches API min · every demo offer row shows "Demo data" and the page shows `demo-notice` · ZIP 10001 → "excl. tax" disappears, lowest total rises, order still by total, persists across reload · **Visit store**: `target=_blank`, `rel` has noopener + sponsored/nofollow, request goes to `API/v1/go/:id`, intercepted `route.fetch({maxRedirects:0})` → **302** to an `https:` host inside the retailer's domain, no credentials. The retailer site is never loaded (non-local requests aborted). | 3/3 | 3/3 |
| auth.spec | signup → /account → cookie flags (`pc_session` HttpOnly + SameSite=Lax, `pc_csrf` readable) → logout from the account menu → **old token resolves to anonymous** (server-side revocation) → /account gated → login → /account · wrong password shows a generic error · forgot-password shows the non-enumerating confirmation | 3/3 | 3/3 |
| account.spec (fresh `@example.test` user per project) | favorite add → /account/saved → remove · create price alert → listed in /account/alerts · smart basket (2 items) → optimize → scenarios with prices · compare 2 products → `/compare` table shows both | 4/4 | 4/4 |
| travel.spec | flights JFK→LAX: `providers-pending` visible, 0 `flight-card` (no fabricated fares) · hotels New York → every card has "Demo data" → detail → every `rate-row` has "Demo data" · **[BUG-W02, test.fail]** demo rates must not render a booking link | 3/3 | 3/3 |
| admin.spec (desktop only) | admin logs in through the form → Dashboard → /admin/users · anonymous → /login · merchant kept out of /admin, sees /merchant profile · merchant **CSV upload** (`e2e/fixtures/merchant-feed-small.csv`: 3 rows, 1 off-domain URL) → API 201 with rowsTotal 3 / accepted 2 / rejected 1 (url), shown in history · analyst reads /admin/products, no "New product" button · consumer user → /forbidden for /admin and /merchant | 6/6 | n/a |
| a11y.spec (desktop, light + dark) | axe WCAG 2.0/2.1/2.2 A+AA on home, search, product, login, signup, flights, hotels (see §4). Fails only on *new* critical violations; the known ones are listed in the spec. | 14/14 | n/a |
| security.spec (desktop, API level) | see §5 | 16/16 | n/a |
| **Total** (+1 setup) | | **56** | **20** |

Rate limits: auth routes allow 10 requests per minute per IP per route. One suite run uses 8 register calls and 6 login calls. The helpers wait out a 429 window, so quick re-runs get slower instead of failing. Do not run two suites inside the same minute.

## 3. Bugs by severity and owner

Full repro steps are under "Requests" in `docs/TASKS.md`.

| ID | Sev | Owner | Summary |
|---|---|---|---|
| SEC-H1 | **High** | A04 (+A02, A08) | The global 300 req/min/IP throttle also counts the web and admin **SSR servers' own API calls**: every visitor's SSR request comes from one IP and shares one bucket. Reproduced: after about 300 API calls in a minute, `/search` and `/categories/*` render "Too many requests" for every user. |
| BUG-W01 | Medium | A02 (SEO, A07) | Soft 404: `/products/<unknown>`, `/categories/nope`, `/brands/nope`, `/stores/nope`, `/best/nope` return **HTTP 200** with the not-found UI (`noindex` is present). `/hotels/nope` correctly returns 404. |
| BUG-W02 | Medium | A02 | Hotel detail renders a **"View deal"** button for `source: demo` rates. It opens `/v1/travel/go/hotel/:id`, which answers **409 raw JSON** in a new tab. |
| BUG-A11Y-01 | Medium (axe critical) | A02 | `SearchBox` input (header and hero, on every page) has `aria-expanded`, `aria-controls` and `aria-activedescendant` without `role="combobox"`. |
| BUG-A11Y-02 | Medium (axe critical) | A02 | Radix `Tabs` is used as a segmented control without `TabsContent` (flight trip type round/one-way on home and flights; price-history range on product). The triggers' `aria-controls` point to panels that do not exist. |
| SEC-M1 | Medium | A04 | The login brute-force limit is keyed on `req.ip`. With `trust proxy = "loopback"` (dev) a spoofed `X-Forwarded-For` bypasses it (verified: 429 → 401 again). There is no per-account backoff or lockout (known TODO). |
| SEC-M2 | Medium | A04 | Merchant feed upload runs synchronously inside the request with sequential per-row DB queries. Unverified merchants can create one `ProductMatch (pending_review)` row per GTIN-less row, up to about 90k rows per 10 MB file, which floods the admin review queue. |
| SEC-M3 | Medium | A08 | The admin app (:3001) sends no `X-Frame-Options` or CSP `frame-ancestors`, so admin actions can be clickjacked. (Web sends `X-Frame-Options: SAMEORIGIN`.) |
| BUG-A11Y-03 | Low (axe serious) | A02 | `link-in-text-block`: `text-primary` links inside muted text without an underline (affiliate-disclosure link in the offer table and footer, signup Terms/Privacy, travel notice). Contrast against the surrounding text is 1.7:1. |
| BUG-A11Y-04 | Low (axe serious) | A01 | `StoreLogo` initials for eBay: white on #e53238 = 4.33:1 (< 4.5). The text colour should be picked by contrast. |
| BUG-W03 | Low | A02 | While the API was throttling, `/search` once returned **HTTP 500** (Next error page) instead of the `api-error` panel. Not reproduced on the second attempt (then it showed "Too many requests" with HTTP 200). |
| SEC-L1..L6 | Low / Info | A04 / A02 | See §5 |
| PERF-W1 | Medium (unconfirmed) | A02 | Lighthouse mobile on the **dev** build: LCP 9.5 s / 9.1 s, TBT 900 / 800 ms, 1.4–1.9 MB transferred, about 0.5–0.6 MB unused JS. This needs a production-build measurement before anyone acts on it (see §6). |

No functional failures were found in admin or merchant flows, auth, favorites, alerts, basket, compare, ZIP tax, the outbound redirect, or the honest travel states.

## 4. Accessibility (axe-core 4.14.1 via @axe-core/playwright 4.14.0, WCAG 2.x A/AA, desktop)

Light and dark themes give identical results.

| Page | critical | serious | moderate | minor | Rules |
|---|---|---|---|---|---|
| home | 2 | 2 | 0 | 0 | aria-allowed-attr (search input), aria-valid-attr-value (trip-type tab), color-contrast (eBay logo), link-in-text-block |
| search | 1 | 1 | 0 | 0 | aria-allowed-attr, link-in-text-block |
| product | 2 | 1 | 0 | 0 | aria-allowed-attr, aria-valid-attr-value (history range tab "90d"), link-in-text-block (×2 nodes) |
| login | 0 | 0 | 0 | 0 | none |
| signup | 0 | 1 | 0 | 0 | link-in-text-block (Terms, Privacy) |
| flights (results) | 2 | 1 | 0 | 0 | aria-allowed-attr, aria-valid-attr-value (one-way tab), link-in-text-block |
| hotels (results) | 1 | 1 | 0 | 0 | aria-allowed-attr, link-in-text-block |

All critical violations trace back to 2 shared components (BUG-A11Y-01 and -02). Lighthouse's accessibility score agrees: 0.84 home, 0.88 product, with the same 4 failing audits. Admin pages, mobile viewport scans and keyboard-only or screen-reader passes were **not** done.

## 5. Security review (code + live probing, local only)

### Verified OK ✅
- **Passwords**: argon2id via `@node-rs/argon2` (library defaults m=19 MiB, t=2, p=1, which is the OWASP minimum profile). Policy 10–128 chars (`short` and `123456789` → 422). Unknown-email logins run a dummy verify, and the error message is identical for unknown email and wrong password.
- **Sessions**: 32-byte opaque token, only its SHA-256 is stored. Logout revokes server-side (old cookie → anonymous). Password reset revokes all sessions (code). Cookie `pc_session` HttpOnly + SameSite=Lax, `Secure` only when `NODE_ENV=production` (code; not testable on http).
- **CSRF**: a cookie-authenticated POST or DELETE without the header, or with a wrong `x-csrf-token`, gets 403 `csrf_invalid` (including `DELETE /v1/me`).
- **CORS**: an untrusted `Origin` is not reflected. :3100 and :3001 get credentials.
- **IDOR**: user B gets 404 for every read or write of user A's list, list items, alerts and favorites by id. B's lists, alerts, favorites and `/v1/me/export` contain none of A's ids, and A's data stays intact.
- **RBAC**: anonymous → 401. Consumer → 403 on `/v1/admin/*` and `/v1/merchant/*`. Analyst can read stats and products, gets 403 on users and audit-logs, and 403 on writes (brand create, product update, category create, flag toggle). Merchant → 403 on admin. Staff → 403 on merchant.
- **Open redirect**: `/v1/go/:id` ignores `?url|to|redirect|next|target=https://evil…` and still 302s to the retailer. `/v1/go/<evil url>` → 4xx with no `Location`. `/v1/travel/go/hotel/<evil>` gives no `Location`. Web and admin login `next=`: `//`, `/\` and tab tricks (`/\t/example.org`, `/%09/…`) did not leave the origin.
- **Injection**: SQL-ish search inputs (`' OR 1=1--`, `UNION SELECT …`, `%%__`, 500 chars, NUL) → < 500, no stack traces, no hash material. Raw SQL is parameterised (`$queryRaw` templates; the one `$queryRawUnsafe` uses a fixed table union plus bound params). An XSS payload in `/search?q=` renders inert (no dialog, no injected `<img>`). The only `dangerouslySetInnerHTML` is JSON-LD with `<` escaped.
- **Errors**: malformed JSON → 4xx envelope. Unknown routes, bad params and negative pages → < 500. JSON > 1 MB → 413. No stack traces, file paths or Prisma names in any response.
- **Feed upload**: > 10 MB → 413. Off-domain, `http:` and `javascript:` product URLs are rejected per row. Binary content parses to 0 accepted rows with no crash.
- **Headers**: API has helmet (CSP, nosniff, no `x-powered-by`). Web has nosniff, Referrer-Policy and X-Frame-Options.
- **Secrets**: no live keys, private keys or tokens in committable files (pattern scan; there are no git commits yet). `.env` is git-ignored, `.env.example` secret values are empty, and the seed password exists only as a dev default (the seed refuses `NODE_ENV=production`).

### Findings ⚠️

| ID | Sev | Finding |
|---|---|---|
| SEC-H1 | High | SSR traffic shares the per-IP throttle bucket. Production availability risk at modest traffic (see §3). |
| SEC-M1 | Medium | Rate limit can be bypassed with a spoofed XFF in dev. Production correctness depends on the proxy topology, and there is no account lockout. |
| SEC-M2 | Medium | Synchronous feed processing + unlimited `ProductMatch` rows from unverified merchants. |
| SEC-M3 | Medium | No clickjacking protection on admin. |
| SEC-L1 | Low | Login CSRF possible for anonymous users (documented in SECURITY.md). |
| SEC-L2 | Low | Account enumeration via `POST /v1/auth/register` → 409 "already exists" (forgot-password is careful). |
| SEC-L3 | Low | Formula-injection titles (`=HYPERLINK(…)`) and HTML in feed titles are stored raw. Safe today because React escapes and there is no CSV export, but they must be neutralised in any future CSV or spreadsheet export. |
| SEC-L4 | Low | Feed upload does not check file extension or MIME server-side (`evil.exe` accepted and parsed). 413 uses code `bad_request` instead of a specific code. |
| SEC-L5 | Low | Web has no Content-Security-Policy. HSTS is a deploy-time item. |
| SEC-L6 | Info | `/docs` and `/openapi.json` are public. Disable or protect them in production. The fallback `ILIKE` does not escape `%`/`_`. `/v1/go` sets `Referrer-Policy: no-referrer-when-downgrade`. |
| DEP-1 | Low | `pnpm audit --prod`: 1 moderate (minimatch, Expo tooling, mobile only). |

**Probe side effects (local DB):** throwaway `@example.test` users, favorites, alerts and lists; merchant feeds named `e2e-*` (inactive offers or pending matches for 4 rows: the 2 fixture rows plus 2 formula/XSS rows); about 21k `SearchEvent` rows from the load sample, so admin "Searches" stats for today are inflated.

## 6. Performance (measured numbers only; dev-mode caveats apply)

**API load sample.** 10 concurrent closed-loop clients for 20 s each, run on the same laptop as all servers, the API under `tsx watch` (not a production build), and Postgres, Redis and Meilisearch in Docker. 2xx latencies only:

| Endpoint | req/s | p50 | p95 | p99 | max | errors |
|---|---|---|---|---|---|---|
| `GET /v1/search?q=laptop` | 359 | 26.6 ms | 36.6 ms | 46.0 ms | 92.7 ms | 0 |
| `GET /v1/search?q=best laptop under $800` | 404 | 23.6 ms | 31.8 ms | 40.3 ms | 83.3 ms | 0 |
| `GET /v1/products/<slug>` (4 offers) | 274 | 35.5 ms | 45.5 ms | 51.9 ms | 93.2 ms | 0 |

Caveat: the per-IP limit (300/min) would turn a single-IP benchmark into a 429 benchmark. autocannon `-c 10 -d 20` measured **99.8 % 429s** at about 7k rps (p99 4 ms, so the throttle path itself is cheap). The table above therefore rotates `X-Forwarded-For` (TEST-NET addresses), which only works because of SEC-M1 in dev. These are local-machine numbers, not capacity numbers.

**Lighthouse 13.5.0, mobile preset, simulated throttling, against `next dev` (unminified, dev React).** The production build (`next build` + `next start`) was not run (that step was blocked in this session), so these numbers overstate JS cost:

| Page | Perf | LCP | TBT | CLS | FCP | SI | A11y | BP | SEO |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 0.54 | 9.5 s | 900 ms | 0.001 | 0.9 s | 2.2 s | 0.84 | 0.96 | 0.92 |
| `/products/lenovo-ideapad-slim-3-…` | 0.55 | 9.1 s | 800 ms | 0 | 0.9 s | 3.4 s | 0.88 | 0.96 | 0.92 |

The root document TTFB was about 210–230 ms. Transfer was 1.42 MB (home) and 1.93 MB (product), with an estimated 495 KiB and 591 KiB of unused JS and about 2.2–2.4 s JS boot-up. CLS is excellent. The LCP and TBT values must be re-measured on a production build before any conclusion.

### 6.1 Front-end "lag" investigation (perf session, 2026-11-27) — production build, before → after

Setup: `next build` + `next start --port 3190` in `apps/web` (stopped afterwards), API :4400 dev (`tsx watch`, Redis-cached), Chromium 1243 headless, same laptop as all other servers and sessions (CPU contention → ±10–15 % noise). Lighthouse 12 (perf category only), Playwright CDP traces. Raw JSON, trace summaries and screenshots: `%TEMP%\claude\ecbafb045093e37e\d3804b2a-da00-41e5-94ac-6d358a667f38\scratchpad\perf\`.

**Root cause.** Every Deal Score ≥ 75 badge and every price-drop badge ran an *infinite* CSS loop (shimmer sweep; ≥ 20 % drops also a `background-position` "hot" drift that repaints every frame). Running loops counted with `document.getAnimations()`: home **256** (189 shimmer + 67 hot), category 89, deals 87, search 29, product 14. With nothing happening on screen the renderer main thread was busy **99 %** of the time (style recalc + paint + layerize), so scrolling, clicks and typing queued behind it.

**Fixes** (design unchanged; reduced-motion unchanged; no scroll-reveal):
1. `MotionGovernor` (`@pricora/ui`, mounted once in `providers.tsx`): one IntersectionObserver + MutationObserver sets `data-anim="on"` only on looping badges that are in the viewport; CSS (`design-tokens` `animate-shimmer` / `animate-hot`, generator `scripts/build-css.mjs` updated identically) runs the loops only on `[data-anim="on"]`. Without JS the badges show their static design (the paused sheen is off-badge).
2. "Hot" drift re-implemented as a 220 %-wide gradient pseudo-element moved with `transform` (compositor-only) — same look as `background-position 0→100→0 %`; static screenshot pixel-identical (`badge-hot-*.png`).
3. `CountUp` / `PriceRoll`: one shared IntersectionObserver per option set (was one per instance, 100+ per grid) and the tween writes the existing text node per frame instead of a React re-render per frame.
4. Server data cache keyed by URL only (`lib/api-server.ts` → `unstable_cache`, tag `api`): Next's fetch cache keys on request headers and every SSR request carried the visitor IP (`x-pricora-client-ip`), so in production each visitor had a private cache (miss → API round trips). The IP is still sent on misses (throttle unchanged); only 2xx cached. Not visible in local numbers (single IP).
5. Home LCP image (`deals` promo tile) `fetchPriority="high"`; `preconnect` to `images.unsplash.com` in the root layout.

**Lighthouse, production build** (score / LCP / TBT / CLS; mobile = simulated Moto G + slow 4G):

| Page | Mobile before | Mobile after | Desktop before | Desktop after |
|---|---|---|---|---|
| Home `/` | 57 / 4.98 s / 1259 ms / 0.001 | **79 / 5.39 s / 123 ms / 0** | 99 / 1.00 s / 17 ms / 0 | 99 / 0.96 s / 0 ms / 0 |
| Category `/categories/electronics` | 79 / 3.77 s / 403 ms / 0.001 | **86 / 3.76 s / 171 ms / 0** | 100 / 0.75 s / 12 ms / 0 | 100 / 0.71 s / 28 ms / 0 |
| Product | 84 / 4.04 s / 183 ms / 0.001 | 85 / 4.11 s / 157 ms / 0.001 | 100 / 0.77 s / 0 ms / 0 | 99 / 0.86 s / 2 ms / 0 |
| Search `?q=headphones` | 88 / 3.46 s / 207 ms / 0 | 88 / 3.46 s / 191 ms / 0.001 | 99 / 0.89 s / 8 ms / 0 | 100 / 0.82 s / 1 ms / 0 |
| Deals | 76 / 4.03 s / 453 ms / 0 | **90 / 3.46 s / 128 ms / 0.001** | 100 / 0.78 s / 0 ms / 0.003 | 99 / 0.87 s / 0 ms / 0 |
| Coupons | 86 / 3.98 s / 138 ms / 0.001 | 85 / 4.06 s / 155 ms / 0.001 | 100 / 0.72 s / 0 ms / 0 | 100 / 0.80 s / 0 ms / 0 |

Mobile main-thread work during the Lighthouse load: home 12.4 s → **1.7 s**, category 13.0 → 4.3 s, product 12.9 → 2.0 s, deals 11.8 → 4.3 s, search 7.0 → 2.8 s, coupons 1.3 → 1.3 s. JS per route (transfer, gzip): 310–326 KB before, 319–335 KB after (+≈9 KB from other sessions' concurrent changes, not from this fix). TTFB 13–74 ms everywhere.

**Interaction traces (desktop 1366×860, no CPU throttle, prod build):**

| Scenario | Before | After |
|---|---|---|
| Home idle 5 s — main thread busy | 4974 ms (99 %) | **777 ms (15 %)** |
| Category idle 5 s — main thread busy | 3150 ms | **719 ms** |
| Home scroll (80 wheel steps) — p95 frame / frames > 33 ms / long tasks | 56 ms / 24 / 18 (TBT-like 165 ms) | **14 ms / 9 / 0** |
| Category scroll — p95 frame / frames > 33 ms | 14 ms / 0 | 7 ms / 0 |
| Mega menu open — pointerdown→paint (INP-like) | 128 ms | **40 ms** |
| Typing in search — worst key event | 104 ms (9 long tasks) | **40 ms (0 long tasks)** |
| Filter checkbox toggle — click→URL settled | 83 ms | 122 ms (noise; 0 long tasks both) |
| Route transitions, warm, click→networkidle | 226–387 ms (max task 122 ms) | 86–356 ms (max task 77 ms) |
| Route transitions, warm, click→new `<main>` content (after only) | — | 44–197 ms (deals 136, coupons 90, price-drops 44, category 169, home 197) |
| CLS (all six routes, interaction pages) | 0–0.001 | 0 |

**Targets on the production build:** TBT < 200 ms ✅ on all 12 runs (was ❌ home/category/deals mobile). CLS < 0.1 ✅. INP-like < 200 ms ✅ (worst measured 40 ms desktop). Scroll ≈ 60 fps ✅ on category; home much improved (p95 14 ms) but still 9 frames > 33 ms in 80 wheel steps (Layerize/paint of ~6 k DOM nodes, 57 images). Route transitions < 300 ms warm ✅ (click→content). **LCP < 2.5 s mobile-simulated ❌ (3.5–5.4 s).** Real LCP measured in Chromium at 4× CPU, mobile viewport, local network: home 0.48 s, coupons 0.74 s. The simulated value is dominated by Lighthouse's slow-4G model of ~320 KB gzip JS + 72 KB gzip HTML (home) requested before the LCP paint, not by server time (TTFB < 75 ms) or main-thread work.

**Dev server (`next dev` :3100, shared, mobile Lighthouse):** home TBT 3483 → 2611 ms, category 2786 → 1161 ms, main thread home 16.7 → 8.1 s; LCP 4.5–17 s and TTFB 250–1850 ms in both runs; 1.3–2.3 MB of unminified JS per page (deals "after" 2.35 MB = a recompile triggered by another session mid-run; desktop product "before" scored 0 for the same reason).

### 6.2 What part of the lag is dev-mode only (for the founder)
- `next dev` compiles each route on first visit and again whenever any of the parallel sessions saves a file (HMR); a click can wait 0.5–2 s for compilation (dev TTFB 250–1850 ms vs prod 13–74 ms).
- Dev ships unminified React with debug checks: 1.3–2.3 MB JS per page vs ~320 KB in production; StrictMode double-renders effects.
- Several sessions run builds, tests and Lighthouse on the same laptop at the same time.
- The animation load (fixed above) was real in production too — that part was not dev-only.

## 7. Not verified ❌
- Production builds (web, admin, API) and Lighthouse or load numbers on them. Behaviour behind a real reverse proxy (trust proxy, Secure cookies, HSTS).
- `apps/mobile` (A03 still building): no e2e, only turbo typecheck and lint.
- Firefox and WebKit/Safari. Real mobile devices (mobile = Chromium emulation only).
- Email delivery (reset link, alerts), OAuth (pending_configuration), the worker's alert evaluation and notifications end to end, assistant (AI pending).
- Accepted-row path of large merchant feeds under load (skipped to avoid flooding the DB), the merchant API-key flow, admin write flows other than role gating (product, category, flag edits).
- a11y of admin, account, basket, compare and deals pages; keyboard-only and screen-reader passes; mobile-viewport axe.
- Session cookie behaviour across real separate domains (locally, `localhost` cookies are shared across ports).
- The one-off HTTP 500 on `/search` during throttling (BUG-W03) could not be reproduced.

## 8. Files
- `e2e/` (package `@pricora/e2e`): `playwright.config.ts`, `helpers/{env,api,ui}.ts`, `tests/*.spec.ts`, `fixtures/merchant-feed-small.csv`, `turbo.json` (no cache for e2e test).
- Root change, needed for a workspace package: `pnpm-workspace.yaml` gets `- "e2e"`, and `pnpm-lock.yaml` gets the e2e importer (`@playwright/test` 1.65.1, `@axe-core/playwright` 4.14.0, `typescript` 5.9.3, `@types/node` 24.19.4; no release-age exclusions added).
