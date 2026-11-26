import { PAGE_SIZE, SEARCH_PAGES_PER_CHUNK, flattenCategories, sitemapApi, urlset, xmlResponse } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

const STATIC_PATHS = ["/", "/deals", "/price-drops", "/coupons", "/travel", "/travel/flights", "/travel/hotels"];

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const api = sitemapApi();
  try {
    if (file === "static.xml") {
      return xmlResponse(urlset(STATIC_PATHS.map((path) => ({ path, changefreq: "daily", priority: path === "/" ? 1 : 0.8 }))));
    }
    if (file === "categories.xml") {
      const res = await api.catalog.categories();
      return xmlResponse(
        urlset(flattenCategories(res.items).filter((c) => c.productCount > 0).map((c) => ({ path: `/categories/${c.slug}`, changefreq: "daily", priority: 0.7 }))),
      );
    }
    if (file === "stores.xml") {
      const res = await api.catalog.retailers();
      return xmlResponse(urlset(res.items.filter((r) => r.offerCount > 0).map((r) => ({ path: `/stores/${r.slug}`, changefreq: "weekly", priority: 0.5 }))));
    }
    if (file === "brands.xml") {
      // No brand index endpoint yet: brands come from the global search facet (top brands by product count).
      const res = await api.search.search({ pageSize: 1 });
      return xmlResponse(urlset(res.facets.brands.filter((b) => b.count > 0).map((b) => ({ path: `/brands/${b.value}`, changefreq: "weekly", priority: 0.5 }))));
    }
    if (file === "guides.xml") {
      const items: Array<{ slug?: string; lastReviewedAt?: string; updatedAt?: string }> = [];
      for (let page = 1; page <= 20; page++) {
        const res = await api.travel.guides({ page, pageSize: 60 }).catch(() => null);
        if (!res) break;
        items.push(...res.items.map((g) => ({ slug: g.slug, updatedAt: g.updatedAt })));
        if (page >= res.totalPages) break;
      }
      const json = { items };
      return xmlResponse(
        urlset([
          { path: "/travel/guides", changefreq: "weekly", priority: 0.6 },
          ...(json?.items ?? [])
            .filter((g): g is { slug: string; lastReviewedAt?: string; updatedAt?: string } => Boolean(g.slug))
            .map((g) => ({ path: `/travel/guides/${g.slug}`, lastmod: g.lastReviewedAt ?? g.updatedAt, changefreq: "monthly", priority: 0.6 })),
        ]),
      );
    }
    const m = /^products-(\d{1,4})\.xml$/.exec(file);
    if (m) {
      const chunk = Number(m[1]);
      const firstPage = (chunk - 1) * SEARCH_PAGES_PER_CHUNK + 1;
      const entries: Array<{ path: string; lastmod: string; changefreq: string; priority: number }> = [];
      for (let page = firstPage; page < firstPage + SEARCH_PAGES_PER_CHUNK; page++) {
        const res = await api.search.search({ pageSize: PAGE_SIZE, page, sort: "newest" });
        for (const p of res.items) entries.push({ path: `/products/${p.slug}`, lastmod: p.updatedAt, changefreq: "daily", priority: 0.6 });
        if (page >= res.totalPages) break;
      }
      return xmlResponse(urlset(entries));
    }
    return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "600" } });
  }
}
