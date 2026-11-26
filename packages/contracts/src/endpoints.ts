import { z } from "zod";
import { IdParam, OkResponse, PaginationQuery, SlugParam } from "./common";
import {
  AdminCheckoutConfig,
  AdminCheckoutConfigListResponse,
  AdminCoupon,
  AdminCouponListQuery,
  AdminCouponListResponse,
  AdminCreateCouponRequest,
  AdminUpdateCouponRequest,
  AdminUpsertCheckoutConfigRequest,
  Coupon,
  CouponFollow,
  CouponFollowListResponse,
  CouponListQuery,
  CouponListResponse,
  CouponResultRequest,
  CouponResultResponse,
  CouponVoteRequest,
  CreateCouponFollowRequest,
  ExtensionConfigResponse,
  ExtensionCouponsQuery,
  ExtensionCouponsResponse,
  MerchantCreateCouponRequest,
  RetailerCouponQuery,
  RetailerCouponStats,
  RetailerSlugParam,
  SubmitCouponRequest,
} from "./coupons";
import { ExtensionProductQuery, ExtensionProductResponse } from "./extension";
import {
  AuthSessionResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  MeResponse,
  OAuthStartParams,
  OAuthStartQuery,
  RegisterRequest,
  ResetPasswordRequest,
} from "./auth";
import {
  BrandDetailResponse,
  CategoryDetailResponse,
  CategoryTreeResponse,
  CompareQuery,
  CompareResponse,
  DealsQuery,
  DealsResponse,
  PriceDropsQuery,
  PriceDropsResponse,
  ProductDetailQuery,
  ProductDetailResponse,
  ProductHistoryQuery,
  ProductHistoryResponse,
  RetailerDetailResponse,
  RetailerListResponse,
} from "./catalog";
import { SearchQuery, SearchResponse, SuggestQuery, SuggestResponse, TrendingResponse } from "./search";
import { HomeResponse } from "./home";
import {
  AddShoppingListItemRequest,
  CreateFavoriteRequest,
  CreatePriceAlertRequest,
  CreateShoppingListRequest,
  DataExportResponse,
  DeleteAccountRequest,
  DeviceResponse,
  DeviceTokenParam,
  RegisterDeviceRequest,
  Favorite,
  FavoriteListResponse,
  PreferencesResponse,
  PriceAlert,
  PriceAlertListResponse,
  RecentlyViewedResponse,
  ShoppingListDetail,
  ShoppingListsResponse,
  UpdatePreferencesRequest,
  UpdatePriceAlertRequest,
  UpdateShoppingListItemRequest,
  UpdateShoppingListRequest,
} from "./user";
import { BasketOptimizeRequest, BasketOptimizeResponse } from "./basket";
import {
  AirportSearchQuery,
  AirportSearchResponse,
  FlightSearchQuery,
  FlightSearchResponse,
  HotelDetailQuery,
  HotelDetailResponse,
  HotelSearchQuery,
  HotelSearchResponse,
  TravelGoParams,
} from "./travel";
import { AssistantRequest, AssistantResponse, GoParams, GoQuery, HealthResponse, ScanParams, ScanResponse } from "./misc";
import {
  AdminListQuery,
  AdminAnomalyListResponse,
  AdminAnomalyListQuery,
  AdminIntegration,
  AdminLogoResponse,
  AdminLogoUploadRequest,
  AdminIntegrationListResponse,
  AdminIntegrationTestResponse,
  AdminUpdateIntegrationRequest,
  IntegrationIdParam,
  AdminBrandListResponse,
  AdminCategoryListResponse,
  AdminMatchListQuery,
  AdminProductDetail,
  AdminResolveAnomalyRequest,
  AdminUpdateOfferRequest,
  AdminUpsertBrandRequest,
  AdminMatchListResponse,
  AdminOfferListQuery,
  AdminOfferListResponse,
  AdminProductListResponse,
  AdminRetailerListResponse,
  AdminReviewMatchRequest,
  AdminStatsQuery,
  AdminStatsResponse,
  AdminUpdateRetailerRequest,
  AdminUpdateUserRequest,
  AdminUpsertCategoryRequest,
  AdminUpsertProductRequest,
  AdminUserListResponse,
  AuditLogListResponse,
  FeatureFlagListResponse,
  UpdateFeatureFlagRequest,
} from "./admin";
import {
  ApiKeyListResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  MerchantAnalyticsResponse,
  MerchantFeed,
  MerchantFeedListResponse,
  MerchantFeedUploadRequest,
  MerchantOfferListQuery,
  MerchantOfferListResponse,
  MerchantProfile,
  UpdateMerchantOfferRequest,
  UpdateMerchantProfileRequest,
} from "./merchant";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
export type AuthLevel = "public" | "optional" | "user" | "merchant" | "staff" | "admin";

export interface EndpointDef {
  method: HttpMethod;
  /** Path relative to /v1 with :params. */
  path: string;
  auth: AuthLevel;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
  /** Response body schema. For redirects, `null`. */
  response: z.ZodTypeAny | null;
  /** multipart/form-data body (file uploads). */
  multipart?: boolean;
  description: string;
}

const def = <T extends EndpointDef>(d: T): T => d;

const ListIdParams = z.object({ id: z.string(), itemId: z.string() });
const ProviderParams = OAuthStartParams;
const KeyParam = z.object({ key: z.string() });
const CodeParam = ScanParams;

/**
 * Registry of every v1 endpoint. Single source of truth for API (validation pipes),
 * api-client (typed calls) and docs/API_CONTRACTS.md.
 */
export const endpoints = {
  /* Auth */
  "auth.register": def({ method: "POST", path: "/auth/register", auth: "public", body: RegisterRequest, response: AuthSessionResponse, description: "Create account and start session" }),
  "auth.login": def({ method: "POST", path: "/auth/login", auth: "public", body: LoginRequest, response: AuthSessionResponse, description: "Email/password login" }),
  "auth.logout": def({ method: "POST", path: "/auth/logout", auth: "user", response: OkResponse, description: "Revoke current session" }),
  "auth.me": def({ method: "GET", path: "/auth/me", auth: "optional", response: MeResponse, description: "Current user (null when anonymous) + CSRF token" }),
  "auth.forgotPassword": def({ method: "POST", path: "/auth/forgot-password", auth: "public", body: ForgotPasswordRequest, response: ForgotPasswordResponse, description: "Send reset email (always 200)" }),
  "auth.resetPassword": def({ method: "POST", path: "/auth/reset-password", auth: "public", body: ResetPasswordRequest, response: OkResponse, description: "Reset password with token" }),
  "auth.oauthStart": def({ method: "GET", path: "/auth/oauth/:provider", auth: "public", params: ProviderParams, query: OAuthStartQuery, response: null, description: "302 to provider; 503 pending_configuration without keys" }),

  /* Catalog */
  "catalog.categories": def({ method: "GET", path: "/categories", auth: "public", response: CategoryTreeResponse, description: "Category tree" }),
  "catalog.category": def({ method: "GET", path: "/categories/:slug", auth: "public", params: SlugParam, response: CategoryDetailResponse, description: "Category detail" }),
  "catalog.brand": def({ method: "GET", path: "/brands/:slug", auth: "public", params: SlugParam, response: BrandDetailResponse, description: "Brand detail" }),
  "catalog.retailers": def({ method: "GET", path: "/retailers", auth: "public", response: RetailerListResponse, description: "All retailers" }),
  "catalog.retailer": def({ method: "GET", path: "/retailers/:slug", auth: "public", params: SlugParam, response: RetailerDetailResponse, description: "Retailer detail" }),
  "catalog.product": def({ method: "GET", path: "/products/:slug", auth: "optional", params: SlugParam, query: ProductDetailQuery, response: ProductDetailResponse, description: "Product + offers + stats + deal score" }),
  "catalog.productHistory": def({ method: "GET", path: "/products/:slug/history", auth: "public", params: SlugParam, query: ProductHistoryQuery, response: ProductHistoryResponse, description: "Real price observations" }),
  "catalog.compare": def({ method: "GET", path: "/compare", auth: "public", query: CompareQuery, response: CompareResponse, description: "Compare 2–4 products" }),
  "catalog.home": def({ method: "GET", path: "/home", auth: "optional", response: HomeResponse, description: "Home page sections" }),
  "catalog.deals": def({ method: "GET", path: "/deals", auth: "public", query: DealsQuery, response: DealsResponse, description: "Deals ranked by Deal Score" }),
  "catalog.priceDrops": def({ method: "GET", path: "/price-drops", auth: "public", query: PriceDropsQuery, response: PriceDropsResponse, description: "Recent price drops" }),

  /* Coupons */
  "coupons.list": def({ method: "GET", path: "/coupons", auth: "public", query: CouponListQuery, response: CouponListResponse, description: "Coupons across stores" }),
  "coupons.get": def({ method: "GET", path: "/coupons/:id", auth: "public", params: IdParam, response: Coupon, description: "One coupon" }),
  "coupons.retailer": def({ method: "GET", path: "/retailers/:slug/coupons", auth: "public", params: SlugParam, query: RetailerCouponQuery, response: CouponListResponse, description: "A store's coupons" }),
  "coupons.retailerStats": def({ method: "GET", path: "/retailers/:slug/coupon-stats", auth: "public", params: SlugParam, response: RetailerCouponStats, description: "Store coupon stats from real usage events" }),
  "coupons.submit": def({ method: "POST", path: "/coupons", auth: "user", body: SubmitCouponRequest, response: Coupon, description: "Community coupon submission (unverified until confirmed)" }),
  "coupons.result": def({ method: "POST", path: "/coupons/:id/result", auth: "optional", params: IdParam, body: CouponResultRequest, response: CouponResultResponse, description: "Report whether a coupon worked (anonymous allowed, rate-limited)" }),
  "coupons.vote": def({ method: "POST", path: "/coupons/:id/vote", auth: "user", params: IdParam, body: CouponVoteRequest, response: CouponResultResponse, description: "Signed-in worked/didn't-work vote" }),
  "coupons.go": def({ method: "GET", path: "/coupons/:id/go", auth: "optional", params: IdParam, response: null, description: "Log click, 302 to allow-listed store/affiliate URL" }),
  "me.couponFollows.list": def({ method: "GET", path: "/me/coupon-follows", auth: "user", response: CouponFollowListResponse, description: "Followed stores" }),
  "me.couponFollows.create": def({ method: "POST", path: "/me/coupon-follows", auth: "user", body: CreateCouponFollowRequest, response: CouponFollow, description: "Follow a store's coupons" }),
  "me.couponFollows.delete": def({ method: "DELETE", path: "/me/coupon-follows/:retailerSlug", auth: "user", params: RetailerSlugParam, response: OkResponse, description: "Unfollow" }),

  /* Browser extension */
  "extension.config": def({ method: "GET", path: "/extension/config", auth: "public", response: ExtensionConfigResponse, description: "Enabled checkout configs (cacheable)" }),
  "extension.coupons": def({ method: "GET", path: "/extension/coupons", auth: "public", query: ExtensionCouponsQuery, response: ExtensionCouponsResponse, description: "Codes for a store host, best success rate first" }),
  "extension.product": def({ method: "GET", path: "/extension/product", auth: "public", query: ExtensionProductQuery, response: ExtensionProductResponse, description: "Product page URL → product + cheaper offers" }),

  /* Search */
  "search.search": def({ method: "GET", path: "/search", auth: "public", query: SearchQuery, response: SearchResponse, description: "Product search with facets" }),
  "search.suggest": def({ method: "GET", path: "/search/suggest", auth: "public", query: SuggestQuery, response: SuggestResponse, description: "Autocomplete" }),
  "search.trending": def({ method: "GET", path: "/search/trending", auth: "public", response: TrendingResponse, description: "Trending queries/products" }),

  /* Me */
  "me.favorites.list": def({ method: "GET", path: "/me/favorites", auth: "user", query: PaginationQuery, response: FavoriteListResponse, description: "List favorites" }),
  "me.favorites.create": def({ method: "POST", path: "/me/favorites", auth: "user", body: CreateFavoriteRequest, response: Favorite, description: "Add favorite" }),
  "me.favorites.delete": def({ method: "DELETE", path: "/me/favorites/:id", auth: "user", params: IdParam, response: OkResponse, description: "Remove favorite" }),
  "me.alerts.list": def({ method: "GET", path: "/me/alerts", auth: "user", query: PaginationQuery, response: PriceAlertListResponse, description: "List price alerts" }),
  "me.alerts.create": def({ method: "POST", path: "/me/alerts", auth: "user", body: CreatePriceAlertRequest, response: PriceAlert, description: "Create alert" }),
  "me.alerts.update": def({ method: "PATCH", path: "/me/alerts/:id", auth: "user", params: IdParam, body: UpdatePriceAlertRequest, response: PriceAlert, description: "Update alert" }),
  "me.alerts.delete": def({ method: "DELETE", path: "/me/alerts/:id", auth: "user", params: IdParam, response: OkResponse, description: "Delete alert" }),
  "me.lists.list": def({ method: "GET", path: "/me/lists", auth: "user", response: ShoppingListsResponse, description: "List shopping lists" }),
  "me.lists.create": def({ method: "POST", path: "/me/lists", auth: "user", body: CreateShoppingListRequest, response: ShoppingListDetail, description: "Create list" }),
  "me.lists.get": def({ method: "GET", path: "/me/lists/:id", auth: "user", params: IdParam, response: ShoppingListDetail, description: "List detail" }),
  "me.lists.update": def({ method: "PATCH", path: "/me/lists/:id", auth: "user", params: IdParam, body: UpdateShoppingListRequest, response: ShoppingListDetail, description: "Rename/visibility" }),
  "me.lists.delete": def({ method: "DELETE", path: "/me/lists/:id", auth: "user", params: IdParam, response: OkResponse, description: "Delete list" }),
  "me.lists.addItem": def({ method: "POST", path: "/me/lists/:id/items", auth: "user", params: IdParam, body: AddShoppingListItemRequest, response: ShoppingListDetail, description: "Add item" }),
  "me.lists.updateItem": def({ method: "PATCH", path: "/me/lists/:id/items/:itemId", auth: "user", params: ListIdParams, body: UpdateShoppingListItemRequest, response: ShoppingListDetail, description: "Update item" }),
  "me.lists.removeItem": def({ method: "DELETE", path: "/me/lists/:id/items/:itemId", auth: "user", params: ListIdParams, response: ShoppingListDetail, description: "Remove item" }),
  "me.recentlyViewed": def({ method: "GET", path: "/me/recently-viewed", auth: "user", response: RecentlyViewedResponse, description: "Recently viewed products" }),
  "me.preferences.get": def({ method: "GET", path: "/me/preferences", auth: "user", response: PreferencesResponse, description: "Get preferences" }),
  "me.preferences.update": def({ method: "PATCH", path: "/me/preferences", auth: "user", body: UpdatePreferencesRequest, response: PreferencesResponse, description: "Update preferences" }),
  "me.devices.register": def({ method: "POST", path: "/me/devices", auth: "user", body: RegisterDeviceRequest, response: DeviceResponse, description: "Register/refresh an Expo push token" }),
  "me.devices.delete": def({ method: "DELETE", path: "/me/devices/:token", auth: "user", params: DeviceTokenParam, response: OkResponse, description: "Unregister a push token" }),
  "me.export": def({ method: "GET", path: "/me/export", auth: "user", response: DataExportResponse, description: "Data export (JSON)" }),
  "me.delete": def({ method: "DELETE", path: "/me", auth: "user", body: DeleteAccountRequest, response: OkResponse, description: "Delete account" }),

  /* Basket */
  "basket.optimize": def({ method: "POST", path: "/basket/optimize", auth: "optional", body: BasketOptimizeRequest, response: BasketOptimizeResponse, description: "Smart basket scenarios" }),

  /* Outbound */
  "go.offer": def({ method: "GET", path: "/go/:offerId", auth: "optional", params: GoParams, query: GoQuery, response: null, description: "Log click, 302 to allow-listed retailer URL" }),

  /* Travel */
  "travel.airports": def({ method: "GET", path: "/travel/airports", auth: "public", query: AirportSearchQuery, response: AirportSearchResponse, description: "Airport autocomplete" }),
  "travel.flights": def({ method: "GET", path: "/travel/flights/search", auth: "public", query: FlightSearchQuery, response: FlightSearchResponse, description: "Flight search across providers" }),
  "travel.hotels": def({ method: "GET", path: "/travel/hotels/search", auth: "public", query: HotelSearchQuery, response: HotelSearchResponse, description: "Hotel search" }),
  "travel.hotel": def({ method: "GET", path: "/travel/hotels/:id", auth: "public", params: IdParam, query: HotelDetailQuery, response: HotelDetailResponse, description: "Hotel detail + rates" }),
  "travel.go": def({ method: "GET", path: "/travel/go/:type/:id", auth: "optional", params: TravelGoParams, response: null, description: "Affiliate redirect" }),

  /* Scan / AI / Health */
  "scan.lookup": def({ method: "GET", path: "/scan/:code", auth: "public", params: CodeParam, response: ScanResponse, description: "Barcode lookup" }),
  "assistant.ask": def({ method: "POST", path: "/assistant", auth: "optional", body: AssistantRequest, response: AssistantResponse, description: "Grounded shopping assistant (503 when disabled)" }),
  "health.get": def({ method: "GET", path: "/health", auth: "public", response: HealthResponse, description: "Service health" }),

  /* Admin */
  "admin.stats": def({ method: "GET", path: "/admin/stats", auth: "staff", query: AdminStatsQuery, response: AdminStatsResponse, description: "KPI dashboard" }),
  "admin.users.list": def({ method: "GET", path: "/admin/users", auth: "admin", query: AdminListQuery, response: AdminUserListResponse, description: "Users" }),
  "admin.users.update": def({ method: "PATCH", path: "/admin/users/:id", auth: "admin", params: IdParam, body: AdminUpdateUserRequest, response: AdminUserListResponse.shape.items.element, description: "Update user role/status" }),
  "admin.products.list": def({ method: "GET", path: "/admin/products", auth: "staff", query: AdminListQuery, response: AdminProductListResponse, description: "Products" }),
  "admin.products.create": def({ method: "POST", path: "/admin/products", auth: "staff", body: AdminUpsertProductRequest, response: AdminProductListResponse.shape.items.element, description: "Create product (EDITOR+)" }),
  "admin.products.update": def({ method: "PATCH", path: "/admin/products/:id", auth: "staff", params: IdParam, body: AdminUpsertProductRequest.partial(), response: AdminProductListResponse.shape.items.element, description: "Update product (EDITOR+)" }),
  "admin.categories.create": def({ method: "POST", path: "/admin/categories", auth: "staff", body: AdminUpsertCategoryRequest, response: OkResponse, description: "Create category" }),
  "admin.categories.update": def({ method: "PATCH", path: "/admin/categories/:id", auth: "staff", params: IdParam, body: AdminUpsertCategoryRequest.partial(), response: OkResponse, description: "Update category" }),
  "admin.retailers.list": def({ method: "GET", path: "/admin/retailers", auth: "staff", query: AdminListQuery, response: AdminRetailerListResponse, description: "Retailers + integration status" }),
  "admin.retailers.update": def({ method: "PATCH", path: "/admin/retailers/:id", auth: "admin", params: IdParam, body: AdminUpdateRetailerRequest, response: AdminRetailerListResponse.shape.items.element, description: "Update retailer" }),
  "admin.offers.list": def({ method: "GET", path: "/admin/offers", auth: "staff", query: AdminOfferListQuery, response: AdminOfferListResponse, description: "Offers" }),
  "admin.matches.list": def({ method: "GET", path: "/admin/matches", auth: "staff", query: AdminMatchListQuery, response: AdminMatchListResponse, description: "Match review queue" }),
  "admin.matches.review": def({ method: "POST", path: "/admin/matches/:id/review", auth: "staff", params: IdParam, body: AdminReviewMatchRequest, response: OkResponse, description: "Approve/reject match" }),
  "admin.anomalies.list": def({ method: "GET", path: "/admin/anomalies", auth: "staff", query: AdminAnomalyListQuery, response: AdminAnomalyListResponse, description: "Price/data anomalies" }),
  "admin.anomalies.resolve": def({ method: "POST", path: "/admin/anomalies/:id/resolve", auth: "staff", params: IdParam, body: AdminResolveAnomalyRequest, response: OkResponse, description: "Resolve anomaly (EDITOR+)" }),
  "admin.offers.update": def({ method: "PATCH", path: "/admin/offers/:id", auth: "staff", params: IdParam, body: AdminUpdateOfferRequest, response: OkResponse, description: "Hide/show an offer (EDITOR+)" }),
  "admin.products.get": def({ method: "GET", path: "/admin/products/:id", auth: "staff", params: IdParam, response: AdminProductDetail, description: "Product detail for editing" }),
  "admin.categories.list": def({ method: "GET", path: "/admin/categories", auth: "staff", response: AdminCategoryListResponse, description: "All categories incl. inactive" }),
  "admin.brands.list": def({ method: "GET", path: "/admin/brands", auth: "staff", query: AdminListQuery, response: AdminBrandListResponse, description: "Brands" }),
  "admin.brands.create": def({ method: "POST", path: "/admin/brands", auth: "staff", body: AdminUpsertBrandRequest, response: AdminBrandListResponse.shape.items.element, description: "Create brand (EDITOR+)" }),
  "admin.brands.update": def({ method: "PATCH", path: "/admin/brands/:id", auth: "staff", params: IdParam, body: AdminUpsertBrandRequest.partial(), response: AdminBrandListResponse.shape.items.element, description: "Update brand (EDITOR+)" }),
  "admin.flags.list": def({ method: "GET", path: "/admin/flags", auth: "staff", response: FeatureFlagListResponse, description: "Feature flags" }),
  "admin.flags.update": def({ method: "PATCH", path: "/admin/flags/:key", auth: "admin", params: KeyParam, body: UpdateFeatureFlagRequest, response: FeatureFlagListResponse.shape.items.element, description: "Toggle flag" }),
  "admin.auditLogs.list": def({ method: "GET", path: "/admin/audit-logs", auth: "admin", query: AdminListQuery, response: AuditLogListResponse, description: "Audit log" }),

  "admin.retailers.logo.upload": def({ method: "POST", path: "/admin/retailers/:id/logo", auth: "staff", params: IdParam, body: AdminLogoUploadRequest, multipart: true, response: AdminLogoResponse, description: "Upload store logo (EDITOR+; multipart `file`, ≤512 KB, PNG/WebP/ICO/SVG)" }),
  "admin.retailers.logo.delete": def({ method: "DELETE", path: "/admin/retailers/:id/logo", auth: "staff", params: IdParam, response: AdminLogoResponse, description: "Remove store logo (EDITOR+)" }),
  "admin.brands.logo.upload": def({ method: "POST", path: "/admin/brands/:id/logo", auth: "staff", params: IdParam, body: AdminLogoUploadRequest, multipart: true, response: AdminLogoResponse, description: "Upload brand logo (EDITOR+; multipart `file`, ≤512 KB)" }),
  "admin.brands.logo.delete": def({ method: "DELETE", path: "/admin/brands/:id/logo", auth: "staff", params: IdParam, response: AdminLogoResponse, description: "Remove brand logo (EDITOR+)" }),
  "admin.integrations.list": def({ method: "GET", path: "/admin/integrations", auth: "admin", response: AdminIntegrationListResponse, description: "All external integrations: status + masked credentials" }),
  "admin.integrations.get": def({ method: "GET", path: "/admin/integrations/:id", auth: "admin", params: IntegrationIdParam, response: AdminIntegration, description: "One integration" }),
  "admin.integrations.update": def({ method: "PUT", path: "/admin/integrations/:id", auth: "admin", params: IntegrationIdParam, body: AdminUpdateIntegrationRequest, response: AdminIntegration, description: "Store credentials (\"\" keep, null clear) / enable-disable" }),
  "admin.integrations.test": def({ method: "POST", path: "/admin/integrations/:id/test", auth: "admin", params: IntegrationIdParam, response: AdminIntegrationTestResponse, description: "Run a live credential/connectivity check" }),
  "admin.integrations.clear": def({ method: "DELETE", path: "/admin/integrations/:id", auth: "admin", params: IntegrationIdParam, response: OkResponse, description: "Delete stored credentials (env fallback applies)" }),
  "admin.openapi": def({ method: "GET", path: "/admin/openapi.json", auth: "staff", response: z.record(z.string(), z.unknown()), description: "Full OpenAPI 3.1 spec (available in production)" }),

  "admin.coupons.list": def({ method: "GET", path: "/admin/coupons", auth: "staff", query: AdminCouponListQuery, response: AdminCouponListResponse, description: "Coupons (filter status=reported / pending_approval)" }),
  "admin.coupons.create": def({ method: "POST", path: "/admin/coupons", auth: "staff", body: AdminCreateCouponRequest, response: AdminCoupon, description: "Create coupon (EDITOR+)" }),
  "admin.coupons.update": def({ method: "PATCH", path: "/admin/coupons/:id", auth: "staff", params: IdParam, body: AdminUpdateCouponRequest, response: AdminCoupon, description: "Edit / change status / approve (EDITOR+)" }),
  "admin.coupons.delete": def({ method: "DELETE", path: "/admin/coupons/:id", auth: "staff", params: IdParam, response: OkResponse, description: "Delete coupon (EDITOR+)" }),
  "admin.checkoutConfigs.list": def({ method: "GET", path: "/admin/checkout-configs", auth: "staff", response: AdminCheckoutConfigListResponse, description: "Extension checkout configs" }),
  "admin.checkoutConfigs.upsert": def({ method: "PUT", path: "/admin/checkout-configs/:id", auth: "staff", params: IdParam, body: AdminUpsertCheckoutConfigRequest, response: AdminCheckoutConfig, description: "Create/update config for retailer :id (EDITOR+; bumps version)" }),

  /* Merchant */
  "merchant.profile.get": def({ method: "GET", path: "/merchant/profile", auth: "merchant", response: MerchantProfile, description: "Merchant profile" }),
  "merchant.profile.update": def({ method: "PATCH", path: "/merchant/profile", auth: "merchant", body: UpdateMerchantProfileRequest, response: MerchantProfile, description: "Update profile" }),
  "merchant.feeds.list": def({ method: "GET", path: "/merchant/feeds", auth: "merchant", query: PaginationQuery, response: MerchantFeedListResponse, description: "Feed uploads" }),
  "merchant.feeds.upload": def({ method: "POST", path: "/merchant/feeds", auth: "merchant", body: MerchantFeedUploadRequest, response: MerchantFeed, multipart: true, description: "Upload CSV/XML feed (multipart, field `file`)" }),
  "merchant.offers.list": def({ method: "GET", path: "/merchant/offers", auth: "merchant", query: MerchantOfferListQuery, response: MerchantOfferListResponse, description: "Merchant offers" }),
  "merchant.offers.update": def({ method: "PATCH", path: "/merchant/offers/:id", auth: "merchant", params: IdParam, body: UpdateMerchantOfferRequest, response: MerchantOfferListResponse.shape.items.element, description: "Update price/stock" }),
  "merchant.analytics": def({ method: "GET", path: "/merchant/analytics", auth: "merchant", query: z.object({ range: z.enum(["7d", "30d", "90d"]).default("30d") }), response: MerchantAnalyticsResponse, description: "Clicks/impressions" }),
  "merchant.coupons.list": def({ method: "GET", path: "/merchant/coupons", auth: "merchant", query: PaginationQuery, response: AdminCouponListResponse, description: "My store's coupons" }),
  "merchant.coupons.create": def({ method: "POST", path: "/merchant/coupons", auth: "merchant", body: MerchantCreateCouponRequest, response: AdminCoupon, description: "Submit coupon for my store (pending admin approval)" }),
  "merchant.apiKeys.list": def({ method: "GET", path: "/merchant/api-keys", auth: "merchant", response: ApiKeyListResponse, description: "API keys" }),
  "merchant.apiKeys.create": def({ method: "POST", path: "/merchant/api-keys", auth: "merchant", body: CreateApiKeyRequest, response: CreateApiKeyResponse, description: "Create key (secret shown once)" }),
  "merchant.apiKeys.revoke": def({ method: "DELETE", path: "/merchant/api-keys/:id", auth: "merchant", params: IdParam, response: OkResponse, description: "Revoke key" }),
} as const satisfies Record<string, EndpointDef>;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

type InferOr<T, F> = T extends z.ZodTypeAny ? z.infer<T> : F;
type InputOr<T, F> = T extends z.ZodTypeAny ? z.input<T> : F;

export type EndpointResponse<N extends EndpointName> = InferOr<Endpoints[N]["response"], void>;
export type EndpointBody<N extends EndpointName> = Endpoints[N] extends { body: infer B } ? InputOr<B, never> : never;
export type EndpointQuery<N extends EndpointName> = Endpoints[N] extends { query: infer Q } ? InputOr<Q, never> : never;
export type EndpointParams<N extends EndpointName> = Endpoints[N] extends { params: infer P } ? InputOr<P, never> : never;

export const API_VERSION_PREFIX = "/v1";
