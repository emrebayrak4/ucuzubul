import { TRAVEL_ENABLED } from "@/lib/features";
import { BEST_UNDER_CAPS, MIN_REAL_PRODUCTS } from "@/lib/seo";
import { PAGE_SIZE, SEARCH_PAGES_PER_CHUNK, flattenCategories, pool, sitemapApi, urlset, xmlResponse, type SitemapEntry } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/**
 * Sitemap policy (see docs/SEO_AUDIT.md):
 * - lastmod only from real data (product.updatedAt, guide.updatedAt, newest product in a list); never "now".
 * - Programmatic pages (best.xml, brand-categories.xml) list only URLs that clear MIN_REAL_PRODUCTS real
 *   (non-demo) products — the same rule that makes them indexable. Demo-only pages stay out.
 * - Travel (hidden behind NEXT_PUBLIC_TRAVEL_ENABLED) is excluded entirely while hidden.
 */
const STATIC_PATHS = [
  "/",
  "/deals",
  "/price-drops",
  "/coupons",
  "/popular",
  "/new",
  "/sitemap",
  "/about",
  "/how-we-compare",
  "/editorial-policy",
  "/contact",
  ...(TRAVEL_ENABLED ? ["/travel", "/travel/flights", "/travel/hotels"] : []),
];

type Api = ReturnType<typeof sitemapApi>;

/** Count of products with only real offers among the top results, and the newest updatedAt. */
async function realStats(api: Api, q: Parameters<Api["search"]["search"]>[0]) {
  const res = await api.search.search({ ...q, pageSize: 48 }).catch(() => null);
  if (!res) return { real: 0, lastmod: undefined as string | undefined, total: 0 };
  const real = res.items.filter((p) => !p.hasDemoData);
  const lastmod = real.reduce<string | undefined>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), undefined);
  return { real: real.length, lastmod, total: res.total };
}

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
    if (file === "best.xml") {
      const cats = flattenCategories((await api.catalog.categories()).items).filter((c) => c.productCount >= MIN_REAL_PRODUCTS);
      const entries = (
        await pool(cats, 6, async (c) => {
          const base = await realStats(api, { category: c.slug, sort: "best_deal" });
          if (base.real < MIN_REAL_PRODUCTS) return [];
          const out: SitemapEntry[] = [{ path: `/best/${c.slug}`, lastmod: base.lastmod, changefreq: "daily", priority: 0.6 }];
          for (const cap of BEST_UNDER_CAPS) {
            const s = await realStats(api, { category: c.slug, sort: "best_deal", maxPrice: cap * 100 });
            if (s.real >= MIN_REAL_PRODUCTS) out.push({ path: `/best/${c.slug}-under-${cap}`, lastmod: s.lastmod, changefreq: "daily", priority: 0.5 });
          }
          return out;
        })
      ).flat();
      return xmlResponse(urlset(entries));
    }
    if (file === "brand-categories.xml") {
      const brands = (await api.search.search({ pageSize: 1 })).facets.brands.filter((b) => b.count >= MIN_REAL_PRODUCTS);
      const combos = (
        await pool(brands, 6, async (b) => {
          const d = await api.catalog.brand(b.value).catch(() => null);
          return (d?.categoryBreakdown ?? []).filter((c) => c.count >= MIN_REAL_PRODUCTS).map((c) => ({ brand: b.value, category: c.slug }));
        })
      ).flat();
      const entries = (
        await pool(combos, 6, async (x) => {
          const s = await realStats(api, { brand: [x.brand], category: x.category, sort: "popular" });
          return s.real >= MIN_REAL_PRODUCTS ? [{ path: `/brands/${x.brand}/${x.category}`, lastmod: s.lastmod, changefreq: "weekly", priority: 0.5 }] : [];
        })
      ).flat();
      return xmlResponse(urlset(entries));
    }
    if (file === "guides.xml") {
      if (!TRAVEL_ENABLED) return xmlResponse(urlset([]));
      const items: Array<{ slug: string; updatedAt?: string }> = [];
      for (let page = 1; page <= 20; page++) {
        const res = await api.travel.guides({ page, pageSize: 60 }).catch(() => null);
        if (!res) break;
        items.push(...res.items.filter((g) => Boolean(g.slug)).map((g) => ({ slug: g.slug, updatedAt: g.updatedAt })));
        if (page >= res.totalPages) break;
      }
      return xmlResponse(
        urlset([
          { path: "/travel/guides", changefreq: "weekly", priority: 0.6 },
          ...items.map((g) => ({ path: `/travel/guides/${g.slug}`, lastmod: g.updatedAt, changefreq: "monthly", priority: 0.6 })),
        ]),
      );
    }
    const m = /^products-(\d{1,4})\.xml$/.exec(file);
    if (m) {
      const chunk = Number(m[1]);
      const firstPage = (chunk - 1) * SEARCH_PAGES_PER_CHUNK + 1;
      const entries: SitemapEntry[] = [];
      for (let page = firstPage; page < firstPage + SEARCH_PAGES_PER_CHUNK; page++) {
        const res = await api.search.search({ pageSize: PAGE_SIZE, page, sort: "newest" });
        for (const p of res.items) {
          entries.push({
            path: `/products/${p.slug}`,
            lastmod: p.updatedAt,
            changefreq: "daily",
            priority: 0.6,
            images: p.image && /^https?:\/\//.test(p.image.url) ? [{ loc: p.image.url, title: p.image.alt || p.title }] : undefined,
          });
        }
        if (page >= res.totalPages) break;
      }
      return xmlResponse(urlset(entries));
    }
    return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Sitemap temporarily unavailable", { status: 503, headers: { "retry-after": "600" } });
  }
}
