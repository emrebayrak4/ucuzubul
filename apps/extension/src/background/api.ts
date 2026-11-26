/**
 * API calls. Runs ONLY in the background service worker (host_permissions cover the API origin, so no CORS entry
 * for the extension origin is needed). Content scripts never see cookies, CSRF tokens or session data.
 *
 * Credentials policy:
 *  - catalog/coupon/config reads and coupon result reports: `credentials: "omit"` (anonymous, no cookies);
 *  - account calls (who am I, follow a store): `credentials: "include"` so the existing web session cookie is used,
 *    with the double-submit CSRF header for the mutation. No token is ever stored by the extension.
 */
import {
  parseConfigList,
  parseCouponsResponse,
  parseProductResponse,
  type CouponResultRequest,
  type NormalizedCoupons,
  type ProductLookup,
  type RetailerCheckoutConfig,
  type SessionUser,
} from "../shared/types";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ApiDeps {
  origin: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface PricoraApi {
  extensionConfig(): Promise<RetailerCheckoutConfig[]>;
  coupons(host: string): Promise<NormalizedCoupons>;
  product(url: string): Promise<ProductLookup>;
  me(): Promise<{ user: SessionUser | null; csrfToken: string | null }>;
  followStore(retailerSlug: string): Promise<void>;
  reportCouponResult(couponId: string, body: CouponResultRequest): Promise<void>;
}

export function createApi(deps: ApiDeps): PricoraApi {
  const doFetch = deps.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = deps.timeoutMs ?? 8000;

  async function request(
    method: "GET" | "POST",
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; credentials: RequestCredentials; headers?: Record<string, string> },
  ): Promise<unknown> {
    const url = new URL(`/v1${path}`, deps.origin);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await doFetch(url.toString(), {
      method,
      credentials: opts.credentials,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiRequestError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code);
    }
    return json;
  }

  return {
    async extensionConfig() {
      return parseConfigList(await request("GET", "/extension/config", { credentials: "omit" }));
    },
    async coupons(host) {
      return parseCouponsResponse(await request("GET", "/extension/coupons", { query: { host }, credentials: "omit" }));
    },
    async product(url) {
      return parseProductResponse(await request("GET", "/extension/product", { query: { url }, credentials: "omit" }));
    },
    async me() {
      const raw = (await request("GET", "/auth/me", { credentials: "include" })) as {
        user?: { id?: unknown; name?: unknown; email?: unknown } | null;
        csrfToken?: unknown;
      } | null;
      const u = raw?.user;
      const user: SessionUser | null =
        u && typeof u.id === "string" && typeof u.email === "string"
          ? { id: u.id, email: u.email, name: typeof u.name === "string" ? u.name : null }
          : null;
      return { user, csrfToken: typeof raw?.csrfToken === "string" ? raw.csrfToken : null };
    },
    async followStore(retailerSlug) {
      const { user, csrfToken } = await this.me();
      if (!user || !csrfToken) throw new ApiRequestError("Not signed in", 401, "unauthorized");
      await request("POST", "/me/coupon-follows", {
        credentials: "include",
        body: { retailerSlug },
        headers: { "x-csrf-token": csrfToken },
      });
    },
    async reportCouponResult(couponId, body) {
      await request("POST", `/coupons/${encodeURIComponent(couponId)}/result`, { credentials: "omit", body });
    },
  };
}
