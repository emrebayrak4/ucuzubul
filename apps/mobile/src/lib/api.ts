import { createApiClient, ApiError } from "@pricora/api-client";
import { API_URL } from "./config";
import { getSessionTokenSync } from "./session";

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export const api = createApiClient({
  baseUrl: API_URL,
  // Cookie fallback: RN keeps `pc_session` in the native cookie store.
  credentials: "include",
  headers: (): Record<string, string> => {
    const token = getSessionTokenSync();
    const h: Record<string, string> = { "x-pricora-client": "native" };
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  },
  validateResponses: __DEV__ && process.env.EXPO_PUBLIC_VALIDATE_RESPONSES === "1",
  onUnauthorized: () => unauthorizedHandler?.(),
});

export { ApiError };

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return "Can't reach Pricora. Check your connection and try again.";
    if (error.status === 429) return "Too many requests. Please wait a moment and try again.";
    return error.message || "Something went wrong.";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetworkError;
}

/** Absolute URL for a relative API path such as offer.goUrl ("/v1/go/:id"). */
export function absoluteApiUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return API_URL + (pathOrUrl.startsWith("/") ? "" : "/") + pathOrUrl;
}
