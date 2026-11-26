import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ApiError, createApiClient, type ApiClient } from "@pricora/api-client";
import { serverApiUrl } from "./env";

export interface ServerApiOptions {
  /** ISR window in seconds for GET requests (ignored when `withCookies`). Default 300. */
  revalidate?: number;
  /** Forward the visitor's cookies (session). Makes the request uncached. */
  withCookies?: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Trusted server-to-server headers (A04 throttle.ts): `x-internal-api-key` + the visitor's IP in
 * `x-pricora-client-ip`, so the API rate-limits per visitor instead of per SSR server. Server-only.
 */
export function internalHeaders(clientIp?: string | null): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) return {};
  const h: Record<string, string> = { "x-internal-api-key": key };
  if (clientIp && IP_RE.test(clientIp)) {
    h["x-pricora-client-ip"] = clientIp;
    h["x-forwarded-for"] = clientIp;
  }
  return h;
}

async function visitorIp(): Promise<string | null> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = xff || h.get("x-real-ip")?.trim() || null;
    return ip ? ip.replace(/^::ffff:/, "") : null;
  } catch {
    return null; // outside a request scope (build)
  }
}

/** Typed API client for Server Components / route handlers. */
export async function serverApi(opts: ServerApiOptions = {}): Promise<ApiClient> {
  const cookieHeader = opts.withCookies ? (await cookies()).toString() : "";
  const extra = { ...internalHeaders(await visitorIp()), ...(cookieHeader ? { cookie: cookieHeader } : {}) };
  return createApiClient({
    baseUrl: serverApiUrl(),
    credentials: "omit",
    headers: Object.keys(extra).length ? extra : undefined,
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(opts.withCookies ? { cache: "no-store" as const } : { next: { revalidate: opts.revalidate ?? 300 } }),
      }),
  });
}

export interface LoadError {
  status: number;
  code: string;
  message: string;
}

export type LoadResult<T> = { ok: true; data: T } | { ok: false; error: LoadError };

export function toLoadError(err: unknown): LoadError {
  if (err instanceof ApiError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof Error) {
    return { status: 0, code: err.name === "TimeoutError" ? "timeout" : "network_error", message: err.message };
  }
  return { status: 0, code: "unknown", message: "Unknown error" };
}

/**
 * Runs a server-side API call and never throws for API/network failures.
 * On failure the route is opted into dynamic rendering so a transient outage is never baked into
 * a static/ISR page (a failing ISR revalidation keeps serving the previous good page).
 * `notFoundOn404` turns a 404 into Next's notFound().
 */
export async function load<T>(fn: () => Promise<T>, opts: { notFoundOn404?: boolean } = {}): Promise<LoadResult<T>> {
  let error: LoadError;
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    error = toLoadError(err);
  }
  if (opts.notFoundOn404 && error.status === 404) notFound();
  await connection();
  return { ok: false, error };
}

/** Reads the visitor's ZIP cookie (validated). */
export const getZip = cache(async (): Promise<string | null> => {
  const raw = (await cookies()).get("pc_zip")?.value;
  return raw && /^\d{5}$/.test(raw) ? raw : null;
});

export const hasSessionCookie = cache(async (): Promise<boolean> => {
  return Boolean((await cookies()).get("pc_session")?.value);
});
