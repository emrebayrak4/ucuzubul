import { SITE_URL } from "@/lib/env";
import { PAGE_SIZE, SEARCH_PAGES_PER_CHUNK, sitemapApi, xmlEscape, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Sitemap index → static, taxonomy and chunked product sitemaps. */
export async function GET() {
  let productChunks = 1;
  try {
    const res = await sitemapApi().search.search({ pageSize: PAGE_SIZE, page: 1, sort: "newest" });
    productChunks = Math.max(1, Math.ceil(res.total / (PAGE_SIZE * SEARCH_PAGES_PER_CHUNK)));
  } catch {
    // API down: still emit the index; product chunk 1 will be retried by crawlers later.
  }
  const files = ["static.xml", "categories.xml", "stores.xml", "brands.xml", ...Array.from({ length: productChunks }, (_, i) => `products-${i + 1}.xml`)];
  const now = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files
    .map((f) => `<sitemap><loc>${xmlEscape(`${SITE_URL}/sitemaps/${f}`)}</loc><lastmod>${now}</lastmod></sitemap>`)
    .join("")}</sitemapindex>`;
  return xmlResponse(xml);
}
