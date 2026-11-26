# Security (API + worker)

Status as implemented in `apps/api` (Wave 2). Items marked TODO are known gaps.

## Authentication & sessions
- Passwords: argon2id via `@node-rs/argon2` (library defaults). Unknown-email logins still run a verify against a dummy hash to keep timing similar.
- Sessions: 32-byte random opaque token. Web: httpOnly cookie `pc_session` (`SameSite=Lax`, `Secure` in production, 30-day TTL).
  Native: `Authorization: Bearer <token>`, only returned when the client sends `x-pricora-client: native`.
  Only `sha256(token)` is stored (`UserSession.tokenHash`); sessions are revocable (`revokedAt`) and checked for expiry + `User.status = active`.
- Logout revokes the current session; password reset revokes all sessions; admin suspension revokes all sessions of that user.
- Registration: password hashed before the existence check (equal timing) and a generic 409 message; full enumeration resistance needs email verification (TODO).
- Password reset: single-use hashed token, 1 h TTL; `forgot-password` always answers 200 (no account enumeration). Reset links are logged only outside production until SMTP delivery exists (TODO).
- OAuth (Google/Apple): returns 503 `pending_configuration` without keys; flow not implemented yet (TODO).

## CSRF
- Double-submit: readable `pc_csrf` cookie + `x-csrf-token` header, compared in constant time.
- Enforced on every non-GET/HEAD/OPTIONS request that carries a `pc_session` cookie. Bearer requests (no ambient credentials) and
  anonymous requests are exempt. Login CSRF is therefore not blocked for anonymous users (low impact; revisit if needed).

## Authorization (RBAC)
- Global `AuthGuard` + `@Auth(level)` per route: `public | optional | user | merchant | staff | admin`.
- `staff` = ADMIN/EDITOR/ANALYST read access; catalog writes (products, brands, categories, match reviews, offers, anomalies) require EDITOR or ADMIN;
  users, retailers, feature flags and audit logs are ADMIN-only. Admins cannot demote/suspend themselves; the last admin cannot delete their account.
- Every admin write appends an `AuditLog` row (actor, action, entity, before/after diff, IP, user agent).
- Merchant routes are scoped to the caller's `MerchantAccount`; offers from unverified merchants stay `isActive=false`.

## Input validation & errors
- Every params/query/body is validated with the Zod schema from `@pricora/contracts` (`422 validation_failed` with issues).
- Uniform error envelope; unexpected errors are logged server-side and returned as `internal_error` without stack traces.
- JSON body limit 1 MB; feed uploads 10 MB, single file, CSV/XML only.

## Outbound links (open redirect / SSRF)
- `/v1/go/:offerId` redirects only to `https:` URLs without credentials whose host is the retailer domain, `www.` + domain, or in
  `Retailer.allowedRedirectHosts`; otherwise 400 and no click is logged. The API never fetches the target URL.
- Merchant feed rows whose product URL is outside the store's allow-list are rejected at ingest.
- Travel deep links must be `https:`; demo rates/fares have no booking link (409).

## Privacy
- Clicks store `sha256(ip | day | SESSION_SECRET)`, never the raw IP. User agent truncated to 300 chars.
- `GET /v1/me/export` returns all user data; `DELETE /v1/me` hard-deletes the user (cascade), analytics rows keep `userId = null`.

## Transport & headers
- `helmet` on all routes (CSP relaxed only for `/docs` Swagger UI; `/docs` and `/openapi.json` are disabled when `NODE_ENV=production`), `x-powered-by` disabled, `trust proxy` = loopback in dev / 1 hop in prod.
- CORS allow-list: `WEB_ORIGIN`, `ADMIN_ORIGIN` with credentials; allowed headers `content-type, x-csrf-token, authorization, x-pricora-client`.

## Rate limiting (SEC-H1, SEC-M1)
- `@nestjs/throttler` with a Redis fixed-window store (in-memory fallback if Redis is down). Limits: `RATE_LIMIT_PER_MIN` (300) per client,
  `AUTH_RATE_LIMIT_PER_MIN` (30) per IP on login/register/reset, forgot-password 5/min, assistant 20/min.
- Client identity (`AppThrottlerGuard.getTracker`): a **valid** session (cookie or bearer, resolved against the DB) → `user:<id>`;
  else a trusted SSR call's forwarded visitor IP; else `req.ip`. Forged session tokens fall back to IP.
- Trusted server-to-server calls: header `x-internal-api-key` must equal `INTERNAL_API_KEY` (≥ 32 chars, constant-time compare).
  Only then is `x-pricora-client-ip` honoured. Trusted calls without a client IP (build-time, background) are not throttled.
  **Web (A02) and admin (A08) SSR must send both headers on every server-side API call** (key from server-only env, never `NEXT_PUBLIC_`).
- `X-Forwarded-For` is ignored unless `TRUST_PROXY` is set (hop count or comma-separated proxy IPs/CIDRs; `true` is rejected).
- Per-account login backoff (`LoginLockoutService`): after 5 failures in 15 min each further failure locks the email for 30 s, 60 s, … up to 15 min
  (429 + `Retry-After`), regardless of IP; applies to unknown emails too; cleared on success.

## Merchant feed ingestion (SEC-M2, SEC-L3, SEC-L4)
- Server-side type check: extension + declared MIME + binary sniff (NUL bytes) → 415. Max 10 MB / 20,000 rows (413).
- ≤ 500 rows processed inline with batched lookups; larger feeds are staged in `FEED_UPLOAD_DIR` and processed by the worker (`merchant-feeds` queue).
- Pending match-review rows are capped per store: 100 while the merchant is unverified, 2,000 when verified; excess rows are rejected with a reason.
- Titles starting with `= + @`, tab/CR, or `-` followed by a non-digit are prefixed with `'` (formula neutralisation) and flagged in row results.

## Secrets
- Only via environment (`.env`, never committed). `parseServerEnv` validates at boot (e.g. `SESSION_SECRET` ≥ 32 chars). Merchant API keys: shown once, stored as SHA-256 with a display prefix.

## Known gaps / TODO
- Email verification and SMTP delivery; OAuth flows; account lockout after repeated failures (rate limit + per-account backoff now in place).
- Merchant API-key authentication for programmatic offer updates (keys can be created/revoked; not yet accepted by routes).
- Session rotation on privilege change; CSP for the API JSON responses is default helmet.

## Integration credentials (admin-managed)
- All external credentials (retailer/affiliate/travel adapters, Google/Apple OAuth, Stripe, SMTP, Anthropic, Sentry, affiliate reporting APIs) can be
  managed in the admin panel via `/v1/admin/integrations` (ADMIN only, CSRF on cookie sessions, audit-logged with **field names only**).
- Stored in `integration_credentials.ciphertext` as AES-256-GCM (`v1:` + base64(iv|tag|ct)) with `CREDENTIALS_ENCRYPTION_KEY` (32 bytes, base64).
  The API/worker refuse to start in production without the key. Rotating the key makes stored values unreadable (status `error`, re-enter them).
- Responses never contain secret values: secret fields return `masked` (`••••1234`, or `••••` for short values) + `isSet` + `source` (`db`|`env`).
- Resolution: adapters receive `{ ...process.env, ...decryptedDbValues }` (DB wins; a disabled integration blanks its fields). Cached 30 s and
  invalidated immediately in API and worker via Redis pub/sub channel `pricora:integrations:changed`.
- `POST /v1/admin/integrations/:id/test` performs a real check (adapter `healthCheck`, Stripe `/v1/balance`, Anthropic `/v1/models`, SMTP TCP connect) with an
  8 s timeout; integrations without an automated check report `unverified`, never `live`.
- `GET /v1/admin/openapi.json` (ADMIN/EDITOR/ANALYST) serves the full spec in all environments; public `/docs` stays dev-only.
