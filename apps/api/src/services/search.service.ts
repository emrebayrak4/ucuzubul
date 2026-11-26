import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { parseSearchQuery, type ParsedSearchQuery } from "@pricora/algorithms";
import type {
  FacetBucket,
  ParsedQuery,
  SearchFacets,
  SearchQuery,
  SearchResponse,
  SuggestResponse,
  Suggestion,
  TrendingResponse,
} from "@pricora/contracts";
import type { Meilisearch } from "meilisearch";
import { buildSearchDocuments, PRICE_BUCKETS, PRODUCTS_INDEX, reindexProducts, type ProductSearchDoc } from "../core/search-index";
import { MEILI, PRISMA, type PrismaClient } from "../common/infra";
import { CatalogService } from "./catalog.service";

/** Maps @pricora/algorithms category hints to our category slugs, plus words to strip from the text query. */
const CATEGORY_HINTS: Record<string, { slug: string; words: string[] }> = {
  laptops: { slug: "laptops", words: ["laptop", "laptops", "notebook", "notebooks", "ultrabook", "ultrabooks"] },
  tvs: { slug: "tv-home-theater", words: ["tv", "tvs", "television", "televisions"] },
  monitors: { slug: "monitors", words: ["monitor", "monitors", "display", "displays"] },
  smartphones: { slug: "smartphones", words: ["smartphone", "smartphones", "phone", "phones"] },
  tablets: { slug: "tablets", words: ["tablet", "tablets"] },
  headphones: { slug: "headphones-audio", words: ["headphone", "headphones", "earbuds", "earbud", "headset", "headsets"] },
  smartwatches: { slug: "wearables", words: ["smartwatch", "smartwatches"] },
  "gaming-consoles": { slug: "consoles", words: ["console", "consoles"] },
  cameras: { slug: "cameras", words: ["camera", "cameras"] },
  audio: { slug: "headphones-audio", words: ["speaker", "speakers", "soundbar", "soundbars"] },
  storage: { slug: "computer-accessories", words: [] },
  vacuums: { slug: "vacuums-floor-care", words: ["vacuum", "vacuums"] },
  "kitchen-appliances": { slug: "home-kitchen", words: [] },
  appliances: { slug: "appliances", words: [] },
  baby: { slug: "baby-kids", words: [] },
  "pet-supplies": { slug: "pet-supplies", words: [] },
  tools: { slug: "power-tools", words: ["drill", "drills", "tool", "tools"] },
};

const SORTS: Record<SearchQuery["sort"], string[] | null> = {
  relevance: null,
  lowest_total: ["lowestTotalCents:asc"],
  price_asc: ["lowestPriceCents:asc"],
  price_desc: ["lowestPriceCents:desc"],
  best_deal: ["dealScore:desc"],
  popular: ["storeCount:desc"],
  newest: ["createdAt:desc"],
  biggest_drop: ["dropRatio:desc"],
};

interface Effective {
  text: string;
  category?: string;
  brands: string[];
  retailers: string[];
  conditions: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  freeShipping?: boolean;
  pickup?: boolean;
  minDiscount?: number;
}

const esc = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

@Injectable()
export class SearchService implements OnApplicationBootstrap {
  private readonly log = new Logger("Search");
  private docsCache: { at: number; docs: ProductSearchDoc[] } | null = null;
  private labels: { at: number; categories: Map<string, string>; brands: Map<string, string>; retailers: Map<string, string> } | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MEILI) private readonly meili: Meilisearch,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env["NODE_ENV"] === "test") return;
    // Full rebuild on boot keeps the index consistent with the DB (cheap at current catalog size; the worker owns it at scale).
    void this.ensureIndex(true);
  }

  /** Builds the Meilisearch index if it is missing or empty. Never blocks boot. */
  async ensureIndex(force = false): Promise<number | null> {
    try {
      if (!force) {
        const stats = await this.meili.index(PRODUCTS_INDEX).getStats().catch(() => null);
        if (stats && stats.numberOfDocuments > 0) return stats.numberOfDocuments;
      }
      const n = await reindexProducts(this.prisma, this.meili, await this.catalog.metrics.all());
      this.log.log(`Indexed ${n} products into Meilisearch`);
      return n;
    } catch (err) {
      this.log.warn(`Meilisearch indexing skipped: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async docs(): Promise<ProductSearchDoc[]> {
    if (this.docsCache && Date.now() - this.docsCache.at < 120_000) return this.docsCache.docs;
    const docs = await buildSearchDocuments(this.prisma, await this.catalog.metrics.all());
    this.docsCache = { at: Date.now(), docs };
    return docs;
  }

  private async labelMaps() {
    if (this.labels && Date.now() - this.labels.at < 300_000) return this.labels;
    const [c, b, r] = await Promise.all([
      this.prisma.category.findMany({ select: { slug: true, name: true } }),
      this.prisma.brand.findMany({ select: { slug: true, name: true } }),
      this.prisma.retailer.findMany({ select: { slug: true, name: true } }),
    ]);
    this.labels = {
      at: Date.now(),
      categories: new Map(c.map((x) => [x.slug, x.name])),
      brands: new Map(b.map((x) => [x.slug, x.name])),
      retailers: new Map(r.map((x) => [x.slug, x.name])),
    };
    return this.labels;
  }

  private effective(q: SearchQuery, parsed: ParsedSearchQuery | null): Effective {
    const eff: Effective = {
      text: q.q ?? "",
      category: q.category,
      brands: q.brand ?? [],
      retailers: q.retailer ?? [],
      conditions: q.condition ?? [],
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      inStock: q.inStock,
      freeShipping: q.freeShipping,
      pickup: q.pickup,
      minDiscount: q.minDiscount,
    };
    if (parsed && parsed.kind === "text") {
      let terms = parsed.terms;
      const hint = parsed.categoryHint ? CATEGORY_HINTS[parsed.categoryHint] : undefined;
      if (hint && !eff.category) {
        eff.category = hint.slug;
        terms = terms.filter((t) => !hint.words.includes(t));
      }
      eff.text = terms.join(" ");
      if (eff.maxPrice === undefined && parsed.maxPriceCents !== null) eff.maxPrice = parsed.maxPriceCents;
      if (eff.minPrice === undefined && parsed.minPriceCents !== null) eff.minPrice = parsed.minPriceCents;
    }
    return eff;
  }

  private toParsed(parsed: ParsedSearchQuery, eff: Effective, labels: Awaited<ReturnType<SearchService["labelMaps"]>>): ParsedQuery {
    return {
      text: eff.text,
      maxPriceCents: parsed.maxPriceCents,
      minPriceCents: parsed.minPriceCents,
      category: eff.category && labels.categories.has(eff.category) ? { slug: eff.category, name: labels.categories.get(eff.category) ?? eff.category } : null,
      brand: null,
      identifier: parsed.gtin ? { type: parsed.gtin.type, value: parsed.gtin.value } : null,
      url: parsed.url?.url ?? null,
    };
  }

  async search(q: SearchQuery, userId?: string | null): Promise<SearchResponse> {
    const started = Date.now();
    // Strip control characters (incl. NUL, which Postgres text columns reject).
    if (q.q) q = { ...q, q: q.q.replace(/[\u0000-\u001f\u007f]/g, " ").trim() };
    const parsed = q.q ? parseSearchQuery(q.q) : null;
    const eff = this.effective(q, parsed);
    const labels = await this.labelMaps();

    // Barcode / GTIN: exact identifier lookup first.
    if (parsed?.kind === "gtin" && parsed.gtin) {
      const variants = gtinVariants(parsed.gtin.value);
      const ident = await this.prisma.productIdentifier.findMany({ where: { value: { in: variants } }, select: { productId: true } });
      const ids = [...new Set(ident.map((i) => i.productId))];
      const items = await this.catalog.cards(ids);
      return this.finish({ items, facets: emptyFacets(), total: items.length, q, degraded: false, parsed: this.toParsed(parsed, eff, labels), started, userId });
    }

    let result: { ids: string[]; total: number; facets: SearchFacets } | null = null;
    let degraded = false;
    try {
      result = await this.searchMeili(q, eff, labels);
    } catch (err) {
      this.log.warn(`Meilisearch unavailable, using Postgres fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!result) {
      degraded = true;
      result = await this.searchFallback(q, eff, labels);
    }
    const items = await this.catalog.cards(result.ids);
    if (!degraded && items.length < result.ids.length) {
      // Index references products that no longer exist (e.g. after a reseed) → rebuild in the background.
      this.catalog.metrics.invalidate();
      void this.ensureIndex(true);
    }
    return this.finish({ items, facets: result.facets, total: result.total, q, degraded, parsed: parsed ? this.toParsed(parsed, eff, labels) : null, started, userId });
  }

  private finish(a: {
    items: SearchResponse["items"];
    facets: SearchFacets;
    total: number;
    q: SearchQuery;
    degraded: boolean;
    parsed: ParsedQuery | null;
    started: number;
    userId?: string | null;
  }): SearchResponse {
    const tookMs = Date.now() - a.started;
    if (a.q.q && a.q.q.trim()) {
      void this.prisma.searchEvent
        .create({
          data: {
            query: a.q.q.slice(0, 200),
            normalizedQuery: a.q.q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200),
            userId: a.userId ?? null,
            resultCount: a.total,
            degraded: a.degraded,
            tookMs,
            filters: { category: a.q.category ?? null, brand: a.q.brand ?? null, sort: a.q.sort },
          },
        })
        .catch(() => undefined);
    }
    return {
      items: a.items,
      facets: a.facets,
      total: a.total,
      page: a.q.page,
      pageSize: a.q.pageSize,
      totalPages: Math.ceil(a.total / a.q.pageSize),
      degraded: a.degraded,
      parsed: a.parsed,
      tookMs,
    };
  }

  private filters(eff: Effective, omit?: "brand" | "retailer" | "category" | "condition"): string[] {
    const f: string[] = [];
    if (eff.category && omit !== "category") f.push(`categorySlugs = ${esc(eff.category)}`);
    if (eff.brands.length && omit !== "brand") f.push(`brandSlug IN [${eff.brands.map(esc).join(", ")}]`);
    if (eff.retailers.length && omit !== "retailer") f.push(`retailers IN [${eff.retailers.map(esc).join(", ")}]`);
    if (eff.conditions.length && omit !== "condition") f.push(`condition IN [${eff.conditions.map(esc).join(", ")}]`);
    if (eff.minPrice !== undefined) f.push(`lowestPriceCents >= ${eff.minPrice}`);
    if (eff.maxPrice !== undefined) f.push(`lowestPriceCents <= ${eff.maxPrice}`);
    if (eff.inStock) f.push("inStock = true");
    if (eff.freeShipping) f.push("freeShipping = true");
    if (eff.pickup) f.push("pickup = true");
    if (eff.minDiscount !== undefined) f.push(`dropRatio >= ${eff.minDiscount}`);
    return f;
  }

  private async searchMeili(q: SearchQuery, eff: Effective, labels: Awaited<ReturnType<SearchService["labelMaps"]>>) {
    const index = this.meili.index<ProductSearchDoc>(PRODUCTS_INDEX);
    const stats = await index.getStats();
    if (stats.numberOfDocuments === 0) {
      void this.ensureIndex(true);
      return null;
    }
    const sort = SORTS[q.sort];
    const main = await index.search(eff.text, {
      filter: this.filters(eff),
      facets: ["categorySlugs", "condition", "priceBucket", "inStock", "lowestPriceCents"],
      ...(sort ? { sort } : {}),
      page: q.page,
      hitsPerPage: q.pageSize,
      attributesToRetrieve: ["id"],
    });
    // Disjunctive facets: brand/retailer counts ignore their own selection.
    const [brandRes, retailerRes] = await Promise.all([
      index.search(eff.text, { filter: this.filters(eff, "brand"), facets: ["brandSlug"], limit: 0 }),
      index.search(eff.text, { filter: this.filters(eff, "retailer"), facets: ["retailers"], limit: 0 }),
    ]);
    const dist = main.facetDistribution ?? {};
    const stat = main.facetStats?.["lowestPriceCents"];
    const facets: SearchFacets = {
      categories: buckets(dist["categorySlugs"], labels.categories, eff.category ? [eff.category] : []),
      brands: buckets(brandRes.facetDistribution?.["brandSlug"], labels.brands, eff.brands),
      retailers: buckets(retailerRes.facetDistribution?.["retailers"], labels.retailers, eff.retailers),
      conditions: buckets(dist["condition"], CONDITION_LABELS, eff.conditions),
      price: {
        minCents: stat ? Math.round(stat.min) : null,
        maxCents: stat ? Math.round(stat.max) : null,
        buckets: PRICE_BUCKETS.map(([from, to]) => ({ fromCents: from, toCents: to, count: dist["priceBucket"]?.[`${from}-${to ?? ""}`] ?? 0 })).filter(
          (b) => b.count > 0,
        ),
      },
      inStockCount: dist["inStock"]?.["true"] ?? 0,
    };
    return { ids: main.hits.map((h) => h.id), total: main.totalHits ?? 0, facets };
  }

  private async searchFallback(q: SearchQuery, eff: Effective, labels: Awaited<ReturnType<SearchService["labelMaps"]>>) {
    let docs = await this.docs();
    const scores = new Map<string, number>();
    if (eff.text.trim()) {
      const text = eff.text.trim();
      // Escape LIKE wildcards so user input matches literally (default escape char is backslash).
      const like = "%" + text.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
      const rows = await this.prisma.$queryRaw<{ id: string; score: number }[]>`
        SELECT p.id, GREATEST(similarity(p.title, ${text}), word_similarity(${text}, p.title)) AS score
        FROM products p
        LEFT JOIN brands b ON b.id = p."brandId"
        WHERE p.status = 'active' AND (
          p.title ILIKE ${like} OR b.name ILIKE ${like}
          OR word_similarity(${text}, p.title) > 0.35
          OR EXISTS (SELECT 1 FROM product_identifiers i WHERE i."productId" = p.id AND i.value = ${text})
        )
        ORDER BY score DESC
        LIMIT 500`;
      for (const r of rows) scores.set(r.id, Number(r.score));
      docs = docs.filter((d) => scores.has(d.id));
    }
    const match = (d: ProductSearchDoc, omit?: "brand" | "retailer") =>
      (!eff.category || d.categorySlugs.includes(eff.category)) &&
      (omit === "brand" || !eff.brands.length || (d.brandSlug !== null && eff.brands.includes(d.brandSlug))) &&
      (omit === "retailer" || !eff.retailers.length || d.retailers.some((r) => eff.retailers.includes(r))) &&
      (!eff.conditions.length || eff.conditions.includes(d.condition)) &&
      (eff.minPrice === undefined || (d.lowestPriceCents ?? -1) >= eff.minPrice) &&
      (eff.maxPrice === undefined || (d.lowestPriceCents !== null && d.lowestPriceCents <= eff.maxPrice)) &&
      (!eff.inStock || d.inStock) &&
      (!eff.freeShipping || d.freeShipping) &&
      (!eff.pickup || d.pickup) &&
      (eff.minDiscount === undefined || (d.dropRatio ?? -1) >= eff.minDiscount);

    const hits = docs.filter((d) => match(d));
    const num = (v: number | null, dir: 1 | -1) => (v === null ? Number.POSITIVE_INFINITY : v * dir);
    const sorters: Record<SearchQuery["sort"], (a: ProductSearchDoc, b: ProductSearchDoc) => number> = {
      relevance: (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || b.storeCount - a.storeCount,
      lowest_total: (a, b) => num(a.lowestTotalCents, 1) - num(b.lowestTotalCents, 1),
      price_asc: (a, b) => num(a.lowestPriceCents, 1) - num(b.lowestPriceCents, 1),
      price_desc: (a, b) => num(a.lowestPriceCents, -1) - num(b.lowestPriceCents, -1),
      best_deal: (a, b) => num(a.dealScore, -1) - num(b.dealScore, -1),
      popular: (a, b) => b.storeCount - a.storeCount,
      newest: (a, b) => b.createdAt - a.createdAt,
      biggest_drop: (a, b) => num(a.dropRatio, -1) - num(b.dropRatio, -1),
    };
    hits.sort(sorters[q.sort]);

    const count = (list: ProductSearchDoc[], key: (d: ProductSearchDoc) => string[]) => {
      const out: Record<string, number> = {};
      for (const d of list) for (const k of key(d)) out[k] = (out[k] ?? 0) + 1;
      return out;
    };
    const prices = hits.map((d) => d.lowestPriceCents).filter((x): x is number => x !== null);
    const facets: SearchFacets = {
      categories: buckets(count(hits, (d) => d.categorySlugs), labels.categories, eff.category ? [eff.category] : []),
      brands: buckets(count(docs.filter((d) => match(d, "brand")), (d) => (d.brandSlug ? [d.brandSlug] : [])), labels.brands, eff.brands),
      retailers: buckets(count(docs.filter((d) => match(d, "retailer")), (d) => d.retailers), labels.retailers, eff.retailers),
      conditions: buckets(count(hits, (d) => [d.condition]), CONDITION_LABELS, eff.conditions),
      price: {
        minCents: prices.length ? Math.min(...prices) : null,
        maxCents: prices.length ? Math.max(...prices) : null,
        buckets: PRICE_BUCKETS.map(([from, to]) => ({
          fromCents: from,
          toCents: to,
          count: prices.filter((p) => p >= from && (to === null || p < to)).length,
        })).filter((b) => b.count > 0),
      },
      inStockCount: hits.filter((d) => d.inStock).length,
    };
    const start = (q.page - 1) * q.pageSize;
    return { ids: hits.slice(start, start + q.pageSize).map((d) => d.id), total: hits.length, facets };
  }

  async suggest(q: string): Promise<SuggestResponse> {
    const items: Suggestion[] = [];
    let degraded = false;
    let productSugs: Suggestion[] = [];
    try {
      const res = await this.meili.index<ProductSearchDoc>(PRODUCTS_INDEX).search(q, {
        limit: 5,
        attributesToRetrieve: ["title", "slug", "lowestPriceCents"],
      });
      productSugs = res.hits.map((h) => ({ type: "product", text: h.title, slug: h.slug, imageUrl: null, lowestPriceCents: h.lowestPriceCents }));
    } catch {
      degraded = true;
      const docs = (await this.docs()).filter((d) => d.title.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
      productSugs = docs.map((d) => ({ type: "product", text: d.title, slug: d.slug, imageUrl: null, lowestPriceCents: d.lowestPriceCents }));
    }
    const [queries, cats, brands] = await Promise.all([
      this.prisma.searchEvent.groupBy({
        by: ["normalizedQuery"],
        where: { normalizedQuery: { startsWith: q.toLowerCase() }, resultCount: { gt: 0 } },
        _count: { _all: true },
        orderBy: { _count: { normalizedQuery: "desc" } },
        take: 3,
      }),
      this.prisma.category.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 3, select: { slug: true, name: true } }),
      this.prisma.brand.findMany({ where: { name: { contains: q, mode: "insensitive" } }, take: 3, select: { slug: true, name: true } }),
    ]);
    items.push(...queries.map((x): Suggestion => ({ type: "query", text: x.normalizedQuery })));
    items.push(...cats.map((c): Suggestion => ({ type: "category", text: c.name, slug: c.slug })));
    items.push(...brands.map((b): Suggestion => ({ type: "brand", text: b.name, slug: b.slug })));
    items.push(...productSugs);
    return { items, degraded };
  }

  async trending(): Promise<TrendingResponse> {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [queries, clicks] = await Promise.all([
      this.prisma.searchEvent.groupBy({
        by: ["normalizedQuery"],
        where: { createdAt: { gte: since }, resultCount: { gt: 0 } },
        _count: { _all: true },
        orderBy: { _count: { normalizedQuery: "desc" } },
        take: 10,
      }),
      this.prisma.affiliateClick.groupBy({
        by: ["productId"],
        where: { createdAt: { gte: since }, productId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { productId: "desc" } },
        take: 12,
      }),
    ]);
    const ids = clicks.map((c) => c.productId).filter((x): x is string => Boolean(x));
    if (ids.length < 12) {
      const m = await this.catalog.metrics.all();
      const fill = [...m.values()]
        .filter((x) => !ids.includes(x.productId))
        .sort((a, b) => b.storeCount - a.storeCount || (b.dealScore?.score ?? 0) - (a.dealScore?.score ?? 0))
        .slice(0, 12 - ids.length)
        .map((x) => x.productId);
      ids.push(...fill);
    }
    return {
      queries: queries.map((x) => ({ text: x.normalizedQuery, count: x._count._all })),
      products: await this.catalog.cards(ids),
    };
  }
}

const CONDITION_LABELS = new Map([
  ["new", "New"],
  ["refurbished", "Refurbished"],
  ["used", "Used"],
  ["open_box", "Open box"],
]);

function buckets(dist: Record<string, number> | undefined, labels: Map<string, string>, selected: string[]): FacetBucket[] {
  return Object.entries(dist ?? {})
    .map(([value, count]) => ({ value, label: labels.get(value) ?? value, count, selected: selected.includes(value) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function emptyFacets(): SearchFacets {
  return { categories: [], brands: [], retailers: [], conditions: [], price: { minCents: null, maxCents: null, buckets: [] }, inStockCount: 0 };
}

/** UPC-A / EAN-13 / GTIN-14 representations of the same code. */
export function gtinVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  const core = digits.replace(/^0+/, "");
  const out = new Set<string>([digits]);
  for (const len of [12, 13, 14]) if (core.length <= len) out.add(core.padStart(len, "0"));
  return [...out];
}
