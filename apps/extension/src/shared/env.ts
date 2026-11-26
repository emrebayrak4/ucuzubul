import { brand } from "@pricora/config/brand";

function origin(raw: string | undefined, fallback: string): string {
  const v = (raw ?? "").trim() || fallback;
  try {
    return new URL(v).origin;
  } catch {
    return fallback;
  }
}

/** API origin (no trailing slash). Build-time: VITE_PRICORA_API_URL. */
export const API_ORIGIN = origin(import.meta.env.VITE_PRICORA_API_URL as string | undefined, "http://localhost:4400");
/** Web app origin. Build-time: VITE_PRICORA_WEB_URL. */
export const WEB_ORIGIN = origin(import.meta.env.VITE_PRICORA_WEB_URL as string | undefined, "http://localhost:3100");

export const BRAND_NAME = brand.name;

export const webUrl = {
  home: () => `${WEB_ORIGIN}/`,
  search: (q: string) => `${WEB_ORIGIN}/search?q=${encodeURIComponent(q)}`,
  priceDrops: () => `${WEB_ORIGIN}/price-drops`,
  store: (slug: string) => `${WEB_ORIGIN}/stores/${encodeURIComponent(slug)}`,
  product: (slug: string) => `${WEB_ORIGIN}/products/${encodeURIComponent(slug)}`,
  login: () => `${WEB_ORIGIN}/login`,
  privacy: () => `${WEB_ORIGIN}/legal/privacy`,
};

/** Resolves an API-relative path such as "/v1/go/abc" against the API origin; rejects other origins. */
export function apiUrl(pathOrUrl: string): string | null {
  try {
    const u = new URL(pathOrUrl, API_ORIGIN);
    return u.origin === API_ORIGIN ? u.toString() : null;
  } catch {
    return null;
  }
}
