/**
 * Background logic, independent of chrome.* so it can be unit-tested. index.ts wires it to the browser.
 *
 * Privacy invariants:
 *  - the API is only called for hosts of supported retailers (built-in list, or admin config host patterns);
 *  - product URLs are reduced to origin + path (+ the one id parameter a retailer needs) before leaving the browser;
 *  - per-page data (product lookups, per-store coupons) is cached in memory-backed session storage, never on disk.
 */
import { parseProductUrl } from "@pricora/algorithms";
import { ApiRequestError, type PricoraApi } from "./api";
import { TTL, TtlCache, type KeyValueArea } from "../shared/cache";
import { badgeCount, DEFAULT_MAX_CODES, HARD_MAX_CODES, orderCouponsForCheckout, orderCouponsForDisplay } from "../shared/coupons";
import { apiUrl, BRAND_NAME } from "../shared/env";
import type { CheckoutMatch, OkResult, PopupState, ProductLookupResult, StoreInfo } from "../shared/messages";
import { DEFAULT_SETTINGS, normalizeSettings, SETTINGS_KEY, type ExtensionSettings } from "../shared/settings";
import type { NormalizedCoupons, RetailerCheckoutConfig, SessionUser } from "../shared/types";
import { findBuiltInRetailer, hostMatchesPattern, hostOf, urlMatchesAnyPattern } from "../shared/urlMatching";

export interface BackgroundDeps {
  api: PricoraApi;
  /** Persistent area (chrome.storage.local): settings + extension config cache. */
  local: KeyValueArea;
  /** Memory-only area (chrome.storage.session): coupons + product lookups. */
  session: KeyValueArea;
  now?: () => number;
}

/** Query parameters some retailers need to identify a product; everything else (tracking, sessions) is dropped. */
const ID_PARAMS = ["skuId", "preselect", "Item", "item"];

/** origin + pathname + id params only. */
export function minimizeProductUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const out = new URL(u.origin + u.pathname);
    for (const p of ID_PARAMS) {
      const v = u.searchParams.get(p);
      if (v) out.searchParams.set(p, v);
    }
    return out.toString();
  } catch {
    return null;
  }
}

const INSTALL_ID_KEY = "installId";

export function createBackground(deps: BackgroundDeps) {
  const now = deps.now ?? Date.now;
  const localCache = new TtlCache(deps.local, now);
  const sessionCache = new TtlCache(deps.session, now);

  /** Random per-install id sent with anonymous coupon reports so the API can drop duplicates (hashed server-side). */
  async function installId(): Promise<string> {
    const got = await deps.local.get(INSTALL_ID_KEY);
    const existing = got[INSTALL_ID_KEY];
    if (typeof existing === "string" && existing.length >= 8) return existing;
    const id = crypto.randomUUID();
    await deps.local.set({ [INSTALL_ID_KEY]: id });
    return id;
  }

  async function getSettings(): Promise<ExtensionSettings> {
    const got = await deps.local.get(SETTINGS_KEY);
    return normalizeSettings(got[SETTINGS_KEY] ?? DEFAULT_SETTINGS);
  }

  async function setSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const next = normalizeSettings({ ...(await getSettings()), ...patch });
    await deps.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  /** Admin-managed checkout configs, cached 24 h (stale-if-error, empty list if never loaded). */
  async function getConfigs(): Promise<RetailerCheckoutConfig[]> {
    try {
      return (await localCache.getOrLoad("config", TTL.config, () => deps.api.extensionConfig())).data;
    } catch {
      return [];
    }
  }

  function configForHost(configs: RetailerCheckoutConfig[], host: string): RetailerCheckoutConfig | null {
    return configs.find((c) => c.hostPatterns.some((p) => hostMatchesPattern(host, p))) ?? null;
  }

  /** The store a host belongs to, or null when the host is not a supported retailer. */
  async function storeForHost(host: string | null): Promise<{ key: string; slug: string; name: string; config: RetailerCheckoutConfig | null } | null> {
    if (!host) return null;
    const builtIn = findBuiltInRetailer(host);
    const configs = await getConfigs();
    const config = configForHost(configs, host);
    if (builtIn) return { key: builtIn.domain, slug: config?.retailerSlug ?? builtIn.slug, name: config?.retailerName ?? builtIn.name, config };
    if (config) return { key: host, slug: config.retailerSlug ?? "", name: config.retailerName ?? host, config };
    return null;
  }

  /** Per-store coupons, cached 1 h in session storage. `host` is the store key (registrable domain for built-ins). */
  async function getCoupons(storeKey: string): Promise<NormalizedCoupons> {
    return (await sessionCache.getOrLoad(`coupons:${storeKey}`, TTL.coupons, () => deps.api.coupons(storeKey))).data;
  }

  async function popupState(url: string | null): Promise<PopupState> {
    const settings = await getSettings();
    const store = await storeForHost(hostOf(url));
    if (!store) return { kind: "unsupported", settings };
    let coupons: NormalizedCoupons = { retailer: null, coupons: [] };
    let couponsError: string | null = null;
    if (settings.couponFinder) {
      try {
        coupons = await getCoupons(store.key);
      } catch (err) {
        couponsError = err instanceof ApiRequestError && err.status === 404 ? "Coupons aren't available for this store yet." : "Couldn't load coupons. Try again later.";
      }
    }
    const user: SessionUser | null = await deps.api
      .me()
      .then((r) => r.user)
      .catch(() => null);
    const info: StoreInfo = {
      slug: coupons.retailer?.slug ?? store.slug,
      name: coupons.retailer?.name ?? store.name,
      retailer: coupons.retailer,
    };
    return {
      kind: "store",
      settings,
      store: info,
      coupons: orderCouponsForDisplay(coupons.coupons, now()),
      couponsError,
      user,
      checkoutSupported: !!store.config?.enabled,
    };
  }

  async function follow(retailerSlug: string): Promise<OkResult> {
    try {
      await deps.api.followStore(retailerSlug);
      return { ok: true };
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return { ok: false, error: `Log in on ${BRAND_NAME} to follow stores.` };
      if (err instanceof ApiRequestError && err.status === 404) return { ok: false, error: "Following stores isn't available yet." };
      return { ok: false, error: "Couldn't follow this store. Try again later." };
    }
  }

  async function productLookup(url: string): Promise<ProductLookupResult> {
    const settings = await getSettings();
    if (!settings.priceComparison) return { kind: "none" };
    const host = hostOf(url);
    if (!host || !findBuiltInRetailer(host)) return { kind: "none" };
    const parsed = parseProductUrl(url);
    if (!parsed || !parsed.id) return { kind: "none" }; // only real product pages
    const minimal = minimizeProductUrl(url);
    if (!minimal) return { kind: "none" };
    let res;
    try {
      res = (await sessionCache.getOrLoad(`product:${minimal}`, TTL.product, () => deps.api.product(minimal))).data;
    } catch {
      return { kind: "none" };
    }
    const cheapest = res.cheapest;
    if (!res.matched || !cheapest) return { kind: "none" };
    if (res.current && cheapest.estimatedTotalCents >= res.current.estimatedTotalCents) return { kind: "none" };
    const base = (cheapest.goUrl && apiUrl(cheapest.goUrl)) || apiUrl(`/v1/go/${encodeURIComponent(cheapest.offerId)}`);
    if (!base) return { kind: "none" };
    const go = new URL(base);
    if (!go.pathname.startsWith("/v1/go/")) return { kind: "none" }; // only ever link through the tracked, allow-listed redirect
    go.searchParams.set("placement", "extension_banner");
    return {
      kind: "cheaper",
      productTitle: res.product?.title ?? null,
      productSlug: res.product?.slug ?? null,
      current: res.current ?? null,
      cheapest,
      hasDemoData: cheapest.source === "demo" || (res.product?.hasDemoData ?? false),
      goUrl: go.toString(),
    };
  }

  async function checkoutMatch(url: string): Promise<CheckoutMatch> {
    const settings = await getSettings();
    if (!settings.couponFinder) return { kind: "none" };
    const host = hostOf(url);
    if (!host) return { kind: "none" };
    const configs = await getConfigs();
    const config = configs.find(
      (c) =>
        c.enabled &&
        c.hostPatterns.some((p) => hostMatchesPattern(host, p)) &&
        urlMatchesAnyPattern(url, c.checkoutUrlPatterns),
    );
    if (!config) return { kind: "none" };
    const store = await storeForHost(host);
    if (!store) return { kind: "none" };
    let coupons: NormalizedCoupons;
    try {
      coupons = await getCoupons(store.key);
    } catch {
      return { kind: "none" };
    }
    const max = Math.min(config.maxCodes ?? DEFAULT_MAX_CODES, HARD_MAX_CODES);
    const ordered = orderCouponsForCheckout(coupons.coupons, max, now());
    if (ordered.length === 0) return { kind: "none" };
    return {
      kind: "available",
      storeName: coupons.retailer?.name ?? store.name,
      config,
      coupons: ordered.map((c) => ({ id: c.id, code: c.code, title: c.title })),
    };
  }

  async function couponResult(input: { couponId: string; worked: boolean; orderTotalCents?: number; savingsCents?: number }): Promise<OkResult> {
    const settings = await getSettings();
    if (!settings.shareResults) return { ok: true }; // sharing disabled: nothing leaves the browser
    const int = (v: number | undefined) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined);
    try {
      await deps.api.reportCouponResult(input.couponId, {
        worked: input.worked,
        orderTotalCents: int(input.orderTotalCents),
        savingsCents: input.worked ? int(input.savingsCents) : undefined,
        source: "extension",
        deviceId: await installId(),
      });
      return { ok: true };
    } catch {
      return { ok: false, error: "report_failed" };
    }
  }

  /** Badge text for a tab URL ("" = no badge). Only supported retailer hosts trigger an API call. */
  async function badgeText(url: string | undefined): Promise<string> {
    const settings = await getSettings();
    if (!settings.couponFinder) return "";
    const host = hostOf(url);
    if (!host || !findBuiltInRetailer(host)) return "";
    const store = await storeForHost(host);
    if (!store) return "";
    try {
      const n = badgeCount((await getCoupons(store.key)).coupons, now());
      return n > 0 ? (n > 99 ? "99+" : String(n)) : "";
    } catch {
      return "";
    }
  }

  async function clearCaches(): Promise<OkResult> {
    await localCache.clearAll();
    await sessionCache.clearAll();
    await deps.local.remove(INSTALL_ID_KEY); // a fresh random install id is created on the next report
    return { ok: true };
  }

  return { getSettings, setSettings, getConfigs, popupState, follow, productLookup, checkoutMatch, couponResult, badgeText, clearCaches };
}

export type Background = ReturnType<typeof createBackground>;
