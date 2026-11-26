import { createApiClient } from "@pricora/api-client";
import type { CategoryNode } from "@pricora/contracts";
import { SITE_URL, serverApiUrl } from "./env";

/** Product URLs per sitemap chunk = SEARCH_PAGES_PER_CHUNK × 60. Well under the 50k-URL protocol limit. */
export const PAGE_SIZE = 60;
export const SEARCH_PAGES_PER_CHUNK = 20;

export function sitemapApi() {
  return createApiClient({
    baseUrl: serverApiUrl(),
    credentials: "omit",
    // Trusted server call without a visitor IP → not rate-limited by the API (crawler-driven sitemap fetches).
    headers: process.env.INTERNAL_API_KEY ? { "x-internal-api-key": process.env.INTERNAL_API_KEY } : undefined,
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000), next: { revalidate: 3600 } }),
  });
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function urlset(entries: Array<{ path: string; lastmod?: string; changefreq?: string; priority?: number }>): string {
  const body = entries
    .map(
      (e) =>
        `<url><loc>${xmlEscape(SITE_URL + e.path)}</loc>${e.lastmod ? `<lastmod>${xmlEscape(e.lastmod)}</lastmod>` : ""}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ""}${e.priority !== undefined ? `<priority>${e.priority.toFixed(1)}</priority>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function flattenCategories(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((n) => [n, ...flattenCategories(n.children)]);
}

export function xmlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
