import { cookies, headers } from "next/headers";
import type { MeResponse } from "@pricora/contracts";
import { brand } from "@pricora/config/brand";
import { serverApiUrl } from "./env";

export type ServerSession =
  | { status: "ok"; me: MeResponse }
  | { status: "anonymous" }
  | { status: "unreachable"; message: string };

/** Reads the current user by forwarding the API session cookie to GET /v1/auth/me. */
export async function getServerSession(): Promise<ServerSession> {
  const jar = await cookies();
  const session = jar.get(brand.sessionCookieName);
  if (!session) return { status: "anonymous" };

  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  try {
    const res = await fetch(`${serverApiUrl()}/v1/auth/me`, {
      headers: { cookie: cookieHeader, accept: "application/json", ...(await serverToServerHeaders()) },
      cache: "no-store",
    });
    if (res.status === 401) return { status: "anonymous" };
    if (!res.ok) return { status: "unreachable", message: `GET /v1/auth/me returned HTTP ${res.status}` };
    const me = (await res.json()) as MeResponse;
    if (!me || typeof me !== "object" || !("user" in me)) {
      return { status: "unreachable", message: "GET /v1/auth/me returned an unexpected body" };
    }
    if (!me.user) return { status: "anonymous" };
    return { status: "ok", me };
  } catch (err) {
    return { status: "unreachable", message: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Headers for SSR → API calls (SEC-H1, A04 throttle.ts): the internal server-to-server key plus the visitor's IP
 * in `x-pricora-client-ip`, so the API rate-limits per visitor instead of per admin server. Server-only.
 */
export const INTERNAL_API_KEY_HEADER = "x-internal-api-key";
export const CLIENT_IP_HEADER = "x-pricora-client-ip";

export async function serverToServerHeaders(): Promise<Record<string, string>> {
  const h = await headers();
  const out: Record<string, string> = {};
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  const key = process.env.INTERNAL_API_KEY;
  if (key) out[INTERNAL_API_KEY_HEADER] = key;
  if (ip) {
    out[CLIENT_IP_HEADER] = ip;
    out["x-forwarded-for"] = ip;
  }
  return out;
}
