import { createApiClient, ApiError } from "@pricora/api-client";
import { API_URL, brand } from "./config";
import { privacyStore } from "./privacy";
import { getSessionTokenSync } from "./session";

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

/**
 * Response validation against the Zod contracts is ON in development (every screen is checked against
 * @pricora/contracts); set EXPO_PUBLIC_VALIDATE_RESPONSES=0 to turn it off. Always off in release builds.
 */
export const VALIDATE_RESPONSES = __DEV__ && process.env.EXPO_PUBLIC_VALIDATE_RESPONSES !== "0";

function baseHeaders(): Record<string, string> {
  const token = getSessionTokenSync();
  const h: Record<string, string> = { "x-pricora-client": "native" };
  if (token) h.authorization = `Bearer ${token}`;
  if (privacyStore.get().doNotSellShare) h["sec-gpc"] = "1";
  return h;
}

export const api = createApiClient({
  baseUrl: API_URL,
  // Cookie fallback: RN keeps `pc_session` in the native cookie store.
  credentials: "include",
  headers: baseHeaders,
  validateResponses: VALIDATE_RESPONSES,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export { ApiError };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return `Can't reach ${brand.name}. Check your connection and try again.`;
    if (error.status === 429) return "Too many requests. Please wait a moment and try again.";
    if (error.code === "invalid_response") return `${error.message} (dev contract check).`;
    return error.message || "Something went wrong.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Absolute URL for a relative API path such as offer.goUrl ("/v1/go/:id"). */
export function absoluteApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return API_URL + (pathOrUrl.startsWith("/") ? "" : "/") + pathOrUrl;
}

/**
 * GET /v1/geo/zip?lat&lng (contract `geo.zip.nearest`) — nearest-ZCTA lookup for "Use my location".
 * Coordinates are rounded to 3 decimals (~110 m, same as web; docs/PRIVACY.md) before sending and never stored.
 * `null` = no US ZIP for this point (API returns zip:null). "unsupported" only guards an older API without the route.
 */
export async function lookupZipForCoords(
  lat: number,
  lng: number,
): Promise<{ zip: string; city: string | null; confidence: "high" | "medium" | "low" | null } | "unsupported" | null> {
  const round = (n: number) => Math.round(n * 1_000) / 1_000;
  try {
    const r = await api.geo.zipNear(round(lat), round(lng));
    return r.zip ? { zip: r.zip, city: r.city ? `${r.city}${r.state ? `, ${r.state}` : ""}` : r.state, confidence: r.confidence } : null;
  } catch (e) {
    if (isNotFound(e)) return "unsupported";
    throw e;
  }
}
