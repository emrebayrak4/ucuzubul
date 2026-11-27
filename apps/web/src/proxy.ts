import { NextResponse, type NextRequest } from "next/server";
import { TRAVEL_ENABLED } from "@/lib/features";

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4400").origin;
  } catch {
    return "http://localhost:4400";
  }
})();

/**
 * Per-request nonce-based CSP (Next applies the nonce to its own scripts automatically).
 * - script-src: nonce + strict-dynamic (no unsafe-inline); 'unsafe-eval' only in dev (React debug tooling).
 * - style-src keeps 'unsafe-inline': Radix/Sonner/ECharts set inline style attributes, which nonces can't cover.
 * - connect-src allows the API origin (client mutations, autocomplete, history) — nothing else.
 */
export function proxy(request: NextRequest) {
  // Travel is hidden for now (founder decision 2026-11-27): send travel URLs to the shopping home.
  if (!TRAVEL_ENABLED && /^\/(travel|flights|hotels)(\/|$)/.test(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/", request.url), 307);
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://images.unsplash.com https: " + API_ORIGIN + (isDev ? " http:" : ""),
    "font-src 'self' data:",
    `connect-src 'self' ${API_ORIGIN}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...((process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|sitemaps/|\\.well-known/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
