# API contracts (v1)

Source of truth: `packages/contracts` (Zod 4). The API validates every input with these schemas; web, admin and
mobile consume the same types through `@pricora/api-client`. This file is a map — the schemas win if they disagree.

## Conventions
- Base URL: `${API_URL}/v1` (dev `http://localhost:4400/v1`). Swagger UI at `/docs`, raw OpenAPI 3.1 at `/openapi.json` (generated from this registry).
- **Money**: integer cents (`priceCents`, `totalCents`, …) + `currency` (ISO 4217, default `USD`). Never floats.
  Percentages stored as basis points (`dropPercentBp: 1000` = 10%); computed ratios in responses are floats (`dropRatio: 0.12`).
- **Source**: every offer / flight fare / hotel rate carries `source: "api" | "feed" | "merchant_upload" | "affiliate" | "demo"`.
  `demo` must render a visible "Demo data" label. Aggregates expose `hasDemoData`.
- **Providers** (travel, health): `{ id, name, status: "live" | "pending_configuration" | "error", message? }`.
  Missing credentials → `pending_configuration`, never fake results.
- **Errors**: `ErrorEnvelope` → `{ error: { code, message, details?, requestId? } }` with a matching HTTP status.
  Codes: `bad_request`, `validation_failed` (422, details = Zod issues), `unauthorized`, `forbidden`, `csrf_invalid`,
  `not_found`, `conflict`, `rate_limited`, `pending_configuration` (503), `provider_error`, `service_unavailable`, `internal_error`.
- **Pagination**: `page` (1-based), `pageSize` (default 24, max 60) → `{ items, page, pageSize, total, totalPages }` (`paginated()` helper).
- **Dates**: ISO-8601 strings with offset (`IsoDateTime`); date-only fields `YYYY-MM-DD` (`IsoDate`).
- **Auth (web/admin)**: opaque session token in httpOnly cookie `pc_session` (SHA-256 hash stored in `UserSession`, 30-day TTL).
  Any non-GET request that carries the `pc_session` cookie must send header `x-csrf-token` equal to the readable `pc_csrf` cookie
  (double-submit; the token is also returned by `auth.me` / `auth.login` / `auth.register`). Call `GET /v1/auth/me` once on load
  to obtain it. Clients must send `credentials: "include"` (api-client does this by default).
- **Auth (native apps)**: send header `x-pricora-client: native` on login/register → response includes `sessionToken`. Then send
  `Authorization: Bearer <sessionToken>`; no cookies and no CSRF header needed. Logout revokes the session.
- **Rate limits** (Redis-backed, per minute): 300 per client (`RATE_LIMIT_PER_MIN`), login/register/reset 30 per IP (`AUTH_RATE_LIMIT_PER_MIN`), forgot-password 5, assistant 20 → 429 `rate_limited`. Client identity = signed-in user, else IP. Per-account login lockout after 5 failures (429 + `Retry-After`).
- **Trusted SSR calls** (web/admin servers): send `x-internal-api-key: $INTERNAL_API_KEY` and `x-pricora-client-ip: <visitor IP>` (plus the visitor's cookie when acting for them). Without the client IP header, trusted calls are not throttled (build/background). Never expose the key to browsers.
- **Uploads**: merchant feeds ≤ 10 MB, ≤ 20,000 rows, `.csv/.txt/.tsv` or `.xml` text only (415 `unsupported_media_type`, 413 `payload_too_large`). ≤ 500 rows are processed inline (`status: completed`); larger feeds return `status: queued` and are processed by the worker — poll `GET /v1/merchant/feeds`.
- **Push**: `POST /v1/me/devices` registers an Expo token; alert pushes carry `data: { url, notificationId, type }` (`PushPayloadData`), `url` is an app path.
- **CORS**: allow-list `WEB_ORIGIN` (http://localhost:3100) and `ADMIN_ORIGIN` (http://localhost:3001) with credentials.
- **Outbound links**: offers expose `goUrl` (`/v1/go/:offerId`), never raw retailer URLs. The API logs an `AffiliateClick`
  and 302-redirects only to hosts in `Retailer.allowedRedirectHosts`.

Auth levels: `public` · `optional` (session used if present) · `user` · `merchant` (MERCHANT) · `staff` (ADMIN/EDITOR/ANALYST; writes need EDITOR+) · `admin` (ADMIN).

## Endpoint registry
Generated from `endpoints` in `packages/contracts/src/endpoints.ts` (key = api-client name). Schema names are exports of `@pricora/contracts`.

| Name | Method | Path | Auth | Params | Query | Body | Response |
|---|---|---|---|---|---|---|---|
| `auth.register` | POST | `/v1/auth/register` | public | — | — | `RegisterRequest` | `AuthSessionResponse` |
| `auth.login` | POST | `/v1/auth/login` | public | — | — | `LoginRequest` | `AuthSessionResponse` |
| `auth.logout` | POST | `/v1/auth/logout` | user | — | — | — | `OkResponse` |
| `auth.me` | GET | `/v1/auth/me` | optional | — | — | — | `MeResponse` |
| `auth.forgotPassword` | POST | `/v1/auth/forgot-password` | public | — | — | `ForgotPasswordRequest` | `ForgotPasswordResponse` |
| `auth.resetPassword` | POST | `/v1/auth/reset-password` | public | — | — | `ResetPasswordRequest` | `OkResponse` |
| `auth.oauthStart` | GET | `/v1/auth/oauth/:provider` | public | `OAuthStartParams` | `OAuthStartQuery` | — | 302 redirect |
| `catalog.categories` | GET | `/v1/categories` | public | — | — | — | `CategoryTreeResponse` |
| `catalog.category` | GET | `/v1/categories/:slug` | public | `SlugParam` | — | — | `CategoryDetailResponse` |
| `catalog.brand` | GET | `/v1/brands/:slug` | public | `SlugParam` | — | — | `BrandDetailResponse` |
| `catalog.retailers` | GET | `/v1/retailers` | public | — | — | — | `RetailerListResponse` |
| `catalog.retailer` | GET | `/v1/retailers/:slug` | public | `SlugParam` | — | — | `RetailerDetailResponse` |
| `catalog.product` | GET | `/v1/products/:slug` | optional | `SlugParam` | `ProductDetailQuery` | — | `ProductDetailResponse` |
| `catalog.productHistory` | GET | `/v1/products/:slug/history` | public | `SlugParam` | `ProductHistoryQuery` | — | `ProductHistoryResponse` |
| `catalog.compare` | GET | `/v1/compare` | public | — | `CompareQuery` | — | `CompareResponse` |
| `catalog.home` | GET | `/v1/home` | optional | — | — | — | `HomeResponse` |
| `catalog.deals` | GET | `/v1/deals` | public | — | `DealsQuery` | — | `DealsResponse` |
| `catalog.priceDrops` | GET | `/v1/price-drops` | public | — | `PriceDropsQuery` | — | `PriceDropsResponse` |
| `coupons.list` | GET | `/v1/coupons` | public | — | `CouponListQuery` | — | `CouponListResponse` |
| `coupons.get` | GET | `/v1/coupons/:id` | public | `IdParam` | — | — | `Coupon` |
| `coupons.retailer` | GET | `/v1/retailers/:slug/coupons` | public | `SlugParam` | `RetailerCouponQuery` | — | `CouponListResponse` |
| `coupons.retailerStats` | GET | `/v1/retailers/:slug/coupon-stats` | public | `SlugParam` | — | — | `RetailerCouponStats` |
| `coupons.submit` | POST | `/v1/coupons` | user | — | — | `SubmitCouponRequest` | `Coupon` |
| `coupons.result` | POST | `/v1/coupons/:id/result` | optional | `IdParam` | — | `CouponResultRequest` | `CouponResultResponse` |
| `coupons.vote` | POST | `/v1/coupons/:id/vote` | user | `IdParam` | — | `CouponVoteRequest` | `CouponResultResponse` |
| `coupons.go` | GET | `/v1/coupons/:id/go` | optional | `IdParam` | — | — | 302 redirect |
| `me.couponFollows.list` | GET | `/v1/me/coupon-follows` | user | — | — | — | `CouponFollowListResponse` |
| `me.couponFollows.create` | POST | `/v1/me/coupon-follows` | user | — | — | `CreateCouponFollowRequest` | `CouponFollow` |
| `me.couponFollows.delete` | DELETE | `/v1/me/coupon-follows/:retailerSlug` | user | `RetailerSlugParam` | — | — | `OkResponse` |
| `extension.config` | GET | `/v1/extension/config` | public | — | — | — | `ExtensionConfigResponse` |
| `extension.coupons` | GET | `/v1/extension/coupons` | public | — | `ExtensionCouponsQuery` | — | `ExtensionCouponsResponse` |
| `extension.product` | GET | `/v1/extension/product` | public | — | `ExtensionProductQuery` | — | `ExtensionProductResponse` |
| `search.search` | GET | `/v1/search` | public | — | `SearchQuery` | — | `SearchResponse` |
| `search.suggest` | GET | `/v1/search/suggest` | public | — | `SuggestQuery` | — | `SuggestResponse` |
| `search.trending` | GET | `/v1/search/trending` | public | — | — | — | `TrendingResponse` |
| `me.favorites.list` | GET | `/v1/me/favorites` | user | — | `MeListQuery` | — | `FavoriteListResponse` |
| `me.favorites.create` | POST | `/v1/me/favorites` | user | — | — | `CreateFavoriteRequest` | `Favorite` |
| `me.favorites.delete` | DELETE | `/v1/me/favorites/:id` | user | `IdParam` | — | — | `OkResponse` |
| `me.alerts.list` | GET | `/v1/me/alerts` | user | — | `MeListQuery` | — | `PriceAlertListResponse` |
| `me.alerts.create` | POST | `/v1/me/alerts` | user | — | — | `CreatePriceAlertRequest` | `PriceAlert` |
| `me.alerts.update` | PATCH | `/v1/me/alerts/:id` | user | `IdParam` | — | `UpdatePriceAlertRequest` | `PriceAlert` |
| `me.alerts.delete` | DELETE | `/v1/me/alerts/:id` | user | `IdParam` | — | — | `OkResponse` |
| `me.lists.list` | GET | `/v1/me/lists` | user | — | — | — | `ShoppingListsResponse` |
| `me.lists.create` | POST | `/v1/me/lists` | user | — | — | `CreateShoppingListRequest` | `ShoppingListDetail` |
| `me.lists.get` | GET | `/v1/me/lists/:id` | user | `IdParam` | — | — | `ShoppingListDetail` |
| `me.lists.update` | PATCH | `/v1/me/lists/:id` | user | `IdParam` | — | `UpdateShoppingListRequest` | `ShoppingListDetail` |
| `me.lists.delete` | DELETE | `/v1/me/lists/:id` | user | `IdParam` | — | — | `OkResponse` |
| `me.lists.addItem` | POST | `/v1/me/lists/:id/items` | user | `IdParam` | — | `AddShoppingListItemRequest` | `ShoppingListDetail` |
| `me.lists.updateItem` | PATCH | `/v1/me/lists/:id/items/:itemId` | user | `{id, itemId}` | — | `UpdateShoppingListItemRequest` | `ShoppingListDetail` |
| `me.lists.removeItem` | DELETE | `/v1/me/lists/:id/items/:itemId` | user | `{id, itemId}` | — | — | `ShoppingListDetail` |
| `me.recentlyViewed` | GET | `/v1/me/recently-viewed` | user | — | — | — | `RecentlyViewedResponse` |
| `me.preferences.get` | GET | `/v1/me/preferences` | user | — | — | — | `PreferencesResponse` |
| `me.preferences.update` | PATCH | `/v1/me/preferences` | user | — | — | `UpdatePreferencesRequest` | `PreferencesResponse` |
| `me.devices.register` | POST | `/v1/me/devices` | user | — | — | `RegisterDeviceRequest` | `DeviceResponse` |
| `me.devices.delete` | DELETE | `/v1/me/devices/:token` | user | `DeviceTokenParam` | — | — | `OkResponse` |
| `me.export` | GET | `/v1/me/export` | user | — | — | — | `DataExportResponse` |
| `me.delete` | DELETE | `/v1/me` | user | — | — | `DeleteAccountRequest` | `OkResponse` |
| `basket.optimize` | POST | `/v1/basket/optimize` | optional | — | — | `BasketOptimizeRequest` | `BasketOptimizeResponse` |
| `go.offer` | GET | `/v1/go/:offerId` | optional | `GoParams` | `GoQuery` | — | 302 redirect |
| `travel.places` | GET | `/v1/travel/places` | public | — | `PlacesQuery` | — | `PlacesResponse` |
| `travel.guides` | GET | `/v1/travel/guides` | public | — | `GuideListQuery` | — | `GuideListResponse` |
| `travel.guide` | GET | `/v1/travel/guides/:slug` | public | `SlugParam` | — | — | `GuideDetail` |
| `travel.airports` | GET | `/v1/travel/airports` | public | — | `AirportSearchQuery` | — | `AirportSearchResponse` |
| `travel.flights` | GET | `/v1/travel/flights/search` | public | — | `FlightSearchQuery` | — | `FlightSearchResponse` |
| `travel.hotels` | GET | `/v1/travel/hotels/search` | public | — | `HotelSearchQuery` | — | `HotelSearchResponse` |
| `travel.hotel` | GET | `/v1/travel/hotels/:id` | public | `IdParam` | `HotelDetailQuery` | — | `HotelDetailResponse` |
| `travel.go` | GET | `/v1/travel/go/:type/:id` | optional | `TravelGoParams` | — | — | 302 redirect |
| `scan.lookup` | GET | `/v1/scan/:code` | public | `ScanParams` | — | — | `ScanResponse` |
| `assistant.ask` | POST | `/v1/assistant` | optional | — | — | `AssistantRequest` | `AssistantResponse` |
| `health.get` | GET | `/v1/health` | public | — | — | — | `HealthResponse` |
| `admin.stats` | GET | `/v1/admin/stats` | staff | — | `AdminStatsQuery` | — | `AdminStatsResponse` |
| `admin.users.list` | GET | `/v1/admin/users` | admin | — | `AdminListQuery` | — | `AdminUserListResponse` |
| `admin.users.update` | PATCH | `/v1/admin/users/:id` | admin | `IdParam` | — | `AdminUpdateUserRequest` | `AdminUser` |
| `admin.products.list` | GET | `/v1/admin/products` | staff | — | `AdminListQuery` | — | `AdminProductListResponse` |
| `admin.products.create` | POST | `/v1/admin/products` | staff | — | — | `AdminUpsertProductRequest` | `AdminProduct` |
| `admin.products.update` | PATCH | `/v1/admin/products/:id` | staff | `IdParam` | — | `AdminUpsertProductRequest` (partial) | `AdminProduct` |
| `admin.categories.create` | POST | `/v1/admin/categories` | staff | — | — | `AdminUpsertCategoryRequest` | `OkResponse` |
| `admin.categories.update` | PATCH | `/v1/admin/categories/:id` | staff | `IdParam` | — | `AdminUpsertCategoryRequest` (partial) | `OkResponse` |
| `admin.retailers.list` | GET | `/v1/admin/retailers` | staff | — | `AdminListQuery` | — | `AdminRetailerListResponse` |
| `admin.retailers.update` | PATCH | `/v1/admin/retailers/:id` | admin | `IdParam` | — | `AdminUpdateRetailerRequest` | `AdminRetailer` |
| `admin.offers.list` | GET | `/v1/admin/offers` | staff | — | `AdminOfferListQuery` | — | `AdminOfferListResponse` |
| `admin.matches.list` | GET | `/v1/admin/matches` | staff | — | `AdminMatchListQuery` | — | `AdminMatchListResponse` |
| `admin.matches.review` | POST | `/v1/admin/matches/:id/review` | staff | `IdParam` | — | `AdminReviewMatchRequest` | `OkResponse` |
| `admin.anomalies.list` | GET | `/v1/admin/anomalies` | staff | — | `AdminAnomalyListQuery` | — | `AdminAnomalyListResponse` |
| `admin.anomalies.resolve` | POST | `/v1/admin/anomalies/:id/resolve` | staff | `IdParam` | — | `AdminResolveAnomalyRequest` | `OkResponse` |
| `admin.offers.update` | PATCH | `/v1/admin/offers/:id` | staff | `IdParam` | — | `AdminUpdateOfferRequest` | `OkResponse` |
| `admin.products.get` | GET | `/v1/admin/products/:id` | staff | `IdParam` | — | — | `AdminProductDetail` |
| `admin.categories.list` | GET | `/v1/admin/categories` | staff | — | — | — | `AdminCategoryListResponse` |
| `admin.brands.list` | GET | `/v1/admin/brands` | staff | — | `AdminListQuery` | — | `AdminBrandListResponse` |
| `admin.brands.create` | POST | `/v1/admin/brands` | staff | — | — | `AdminUpsertBrandRequest` | `AdminBrand` |
| `admin.brands.update` | PATCH | `/v1/admin/brands/:id` | staff | `IdParam` | — | `AdminUpsertBrandRequest` (partial) | `AdminBrand` |
| `admin.flags.list` | GET | `/v1/admin/flags` | staff | — | — | — | `FeatureFlagListResponse` |
| `admin.flags.update` | PATCH | `/v1/admin/flags/:key` | admin | `{key}` | — | `UpdateFeatureFlagRequest` | `FeatureFlag` |
| `admin.auditLogs.list` | GET | `/v1/admin/audit-logs` | admin | — | `AdminListQuery` | — | `AuditLogListResponse` |
| `admin.retailers.logo.upload` | POST | `/v1/admin/retailers/:id/logo` | staff | `IdParam` | — | `AdminLogoUploadRequest` (multipart) | `AdminLogoResponse` |
| `admin.retailers.logo.delete` | DELETE | `/v1/admin/retailers/:id/logo` | staff | `IdParam` | — | — | `AdminLogoResponse` |
| `admin.brands.logo.upload` | POST | `/v1/admin/brands/:id/logo` | staff | `IdParam` | — | `AdminLogoUploadRequest` (multipart) | `AdminLogoResponse` |
| `admin.brands.logo.delete` | DELETE | `/v1/admin/brands/:id/logo` | staff | `IdParam` | — | — | `AdminLogoResponse` |
| `admin.integrations.list` | GET | `/v1/admin/integrations` | admin | — | — | — | `AdminIntegrationListResponse` |
| `admin.integrations.get` | GET | `/v1/admin/integrations/:id` | admin | `IntegrationIdParam` | — | — | `AdminIntegration` |
| `admin.integrations.update` | PUT | `/v1/admin/integrations/:id` | admin | `IntegrationIdParam` | — | `AdminUpdateIntegrationRequest` | `AdminIntegration` |
| `admin.integrations.test` | POST | `/v1/admin/integrations/:id/test` | admin | `IntegrationIdParam` | — | — | `AdminIntegrationTestResponse` |
| `admin.integrations.clear` | DELETE | `/v1/admin/integrations/:id` | admin | `IntegrationIdParam` | — | — | `OkResponse` |
| `admin.openapi` | GET | `/v1/admin/openapi.json` | staff | — | — | — | OpenAPI 3.1 document |
| `admin.coupons.list` | GET | `/v1/admin/coupons` | staff | — | `AdminCouponListQuery` | — | `AdminCouponListResponse` |
| `admin.coupons.create` | POST | `/v1/admin/coupons` | staff | — | — | `AdminCreateCouponRequest` | `AdminCoupon` |
| `admin.coupons.update` | PATCH | `/v1/admin/coupons/:id` | staff | `IdParam` | — | `AdminUpdateCouponRequest` | `AdminCoupon` |
| `admin.coupons.delete` | DELETE | `/v1/admin/coupons/:id` | staff | `IdParam` | — | — | `OkResponse` |
| `admin.checkoutConfigs.list` | GET | `/v1/admin/checkout-configs` | staff | — | — | — | `AdminCheckoutConfigListResponse` |
| `admin.checkoutConfigs.upsert` | PUT | `/v1/admin/checkout-configs/:id` | staff | `IdParam` | — | `AdminUpsertCheckoutConfigRequest` | `AdminCheckoutConfig` |
| `admin.guides.list` | GET | `/v1/admin/guides` | staff | — | `AdminGuideListQuery` | — | `AdminGuideListResponse` |
| `admin.guides.get` | GET | `/v1/admin/guides/:id` | staff | `IdParam` | — | — | `AdminGuide` |
| `admin.guides.create` | POST | `/v1/admin/guides` | staff | — | — | `AdminUpsertGuideRequest` | `AdminGuide` |
| `admin.guides.update` | PATCH | `/v1/admin/guides/:id` | staff | `IdParam` | — | `AdminUpdateGuideRequest` | `AdminGuide` |
| `admin.guides.delete` | DELETE | `/v1/admin/guides/:id` | staff | `IdParam` | — | — | `OkResponse` |
| `merchant.profile.get` | GET | `/v1/merchant/profile` | merchant | — | — | — | `MerchantProfile` |
| `merchant.profile.update` | PATCH | `/v1/merchant/profile` | merchant | — | — | `UpdateMerchantProfileRequest` | `MerchantProfile` |
| `merchant.feeds.list` | GET | `/v1/merchant/feeds` | merchant | — | `MeListQuery` | — | `MerchantFeedListResponse` |
| `merchant.feeds.upload` | POST | `/v1/merchant/feeds` | merchant | — | — | `MerchantFeedUploadRequest` (multipart) | `MerchantFeed` |
| `merchant.offers.list` | GET | `/v1/merchant/offers` | merchant | — | `MerchantOfferListQuery` | — | `MerchantOfferListResponse` |
| `merchant.offers.update` | PATCH | `/v1/merchant/offers/:id` | merchant | `IdParam` | — | `UpdateMerchantOfferRequest` | `MerchantOffer` |
| `merchant.analytics` | GET | `/v1/merchant/analytics` | merchant | — | `{range}` (7d / 30d / 90d) | — | `MerchantAnalyticsResponse` |
| `merchant.coupons.list` | GET | `/v1/merchant/coupons` | merchant | — | `MeListQuery` | — | `AdminCouponListResponse` |
| `merchant.coupons.create` | POST | `/v1/merchant/coupons` | merchant | — | — | `MerchantCreateCouponRequest` | `AdminCoupon` |
| `merchant.apiKeys.list` | GET | `/v1/merchant/api-keys` | merchant | — | — | — | `ApiKeyListResponse` |
| `merchant.apiKeys.create` | POST | `/v1/merchant/api-keys` | merchant | — | — | `CreateApiKeyRequest` | `CreateApiKeyResponse` |
| `merchant.apiKeys.revoke` | DELETE | `/v1/merchant/api-keys/:id` | merchant | `IdParam` | — | — | `OkResponse` |

## Key shapes
- `ProductCard` — grid/rail item: lowest price/total, `storeCount`, `dropRatio`, `dealScore`, `hasDemoData`, `sponsored`.
- `ProductDetailResponse` — `product` (identifiers, attributes, images, variants), `offers[]` (`Offer` with `shipping`,
  `tax` {status: `estimated` | `unknown_set_zip` | …}, `estimatedTotalCents`, `source`, `goUrl`), `priceStats`,
  `dealScore` `{score 0–100, tier, confidence 0–1, reasons[]}`, `fakeDiscount` `{flag, message, …}`.
- `ProductHistoryResponse` — per-retailer `series[]` of real `PriceHistoryPoint`s (no interpolation), daily `lowest[]`, `stats`.
- `SearchResponse` — `items`, `facets` (categories/brands/retailers/conditions/price buckets), `total`, `degraded`, `parsed` (NL query parse).
- `HomeResponse` — `trending`, `bestDeals`, `priceDrops`, `under25/50/100`, `topCategories`, `retailers`, `recentlyViewed?`.
- `BasketOptimizeResponse` — `scenarios[]` (`single_store` | `multi_store_cheapest` | `min_stores`) with per-store groups, shipping, tax, assumptions, `method: exact | heuristic`.
- `FlightSearchResponse` / `HotelSearchResponse` — results + `providers[]` + aggregate `source`.
- `ScanResponse` — discriminated on `status: "found" | "not_found"`.

## Using the client
```ts
import { createApiClient, ApiError } from "@pricora/api-client";
const api = createApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL! });
const { items, facets } = await api.search.search({ q: "oled tv", maxPrice: 150000, sort: "lowest_total" });
const href = api.catalog.goUrl(offer.id, "pdp_offer_table"); // use as <a href>, never fetch
```
SSR: pass `headers: () => ({ cookie })` to forward the session cookie. Set `validateResponses: true` in dev/tests to assert responses match contracts.
