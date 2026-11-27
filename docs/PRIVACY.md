# Privacy & ZIP resolution (engineering notes)

All legal text in the app is **Draft — needs legal review** (`LegalPage` banner). This file documents the technical side.

## ZIP resolution (web) — our "personal" algorithm
Order, first hit wins (`apps/web/src/components/zip-provider.tsx`):
1. **Saved account preference** (`user_preferences.zip`) — overwrites a different device cookie after sign-in (source `account`).
2. **ZIP cookie** `pc_zip` (source shown from `pc_zip_meta`: manual / location / account).
3. **Edge/IP estimate** — only when the site runs behind that CDN: `EDGE_GEO_HEADERS=vercel` (`x-vercel-ip-postal-code`, `x-vercel-ip-country(-region)`) or `cloudflare` (`cf-postal-code`, `cf-region-code`, `cf-ipcountry`). Non-US → ignored. Shown in the header as **"Estimated: 10001 · change"**, used for SSR tax estimates (`getZip()`), never written to a cookie automatically. Confidence `low`.
4. **Use my location** — only on an explicit click (button in the ZIP dialog, or the one-time chip "Show tax-inclusive totals for your area?" that appears after the cookie banner is answered). No automatic permission prompts. `navigator.geolocation` (low accuracy, 10 s timeout) → coordinates rounded to 3 decimals (~110 m) → `GET /v1/geo/zip` → saved as cookie + account (source `location`, with confidence and "City, ST").
Every ZIP shows its source + confidence in the dialog and can be overridden or cleared. Mobile uses the same endpoint via `expo-location` on explicit tap (`apps/mobile/src/lib/location.ts`, owned by another session).

`Permissions-Policy` now allows `geolocation=(self)` (was `()`, which blocked the feature entirely); third-party frames still can't use it.

## Nearest ZCTA (`GET /v1/geo/zip?lat=&lng=`)
`apps/api/src/core/geo-zip.ts` (pure, unit-tested) + `PrivacyController`:
- Bounding-box prefilter on the `(lat, lng)` B-tree index, expanding radii 8 → 25 → 80 km (+15 km padding), then haversine in process.
- We have Census internal points + land area, not polygons. Each candidate gets an equal-area radius r = √(area/π) (0.4–30 km); pick min **d − 0.5·r** (additively weighted nearest neighbour) so a point inside a large rural ZCTA doesn't snap to a tiny neighbour.
- Confidence: `high` d ≤ r (and ≤ 15 km); `medium` d ≤ max(2r, 1.5 km) (and ≤ 30 km); else `low`. Nothing within 80 km → `{zip: null}` (e.g. outside the US).
- Known limit: dense cities with tiny ZCTAs (Midtown Manhattan) can return a neighbouring ZIP with `medium` confidence. Follow-up: point-in-polygon with Census cartographic boundary files.
- `GET /v1/geo/zip/resolve` reads the same edge headers but only when `TRUST_PROXY` is configured; otherwise `{zip: null, source: "none"}`.
- Rate limits: 20/min (nearest), 30/min (resolve). Coordinates are never stored or logged; the error filter rounds `lat`/`lng` query params to 2 decimals (`redactUrl`).

## Consent manager
- Categories: strictly necessary / functional / analytics / advertising & affiliate measurement. Before a choice every non-essential category is **off**.
- US-style non-modal banner: notice + **Accept all / Reject non-essential / Manage**; preferences dialog; full preferences center at `/privacy-choices`; footer "Cookie settings".
- Storage: first-party cookie `pc_consent` (`1.<f><a><d><g>.<unix>`, 13 months, SameSite=Lax, Secure on HTTPS; read on the server to avoid banner flash) + account copy `user_preferences.consent` via `GET/PUT /v1/me/consent` (newest wins between device and account).
- **GPC**: `Sec-GPC: 1` (server) or `navigator.globalPrivacyControl` (client) → advertising forced off (also enforced by the API), "GPC signal honored" shown in banner, preferences and `/privacy-choices`.
- `@pricora/analytics` is enabled only with Analytics consent (`analytics.setEnabled`). No analytics/ads vendor is installed today.
- Functional off → recent searches/places are not written, functional storage is purged on withdrawal, and the ZIP cookie becomes a session cookie.

## Cookie / storage registry
Single source: `apps/web/src/lib/privacy/storage-registry.ts` → generates the table on `/legal/cookies`. `pnpm -C apps/web audit:storage` (runs in `lint`) fails on any `pc_*`/`pc-*` key in code that isn't registered, or a registered key no longer used.

## Data subject requests
- Signed in: existing `GET /v1/me/export` and `DELETE /v1/me` (Account → Privacy); correction via Account → Settings.
- Logged out: `POST /v1/privacy/requests` (access / delete / correct / opt_out; 5/hour per IP, ≤ 3 pending per email/day) → `privacy_requests` row with a hashed single-use verification token (72 h) and a 45-day `dueAt`. **No mailer exists yet**, so the API answers `verification: "not_configured"` and says no email was sent. `GET /v1/privacy/requests/verify?token=` completes verification once email delivery exists. Admin queue: not built (follow-up).

## Pages (all drafts)
`/legal/privacy` (notice at collection, PI categories table, state-law rights, GPC, appeals), `/legal/cookies`, `/legal/terms`, `/legal/affiliate-disclosure`, `/legal/accessibility` (WCAG 2.2 AA), `/legal/children` (COPPA), `/privacy-choices` (CCPA opt-out icon in footer next to "Your Privacy Choices").
