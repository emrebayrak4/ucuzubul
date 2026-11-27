import { TRAVEL_ENABLED } from "@/lib/features";
import { SITE_URL } from "@/lib/env";
import { PAGE_SIZE, SEARCH_PAGES_PER_CHUNK, sitemapApi, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Sitemap index → static, taxonomy, programmatic and chunked product sitemaps. No index-level lastmod: we'd only be guessing (child files carry real per-URL lastmod). */
export async function GET() {
  let productChunks = 1;
  try {
    const res = await sitemapApi().search.search({ pageSize: PAGE_SIZE, page: 1, sort: "newest" });
    productChunks = Math.max(1, Math.ceil(res.total / (PAGE_SIZE * SEARCH_PAGES_PER_CHUNK)));
  } catch {
    // API down: still emit the index; product chunk 1 will be retried by crawlers later.
  }
  const files = ["static.xml", "categories.xml", "stores.xml", "brands.xml", "best.xml", "brand-categories.xml", ...(TRAVEL_ENABLED ? ["guides.xml"] : []), ...Array.from({ length: productChunks }, (_, i) => `products-${i + 1}.xml`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files
    .map((f) => `<sitemap><loc>${xmlEscape(`${SITE_URL}/sitemaps/${f}`)}</loc></sitemap>`)
    .join("")}</sitemapindex>`;
  return xmlResponse(xml);
}
