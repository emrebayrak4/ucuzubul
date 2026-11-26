"use client";

import { ApiError, createApiClient, type ApiClient } from "@pricora/api-client";
import { PUBLIC_API_URL } from "./env";

let client: ApiClient | null = null;

/** Browser API client (singleton): sends the `pc_session` cookie and the CSRF header on mutations. */
export function getApi(): ApiClient {
  if (!client) {
    client = createApiClient({
      baseUrl: PUBLIC_API_URL,
      validateResponses: process.env.NODE_ENV !== "production",
      onUnauthorized: () => {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          const next = encodeURIComponent(window.location.pathname + window.location.search);
          // Full reload on purpose: drops every cached query of the expired session.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`/login?next=${next}`);
        }
      },
    });
  }
  return client;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetworkError) return `Cannot reach the API at ${PUBLIC_API_URL}. Is it running?`;
    if (err.status === 404 && err.code === "not_found") return "This endpoint is not available on the API yet.";
    if (err.status === 403) return "Your role does not have permission for this action.";
    if (err.code === "validation_failed") return "Validation failed: " + err.message;
    return err.message || `Request failed (${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}

export { ApiError };
