import {
  API_VERSION_PREFIX,
  ErrorEnvelope,
  endpoints,
  type EndpointBody,
  type EndpointName,
  type EndpointParams,
  type EndpointQuery,
  type EndpointResponse,
} from "@pricora/contracts";
import { brand } from "@pricora/config/brand";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isPendingConfiguration(): boolean {
    return this.code === "pending_configuration";
  }
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  /** API origin, e.g. http://localhost:4400 (without /v1). */
  baseUrl: string;
  /** Custom fetch (SSR, tests, React Native). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Default "include" so the httpOnly `pc_session` cookie is sent. */
  credentials?: RequestCredentials;
  /** Extra headers (e.g. forwarded cookie during SSR, or { authorization: "Bearer <token>", "x-pricora-client": "native" } on mobile). */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Override CSRF token lookup. Default: last token returned by the API, else `pc_csrf` cookie in browsers. */
  getCsrfToken?: () => string | null | undefined;
  /** Validate responses against contracts (useful in dev/tests). Default false. */
  validateResponses?: boolean;
  /** Called on any 401 (e.g. to redirect to /login). */
  onUnauthorized?: (error: ApiError) => void;
}

type ParamsPart<N extends EndpointName> = [EndpointParams<N>] extends [never]
  ? { params?: undefined }
  : { params: EndpointParams<N> };
type QueryPart<N extends EndpointName> = [EndpointQuery<N>] extends [never]
  ? { query?: undefined }
  : { query?: EndpointQuery<N> };
type BodyPart<N extends EndpointName> = [EndpointBody<N>] extends [never]
  ? { body?: undefined }
  : { body: EndpointBody<N> | FormData };

export type RequestInput<N extends EndpointName> = ParamsPart<N> &
  QueryPart<N> &
  BodyPart<N> & { signal?: AbortSignal; headers?: Record<string, string> };

type QueryValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];

export function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length > 0) sp.set(k, v.join(","));
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? "?" + s : "";
}

export function fillPath(path: string, params: Record<string, string | number> | undefined): string {
  return path.replace(/:([A-Za-z_]+)/g, (_m, key: string) => {
    const v = params?.[key];
    if (v === undefined || v === "") throw new Error("Missing path param: " + key);
    return encodeURIComponent(String(v));
  });
}

function readCookie(name: string): string | null {
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (!doc?.cookie) return null;
  for (const part of doc.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export interface ApiCore {
  request<N extends EndpointName>(name: N, input?: RequestInput<N>): Promise<EndpointResponse<N>>;
  /** Absolute URL for an endpoint (used for redirect endpoints like /go/:offerId). */
  url<N extends EndpointName>(name: N, input?: Pick<RequestInput<N>, "params" | "query">): string;
  setCsrfToken(token: string | null): void;
  getCsrfToken(): string | null;
  readonly baseUrl: string;
}

export function createApiCore(options: ApiClientOptions): ApiCore {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  let csrfToken: string | null = null;

  const getCsrf = (): string | null =>
    options.getCsrfToken?.() ?? csrfToken ?? readCookie(brand.csrfCookieName);

  function url<N extends EndpointName>(name: N, input?: Pick<RequestInput<N>, "params" | "query">): string {
    const ep = endpoints[name];
    const path = fillPath(ep.path, input?.params as Record<string, string> | undefined);
    return baseUrl + API_VERSION_PREFIX + path + buildQueryString(input?.query as Record<string, QueryValue> | undefined);
  }

  async function request<N extends EndpointName>(name: N, input?: RequestInput<N>): Promise<EndpointResponse<N>> {
    const ep = endpoints[name];
    const target = url(name, input as Pick<RequestInput<N>, "params" | "query"> | undefined);
    const extra = typeof options.headers === "function" ? await options.headers() : (options.headers ?? {});
    const headers: Record<string, string> = { accept: "application/json", ...extra, ...(input?.headers ?? {}) };

    let body: BodyInit | undefined;
    const rawBody = input?.body as unknown;
    if (rawBody !== undefined) {
      if (typeof FormData !== "undefined" && rawBody instanceof FormData) {
        body = rawBody;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify(rawBody);
      }
    }
    if (ep.method !== "GET") {
      const token = getCsrf();
      if (token) headers[brand.csrfHeaderName] = token;
    }

    let res: Response;
    try {
      res = await doFetch(target, {
        method: ep.method,
        headers,
        body,
        credentials: options.credentials ?? "include",
        signal: input?.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new ApiError(0, "network_error", err instanceof Error ? err.message : "Network error");
    }

    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      const parsed = ErrorEnvelope.safeParse(json);
      const error = parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details, parsed.data.error.requestId)
        : new ApiError(res.status, statusToCode(res.status), res.statusText || "Request failed");
      if (res.status === 401) options.onUnauthorized?.(error);
      throw error;
    }

    if (json && typeof json === "object" && "csrfToken" in json) {
      const t = (json as { csrfToken?: unknown }).csrfToken;
      if (typeof t === "string") csrfToken = t;
    }

    if (ep.response && options.validateResponses) {
      const result = ep.response.safeParse(json);
      if (!result.success) {
        throw new ApiError(res.status, "invalid_response", "Response did not match contract for " + name, result.error.issues);
      }
      return result.data as EndpointResponse<N>;
    }
    return json as EndpointResponse<N>;
  }

  return {
    request,
    url,
    setCsrfToken: (t) => {
      csrfToken = t;
    },
    getCsrfToken: getCsrf,
    baseUrl,
  };
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_failed";
    case 429:
      return "rate_limited";
    case 503:
      return "service_unavailable";
    default:
      return status >= 500 ? "internal_error" : "bad_request";
  }
}
