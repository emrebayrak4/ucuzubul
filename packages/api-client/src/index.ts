import type {
  EndpointBody,
  EndpointName,
  EndpointParams,
  EndpointQuery,
  EndpointResponse,
} from "@pricora/contracts";
import { createApiCore, type ApiClientOptions, type ApiCore } from "./core";

export { ApiError, buildQueryString, createApiCore, fillPath } from "./core";
export type { ApiClientOptions, ApiCore, RequestInput } from "./core";

type Opts = { signal?: AbortSignal; headers?: Record<string, string> };

/** Builds a client with one function per endpoint, grouped by area. */
export function createApiClient(options: ApiClientOptions) {
  const core: ApiCore = createApiCore(options);
  const r = core.request;

  // Small typed helpers (cast once here; call sites stay fully typed).
  const noArgs =
    <N extends EndpointName>(n: N) =>
    (o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { ...o } as never);
  const withQuery =
    <N extends EndpointName>(n: N) =>
    (query?: EndpointQuery<N>, o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { query, ...o } as never);
  const withBody =
    <N extends EndpointName>(n: N) =>
    (body: EndpointBody<N>, o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { body, ...o } as never);
  const withParams =
    <N extends EndpointName>(n: N) =>
    (params: EndpointParams<N>, o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { params, ...o } as never);
  const withParamsQuery =
    <N extends EndpointName>(n: N) =>
    (params: EndpointParams<N>, query?: EndpointQuery<N>, o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { params, query, ...o } as never);
  const withParamsBody =
    <N extends EndpointName>(n: N) =>
    (params: EndpointParams<N>, body: EndpointBody<N>, o?: Opts): Promise<EndpointResponse<N>> =>
      r(n, { params, body, ...o } as never);

  const id = (v: string) => ({ id: v });
  const slug = (v: string) => ({ slug: v });

  return {
    core,
    request: core.request,
    url: core.url,
    setCsrfToken: core.setCsrfToken,

    auth: {
      register: withBody("auth.register"),
      login: withBody("auth.login"),
      logout: noArgs("auth.logout"),
      me: noArgs("auth.me"),
      forgotPassword: withBody("auth.forgotPassword"),
      resetPassword: withBody("auth.resetPassword"),
      /** Absolute URL to start OAuth (navigate the browser to it). */
      oauthUrl: (provider: "google" | "apple", returnTo?: string) =>
        core.url("auth.oauthStart", { params: { provider }, query: { returnTo } }),
    },

    catalog: {
      categories: noArgs("catalog.categories"),
      category: (s: string, o?: Opts) => withParams("catalog.category")(slug(s), o),
      brand: (s: string, o?: Opts) => withParams("catalog.brand")(slug(s), o),
      retailers: noArgs("catalog.retailers"),
      retailer: (s: string, o?: Opts) => withParams("catalog.retailer")(slug(s), o),
      product: (s: string, query?: EndpointQuery<"catalog.product">, o?: Opts) =>
        withParamsQuery("catalog.product")(slug(s), query, o),
      productHistory: (s: string, query?: EndpointQuery<"catalog.productHistory">, o?: Opts) =>
        withParamsQuery("catalog.productHistory")(slug(s), query, o),
      compare: (ids: string[], o?: Opts) => withQuery("catalog.compare")({ ids: ids.join(",") }, o),
      home: noArgs("catalog.home"),
      deals: withQuery("catalog.deals"),
      priceDrops: withQuery("catalog.priceDrops"),
      /** Absolute outbound URL for an offer (use as <a href>, never fetch). */
      goUrl: (offerId: string, placement?: string) => core.url("go.offer", { params: { offerId }, query: { placement } }),
    },

    coupons: {
      list: withQuery("coupons.list"),
      get: (couponId: string, o?: Opts) => withParams("coupons.get")(id(couponId), o),
      forRetailer: (retailerSlug: string, query?: EndpointQuery<"coupons.retailer">, o?: Opts) =>
        withParamsQuery("coupons.retailer")(slug(retailerSlug), query, o),
      retailerStats: (retailerSlug: string, o?: Opts) => withParams("coupons.retailerStats")(slug(retailerSlug), o),
      submit: withBody("coupons.submit"),
      reportResult: (couponId: string, body: EndpointBody<"coupons.result">, o?: Opts) => withParamsBody("coupons.result")(id(couponId), body, o),
      vote: (couponId: string, worked: boolean, o?: Opts) => withParamsBody("coupons.vote")(id(couponId), { worked }, o),
      /** Absolute outbound URL (use as <a href>, never fetch). */
      goUrl: (couponId: string) => core.url("coupons.go", { params: { id: couponId } }),
    },

    extension: {
      config: noArgs("extension.config"),
      coupons: (host: string, o?: Opts) => withQuery("extension.coupons")({ host }, o),
      product: (url: string, o?: Opts) => withQuery("extension.product")({ url }, o),
    },

    search: {
      search: withQuery("search.search"),
      suggest: (q: string, o?: Opts) => withQuery("search.suggest")({ q }, o),
      trending: noArgs("search.trending"),
    },

    me: {
      favorites: {
        list: withQuery("me.favorites.list"),
        add: (productId: string, o?: Opts) => withBody("me.favorites.create")({ productId }, o),
        remove: (favoriteId: string, o?: Opts) => withParams("me.favorites.delete")(id(favoriteId), o),
      },
      alerts: {
        list: withQuery("me.alerts.list"),
        create: withBody("me.alerts.create"),
        update: (alertId: string, body: EndpointBody<"me.alerts.update">, o?: Opts) =>
          withParamsBody("me.alerts.update")(id(alertId), body, o),
        remove: (alertId: string, o?: Opts) => withParams("me.alerts.delete")(id(alertId), o),
      },
      lists: {
        list: noArgs("me.lists.list"),
        create: withBody("me.lists.create"),
        get: (listId: string, o?: Opts) => withParams("me.lists.get")(id(listId), o),
        update: (listId: string, body: EndpointBody<"me.lists.update">, o?: Opts) =>
          withParamsBody("me.lists.update")(id(listId), body, o),
        remove: (listId: string, o?: Opts) => withParams("me.lists.delete")(id(listId), o),
        addItem: (listId: string, body: EndpointBody<"me.lists.addItem">, o?: Opts) =>
          withParamsBody("me.lists.addItem")(id(listId), body, o),
        updateItem: (listId: string, itemId: string, body: EndpointBody<"me.lists.updateItem">, o?: Opts) =>
          withParamsBody("me.lists.updateItem")({ id: listId, itemId }, body, o),
        removeItem: (listId: string, itemId: string, o?: Opts) =>
          withParams("me.lists.removeItem")({ id: listId, itemId }, o),
      },
      devices: {
        register: withBody("me.devices.register"),
        remove: (token: string, o?: Opts) => withParams("me.devices.delete")({ token }, o),
      },
      couponFollows: {
        list: noArgs("me.couponFollows.list"),
        follow: (retailerSlug: string, o?: Opts) => withBody("me.couponFollows.create")({ retailerSlug }, o),
        unfollow: (retailerSlug: string, o?: Opts) => withParams("me.couponFollows.delete")({ retailerSlug }, o),
      },
      recentlyViewed: noArgs("me.recentlyViewed"),
      preferences: noArgs("me.preferences.get"),
      updatePreferences: withBody("me.preferences.update"),
      exportData: noArgs("me.export"),
      deleteAccount: withBody("me.delete"),
      consent: noArgs("privacy.consent.get"),
      updateConsent: withBody("privacy.consent.update"),
    },

    geo: {
      zipNear: (lat: number, lng: number, o?: Opts) => withQuery("geo.zip.nearest")({ lat, lng }, o),
      zipResolve: noArgs("geo.zip.resolve"),
    },

    privacy: {
      createRequest: withBody("privacy.requests.create"),
      verifyRequest: (token: string, o?: Opts) => withQuery("privacy.requests.verify")({ token }, o),
    },

    basket: {
      optimize: withBody("basket.optimize"),
    },

    travel: {
      guides: withQuery("travel.guides"),
      guide: (guideSlug: string, o?: Opts) => withParams("travel.guide")(slug(guideSlug), o),
      places: (q: string, opts?: { types?: string; limit?: number }, o?: Opts) => withQuery("travel.places")({ q, ...opts }, o),
      airports: (q: string, o?: Opts) => withQuery("travel.airports")({ q }, o),
      flights: (query: EndpointQuery<"travel.flights">, o?: Opts) => withQuery("travel.flights")(query, o),
      flightCalendar: (query: EndpointQuery<"travel.flightCalendar">, o?: Opts) => withQuery("travel.flightCalendar")(query, o),
      flightExplore: (query: EndpointQuery<"travel.flightExplore">, o?: Opts) => withQuery("travel.flightExplore")(query, o),
      flightAlerts: {
        list: (query?: EndpointQuery<"travel.flightAlerts.list">, o?: Opts) => withQuery("travel.flightAlerts.list")(query ?? {}, o),
        create: withBody("travel.flightAlerts.create"),
        remove: (alertId: string, o?: Opts) => withParams("travel.flightAlerts.delete")(id(alertId), o),
      },
      hotels: (query: EndpointQuery<"travel.hotels">, o?: Opts) => withQuery("travel.hotels")(query, o),
      hotel: (hotelId: string, query?: EndpointQuery<"travel.hotel">, o?: Opts) =>
        withParamsQuery("travel.hotel")(id(hotelId), query, o),
      hotelDeals: (query?: EndpointQuery<"travel.hotelDeals">, o?: Opts) => withQuery("travel.hotelDeals")(query ?? {}, o),
      hotelDestinations: noArgs("travel.hotelDestinations"),
      goUrl: (type: "flight" | "hotel", itemId: string) => core.url("travel.go", { params: { type, id: itemId } }),
    },

    scan: {
      lookup: (code: string, o?: Opts) => withParams("scan.lookup")({ code }, o),
    },

    assistant: {
      ask: withBody("assistant.ask"),
    },

    health: noArgs("health.get"),

    admin: {
      stats: withQuery("admin.stats"),
      users: {
        list: withQuery("admin.users.list"),
        update: (userId: string, body: EndpointBody<"admin.users.update">, o?: Opts) =>
          withParamsBody("admin.users.update")(id(userId), body, o),
      },
      products: {
        list: withQuery("admin.products.list"),
        get: (productId: string, o?: Opts) => withParams("admin.products.get")(id(productId), o),
        create: withBody("admin.products.create"),
        update: (productId: string, body: EndpointBody<"admin.products.update">, o?: Opts) =>
          withParamsBody("admin.products.update")(id(productId), body, o),
      },
      brands: {
        list: withQuery("admin.brands.list"),
        create: withBody("admin.brands.create"),
        update: (brandId: string, body: EndpointBody<"admin.brands.update">, o?: Opts) =>
          withParamsBody("admin.brands.update")(id(brandId), body, o),
        /** FormData with field `file`. */
        uploadLogo: (brandId: string, form: FormData, o?: Opts) => r("admin.brands.logo.upload", { params: id(brandId), body: form, ...o }),
        deleteLogo: (brandId: string, o?: Opts) => withParams("admin.brands.logo.delete")(id(brandId), o),
      },
      categories: {
        list: noArgs("admin.categories.list"),
        create: withBody("admin.categories.create"),
        update: (categoryId: string, body: EndpointBody<"admin.categories.update">, o?: Opts) =>
          withParamsBody("admin.categories.update")(id(categoryId), body, o),
      },
      retailers: {
        list: withQuery("admin.retailers.list"),
        update: (retailerId: string, body: EndpointBody<"admin.retailers.update">, o?: Opts) =>
          withParamsBody("admin.retailers.update")(id(retailerId), body, o),
        /** FormData with field `file`. */
        uploadLogo: (retailerId: string, form: FormData, o?: Opts) => r("admin.retailers.logo.upload", { params: id(retailerId), body: form, ...o }),
        deleteLogo: (retailerId: string, o?: Opts) => withParams("admin.retailers.logo.delete")(id(retailerId), o),
      },
      offers: {
        list: withQuery("admin.offers.list"),
        update: (offerId: string, body: EndpointBody<"admin.offers.update">, o?: Opts) =>
          withParamsBody("admin.offers.update")(id(offerId), body, o),
      },
      matches: {
        list: withQuery("admin.matches.list"),
        review: (matchId: string, body: EndpointBody<"admin.matches.review">, o?: Opts) =>
          withParamsBody("admin.matches.review")(id(matchId), body, o),
      },
      anomalies: {
        list: withQuery("admin.anomalies.list"),
        resolve: (anomalyId: string, body: EndpointBody<"admin.anomalies.resolve"> = {}, o?: Opts) =>
          withParamsBody("admin.anomalies.resolve")(id(anomalyId), body, o),
      },
      flags: {
        list: noArgs("admin.flags.list"),
        update: (key: string, body: EndpointBody<"admin.flags.update">, o?: Opts) =>
          withParamsBody("admin.flags.update")({ key }, body, o),
      },
      auditLogs: { list: withQuery("admin.auditLogs.list") },
      integrations: {
        list: noArgs("admin.integrations.list"),
        get: (integrationId: string, o?: Opts) => withParams("admin.integrations.get")(id(integrationId), o),
        update: (integrationId: string, body: EndpointBody<"admin.integrations.update">, o?: Opts) =>
          withParamsBody("admin.integrations.update")(id(integrationId), body, o),
        test: (integrationId: string, o?: Opts) => withParams("admin.integrations.test")(id(integrationId), o),
        clear: (integrationId: string, o?: Opts) => withParams("admin.integrations.clear")(id(integrationId), o),
      },
      openapi: noArgs("admin.openapi"),
      guides: {
        list: withQuery("admin.guides.list"),
        get: (guideId: string, o?: Opts) => withParams("admin.guides.get")(id(guideId), o),
        create: withBody("admin.guides.create"),
        update: (guideId: string, body: EndpointBody<"admin.guides.update">, o?: Opts) => withParamsBody("admin.guides.update")(id(guideId), body, o),
        remove: (guideId: string, o?: Opts) => withParams("admin.guides.delete")(id(guideId), o),
      },
      coupons: {
        list: withQuery("admin.coupons.list"),
        create: withBody("admin.coupons.create"),
        update: (couponId: string, body: EndpointBody<"admin.coupons.update">, o?: Opts) => withParamsBody("admin.coupons.update")(id(couponId), body, o),
        remove: (couponId: string, o?: Opts) => withParams("admin.coupons.delete")(id(couponId), o),
      },
      checkoutConfigs: {
        list: noArgs("admin.checkoutConfigs.list"),
        /** :id is the retailer id. */
        upsert: (retailerId: string, body: EndpointBody<"admin.checkoutConfigs.upsert">, o?: Opts) =>
          withParamsBody("admin.checkoutConfigs.upsert")(id(retailerId), body, o),
      },
    },

    merchant: {
      profile: noArgs("merchant.profile.get"),
      updateProfile: withBody("merchant.profile.update"),
      feeds: {
        list: withQuery("merchant.feeds.list"),
        /** Multipart upload: FormData with `file`, `name`, `format`. */
        upload: (form: FormData, o?: Opts) => r("merchant.feeds.upload", { body: form, ...o }),
      },
      offers: {
        list: withQuery("merchant.offers.list"),
        update: (offerId: string, body: EndpointBody<"merchant.offers.update">, o?: Opts) =>
          withParamsBody("merchant.offers.update")(id(offerId), body, o),
      },
      analytics: withQuery("merchant.analytics"),
      coupons: {
        list: withQuery("merchant.coupons.list"),
        create: withBody("merchant.coupons.create"),
      },
      apiKeys: {
        list: noArgs("merchant.apiKeys.list"),
        create: withBody("merchant.apiKeys.create"),
        revoke: (keyId: string, o?: Opts) => withParams("merchant.apiKeys.revoke")(id(keyId), o),
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
