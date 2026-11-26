import { ApiError, createApiClient } from "@pricora/api-client";
import { PUBLIC_API_URL } from "./env";

/** Browser API client: sends the httpOnly session cookie and the CSRF header automatically. */
export const api = createApiClient({ baseUrl: PUBLIC_API_URL, credentials: "include" });

export { ApiError };

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err instanceof ApiError) {
    if (err.isNetworkError) return "We can't reach the server right now. Check your connection and try again.";
    if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
    return err.message || fallback;
  }
  return fallback;
}

/** Zod issue list from a validation_failed error, keyed by first path segment. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const issue of err.details as Array<{ path?: unknown[]; message?: string }>) {
    const key = issue.path?.[0];
    if (typeof key === "string" && issue.message && !out[key]) out[key] = issue.message;
  }
  return out;
}
