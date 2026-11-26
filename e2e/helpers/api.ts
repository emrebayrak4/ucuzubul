import { type APIRequestContext, type APIResponse, request as pwRequest } from "@playwright/test";
import { API_URL } from "./env";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends a request and, if the API answers 429 (auth endpoints allow 10/min per IP per route), waits for the
 * window to reset and retries. The suite is intentionally kept under the limit; this only protects re-runs.
 */
export async function withRateLimitRetry(fn: () => Promise<APIResponse>, attempts = 3): Promise<APIResponse> {
  let res = await fn();
  for (let i = 1; i < attempts && res.status() === 429; i++) {
    const ra = Number(res.headers()["retry-after"] ?? "0");
    await sleep(Math.min(Math.max(ra, 5), 65) * 1000);
    res = await fn();
  }
  return res;
}

export async function newApiContext(storageState?: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, storageState, extraHTTPHeaders: { accept: "application/json" } });
}

export async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const state = await ctx.storageState();
  const c = state.cookies.find((x) => x.name === "pc_csrf");
  if (c) return c.value;
  const me = await ctx.get("/v1/auth/me");
  return ((await me.json()) as { csrfToken: string }).csrfToken;
}

export async function apiLogin(ctx: APIRequestContext, email: string, password: string): Promise<APIResponse> {
  return withRateLimitRetry(() => ctx.post("/v1/auth/login", { data: { email, password } }));
}

export async function apiRegister(ctx: APIRequestContext, email: string, password: string, name = "E2E Tester"): Promise<APIResponse> {
  return withRateLimitRetry(() => ctx.post("/v1/auth/register", { data: { email, password, name } }));
}

/** Mutation helper that sends the double-submit CSRF header from the context's pc_csrf cookie. */
export async function mutate(
  ctx: APIRequestContext,
  method: "post" | "patch" | "delete",
  url: string,
  data?: unknown,
): Promise<APIResponse> {
  const headers = { "x-csrf-token": await csrfOf(ctx) };
  return ctx[method](url, { data, headers });
}

export interface ProductCardLite {
  id: string;
  slug: string;
  title: string;
  lowestPriceCents: number | null;
  hasDemoData: boolean;
}

export async function searchProducts(ctx: APIRequestContext, q: string): Promise<ProductCardLite[]> {
  const res = await ctx.get(`/v1/search?q=${encodeURIComponent(q)}`);
  return ((await res.json()) as { items: ProductCardLite[] }).items;
}
