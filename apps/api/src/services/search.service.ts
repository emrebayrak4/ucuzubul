import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { parseSearchQuery, type ParsedSearchQuery } from "@pricora/algorithms";
import type {
  CategoryFacetDef,
  ConditionGroup,
  FacetBucket,
  ParsedQuery,
  PriceHistogramBin,
  SearchFacets,
  SearchQuery,
  SearchResponse,
  SpecFacet,
  SuggestResponse,
  Suggestion,
  TrendingResponse,
} from "@pricora/contracts";
import type { Meilisearch } from "meilisearch";
import {
  buildSearchDocuments,
  effectiveFacets,
  parseFacetJson,
  PRICE_BUCKETS,
  PRODUCTS_INDEX,
  conditionMask,
  reindexProducts,
  type ProductSearchDoc,
} from "../core/search-index";
import { CONDITION_ORDER } from "../core/metrics";
import { buildVocabulary, suggestCorrection, type SpellVocabulary } from "../core/search-spell";
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
  popular: ["storeCount:desc", "dealScore:desc"],
  newest: ["createdAt:desc"],
  biggest_drop: ["dropRatio:desc"],
};

const HISTOGRAM_BINS = 24;

interface Effective {
  text: string;
  category?: string;
  brands: string[];
  retailers: string[];
  /** Selected condition groups (default ["new"]). */
  conditions: ConditionGroup[];
  /** Price / total fields for the selected groups (p_<mask>, t_<mask>). */
  pf: `p_${number}`;
  tf: `t_${number}`;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  freeShipping?: boolean;
  pickup?: boolean;
  payOverTime?: "payin4" | "any";
  minDiscount?: number;
  /** Selected spec values grouped by facet key → ["key.slug", …]. */
  specs: Map<string, string[]>;
}

/** Which filter group to leave out (disjunctive facet counts). */
type Omit = "brand" | "retailer" | "category" | "condition" | "price" | "pay" | `spec:${string}`;

interface Labels {
  at: number;
  categories: Map<string, string>;
  categoryParent: Map<string, string | null>;
  categoryPath: Map<string, string[]>;
  facetsBySlug: Map<string, CategoryFacetDef[]>;
  brands: Map<string, string>;
  brandLogos: Map<string, string | null>;
  retailers: Map<string, string>;
  retailerMeta: Map<string, { logoUrl: string | null; color: string | null }>;
}

interface DocsCache {
  at: number;
  docs: ProductSearchDoc[];
  specLabels: Map<string, string>;
  vocab: SpellVocabulary;
}

const esc = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

@Injectable()
export class SearchService implements OnApplicationBootstrap {
  private readonly log = new Logger("Search");
  private docsCache: DocsCache | null = null;
  private docsInflight: Promise<DocsCache> | null = null;
  private labels: Labels | null = null;

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
      this.docsCache = null;
      this.log.log(`Indexed ${n} products into Meilisearch`);
      return n;
    } catch (err) {
      this.log.warn(`Meilisearch indexing skipped: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async docsState(): Promise<DocsCache> {
    if (this.docsCache && Date.now() - this.docsCache.at < 120_000) return this.docsCache;
    if (!this.docsInflight) {
      this.docsInflight = (async () => {
        const docs = await buildSearchDocuments(this.prisma, await this.catalog.metrics.all());
        const specLabels = new Map<string, string>();
        for (const d of docs) d.specs.forEach((s, i) => specLabels.set(s, d.specLabels[i] ?? s));
        const labels = await this.labelMaps();
        const vocab = buildVocabulary([...docs.map((d) => `${d.title} ${d.brand ?? ""}`), ...labels.categories.values()]);
        const state = { at: Date.now(), docs, specLabels, vocab };
        this.docsCache = state;
        return state;
      })().finally(() => {
        this.docsInflight = null;
      });
    }
    return this.docsInflight;
  }

  private async docs(): Promise<ProductSearchDoc[]> {
    return (await this.docsState()).docs;
  }

  private async labelMaps(): Promise<Labels> {
    if (this.labels && Date.now() - this.labels.at < 300_000) return this.labels;
    const [c, b, r] = await Promise.all([
      this.prisma.category.findMany({ where: { isActive: true }, select: { slug: true, name: true, path: true, facets: true } }),
      this.prisma.brand.findMany({ select: { slug: true, name: true, logoUrl: true } }),
      this.prisma.retailer.findMany({ select: { slug: true, name: true, logoUrl: true, brandColor: true } }),
    ]);
    this.labels = {
      at: Date.now(),
      categories: new Map(c.map((x) => [x.slug, x.name])),
      categoryParent: new Map(c.map((x) => [x.slug, x.path.split("/").slice(-2, -1)[0] ?? null])),
      categoryPath: new Map(c.map((x) => [x.slug, x.path.split("/")])),
      facetsBySlug: new Map(c.map((x) => [x.slug, parseFacetJson(x.facets)])),
      brands: new Map(b.map((x) => [x.slug, x.name])),
      brandLogos: new Map(b.map((x) => [x.slug, x.logoUrl])),
      retailers: new Map(r.map((x) => [x.slug, x.name])),
      retailerMeta: new Map(r.map((x) => [x.slug, { logoUrl: x.logoUrl, color: x.brandColor }])),
    };
    return this.labels;
  }

  /** Effective spec facet definitions for a category slug (empty without a category). */
  private facetDefs(category: string | undefined, labels: Labels): CategoryFacetDef[] {
    if (!category) return [];
    const path = labels.categoryPath.get(category);
    return path ? effectiveFacets(path, labels.facetsBySlug) : [];
  }

  private effective(q: SearchQuery, parsed: ParsedSearchQuery | null): Effective {
    // Second-hand never wins "lowest price" by default: no condition param = new only; "all" = every condition.
    const raw = q.condition ?? ["new"];
    const conditions: ConditionGroup[] = raw.includes("all") ? [...CONDITION_ORDER] : CONDITION_ORDER.filter((g) => raw.includes(g));
    const specs = new Map<string, string[]>();
    for (const item of q.spec ?? []) {
      const dot = item.indexOf(".");
      if (dot <= 0 || dot === item.length - 1) continue;
      const key = item.slice(0, dot);
      if (!/^[a-z0-9-]+$/.test(key)) continue;
      specs.set(key, [...(specs.get(key) ?? []), item]);
    }
    const eff: Effective = {
      text: q.q ?? "",
      category: q.category,
      brands: q.brand ?? [],
      retailers: q.retailer ?? [],
      conditions,
      pf: `p_${conditionMask(conditions)}`,
      tf: `t_${conditionMask(conditions)}`,
      minPrice: q.minPrice,
      maxPrice: q.maxPrice,
      inStock: q.inStock,
      freeShipping: q.freeShipping,
      pickup: q.pickup,
      payOverTime: q.payOverTime,
      minDiscount: q.minDiscount,
      specs,
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

  private toParsed(parsed: ParsedSearchQuery, eff: Effective, labels: Labels): ParsedQuery {
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
      return this.finish({ items, facets: emptyFacets(), total: items.length, q, degraded: false, parsed: this.toParsed(parsed, eff, labels), didYouMean: null, started, userId });
    }

    const defs = this.facetDefs(eff.category, labels);
    let result: { ids: string[]; total: number; facets: SearchFacets } | null = null;
    let degraded = false;
    try {
      result = await this.searchMeili(q, eff, labels, defs);
    } catch (err) {
      this.log.warn(`Meilisearch unavailable, using Postgres fallback: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!result) {
      degraded = true;
      result = await this.searchFallback(q, eff, labels, defs);
    }
    const items = await this.catalog.cards(result.ids, undefined, { conditions: eff.conditions });
    if (!degraded && items.length < result.ids.length) {
      // Index references products that no longer exist (e.g. after a reseed) → rebuild in the background.
      this.catalog.metrics.invalidate();
      void this.ensureIndex(true);
    }
    let didYouMean: string | null = null;
    if (eff.text.trim()) {
      const fix = suggestCorrection(eff.text, (await this.docsState()).vocab);
      if (fix && fix !== eff.text.trim().toLowerCase()) didYouMean = fix;
    }
    return this.finish({
      items,
      facets: result.facets,
      total: result.total,
      q,
      degraded,
      parsed: parsed ? this.toParsed(parsed, eff, labels) : null,
      didYouMean,
      started,
      userId,
    });
  }

  private finish(a: {
    items: SearchResponse["items"];
    facets: SearchFacets;
    total: number;
    q: SearchQuery;
    degraded: boolean;
    parsed: ParsedQuery | null;
    didYouMean: string | null;
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
      didYouMean: a.didYouMean,
      tookMs,
    };
  }

  private filters(eff: Effective, omit?: Omit): string[] {
    const f: string[] = [];
    if (eff.category && omit !== "category") f.push(`categorySlugs = ${esc(eff.category)}`);
    if (eff.brands.length && omit !== "brand") f.push(`brandSlug IN [${eff.brands.map(esc).join(", ")}]`);
    if (eff.retailers.length && omit !== "retailer") f.push(`retailers IN [${eff.retailers.map(esc).join(", ")}]`);
    if (eff.conditions.length < 4 && omit !== "condition") f.push(`conditions IN [${eff.conditions.map(esc).join(", ")}]`);
    if (omit !== "price") {
      if (eff.minPrice !== undefined) f.push(`${eff.pf} >= ${eff.minPrice}`);
      if (eff.maxPrice !== undefined) f.push(`${eff.pf} <= ${eff.maxPrice}`);
    }
    if (eff.inStock) f.push("inStock = true");
    if (eff.freeShipping) f.push("freeShipping = true");
    if (eff.pickup) f.push("pickup = true");
    if (eff.payOverTime === "any" && omit !== "pay") f.push("payOverTime = true");
    if (eff.payOverTime === "payin4" && omit !== "pay") f.push("payIn4 = true");
    if (eff.minDiscount !== undefined) f.push(`dropRatio >= ${eff.minDiscount}`);
    for (const [key, items] of eff.specs) if (omit !== `spec:${key}`) f.push(`specs IN [${items.map(esc).join(", ")}]`);
    return f;
  }

  private matcher(eff: Effective) {
    return (d: ProductSearchDoc, omit?: Omit) =>
      (omit === "category" || !eff.category || d.categorySlugs.includes(eff.category)) &&
      (omit === "brand" || !eff.brands.length || (d.brandSlug !== null && eff.brands.includes(d.brandSlug))) &&
      (omit === "retailer" || !eff.retailers.length || d.retailers.some((r) => eff.retailers.includes(r))) &&
      (omit === "condition" || d.conditions.some((c) => (eff.conditions as string[]).includes(c))) &&
      (omit === "price" || eff.minPrice === undefined || (d[eff.pf] ?? -1) >= eff.minPrice) &&
      (omit === "price" || eff.maxPrice === undefined || (d[eff.pf] !== undefined && (d[eff.pf] as number) <= eff.maxPrice)) &&
      (!eff.inStock || d.inStock) &&
      (!eff.freeShipping || d.freeShipping) &&
      (!eff.pickup || d.pickup) &&
      (omit === "pay" || !eff.payOverTime || (eff.payOverTime === "payin4" ? d.payIn4 : d.payOverTime)) &&
      (eff.minDiscount === undefined || (d.dropRatio ?? -1) >= eff.minDiscount) &&
      [...eff.specs].every(([key, items]) => omit === `spec:${key}` || items.some((i) => d.specs.includes(i)));
  }

  private buildSpecFacets(defs: CategoryFacetDef[], eff: Effective, countsFor: (key: string) => Record<string, number>, specLabels: Map<string, string>): SpecFacet[] {
    return defs.flatMap((def) => {
      const dist = countsFor(def.key);
      const prefix = `${def.key}.`;
      const selected = eff.specs.get(def.key) ?? [];
      const buckets: FacetBucket[] = Object.entries(dist)
        .filter(([v, n]) => v.startsWith(prefix) && n > 0)
        .map(([value, count]) => ({ value, label: specLabels.get(value) ?? value.slice(prefix.length), count, selected: selected.includes(value) }));
      // Keep selected values visible even when their count dropped to 0.
      for (const s of selected) if (!buckets.some((b) => b.value === s)) buckets.push({ value: s, label: specLabels.get(s) ?? s.slice(prefix.length), count: 0, selected: true });
      if (buckets.length < 2 && !selected.length) return [];
      return [{ key: def.key, label: def.label, buckets: sortBuckets(buckets, def) }];
    });
  }

  private async searchMeili(q: SearchQuery, eff: Effective, labels: Labels, defs: CategoryFacetDef[]) {
    const index = this.meili.index<ProductSearchDoc>(PRODUCTS_INDEX);
    const stats = await index.getStats();
    if (stats.numberOfDocuments === 0) {
      void this.ensureIndex(true);
      return null;
    }
    const sort = q.sort === "price_asc" ? [`${eff.pf}:asc`] : q.sort === "price_desc" ? [`${eff.pf}:desc`] : q.sort === "lowest_total" ? [`${eff.tf}:asc`] : SORTS[q.sort];
    const main = await index.search(eff.text, {
      filter: this.filters(eff),
      facets: ["categorySlugs", "condition", "priceBucket", "inStock", "freeShipping", "payOverTime", "payIn4", "specs"],
      ...(sort ? { sort } : {}),
      page: q.page,
      hitsPerPage: q.pageSize,
      attributesToRetrieve: ["id"],
    });
    // Disjunctive facets: each group's counts ignore its own selection.
    const selectedSpecKeys = [...eff.specs.keys()];
    const [brandRes, retailerRes, priceRes, conditionRes, ...specRes] = await Promise.all([
      index.search(eff.text, { filter: this.filters(eff, "brand"), facets: ["brandSlug"], limit: 0 }),
      index.search(eff.text, { filter: this.filters(eff, "retailer"), facets: ["retailers"], limit: 0 }),
      index.search(eff.text, { filter: this.filters(eff, "price"), facets: [eff.pf], limit: 0 }),
      index.search(eff.text, { filter: this.filters(eff, "condition"), facets: ["conditions"], limit: 0 }),
      ...selectedSpecKeys.map((k) => index.search(eff.text, { filter: this.filters(eff, `spec:${k}`), facets: ["specs"], limit: 0 })),
    ]);
    const payDist = eff.payOverTime ? ((await index.search(eff.text, { filter: this.filters(eff, "pay"), facets: ["payOverTime", "payIn4"], limit: 0 })).facetDistribution ?? {}) : null;
    const dist = main.facetDistribution ?? {};
    const priceDist = priceRes.facetDistribution?.[eff.pf] ?? {};
    const prices: number[] = [];
    for (const [v, n] of Object.entries(priceDist)) for (let i = 0; i < n; i++) prices.push(Number(v));
    const { specLabels } = await this.docsState();
    const specDist = (key: string): Record<string, number> => {
      const i = selectedSpecKeys.indexOf(key);
      return (i >= 0 ? specRes[i]?.facetDistribution?.["specs"] : dist["specs"]) ?? {};
    };
    const facets: SearchFacets = {
      categories: buckets(dist["categorySlugs"], labels.categories, eff.category ? [eff.category] : []),
      brands: withBrandLogos(buckets(brandRes.facetDistribution?.["brandSlug"], labels.brands, eff.brands), labels),
      retailers: withRetailerMeta(buckets(retailerRes.facetDistribution?.["retailers"], labels.retailers, eff.retailers), labels),
      conditions: conditionBuckets(conditionRes.facetDistribution?.["conditions"], eff.conditions),
      price: priceFacet(prices, dist["priceBucket"]),
      inStockCount: dist["inStock"]?.["true"] ?? 0,
      freeShippingCount: dist["freeShipping"]?.["true"] ?? 0,
      payOverTimeCount: (payDist ?? dist)["payOverTime"]?.["true"] ?? 0,
      payIn4Count: (payDist ?? dist)["payIn4"]?.["true"] ?? 0,
      specs: this.buildSpecFacets(defs, eff, specDist, specLabels),
    };
    return { ids: main.hits.map((h) => h.id), total: main.totalHits ?? 0, facets };
  }

  private async searchFallback(q: SearchQuery, eff: Effective, labels: Labels, defs: CategoryFacetDef[]) {
    const state = await this.docsState();
    let docs = state.docs;
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
        LIMIT 1000`;
      for (const r of rows) scores.set(r.id, Number(r.score));
      docs = docs.filter((d) => scores.has(d.id));
    }
    const match = this.matcher(eff);
    const hits = docs.filter((d) => match(d));
    const num = (v: number | null, dir: 1 | -1) => (v === null ? Number.POSITIVE_INFINITY : v * dir);
    const sorters: Record<SearchQuery["sort"], (a: ProductSearchDoc, b: ProductSearchDoc) => number> = {
      relevance: (a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || b.storeCount - a.storeCount,
      lowest_total: (a, b) => num(a[eff.tf] ?? null, 1) - num(b[eff.tf] ?? null, 1),
      price_asc: (a, b) => num(a[eff.pf] ?? null, 1) - num(b[eff.pf] ?? null, 1),
      price_desc: (a, b) => num(a[eff.pf] ?? null, -1) - num(b[eff.pf] ?? null, -1),
      best_deal: (a, b) => num(a.dealScore, -1) - num(b.dealScore, -1),
      popular: (a, b) => b.storeCount - a.storeCount || num(a.dealScore, -1) - num(b.dealScore, -1),
      newest: (a, b) => b.createdAt - a.createdAt,
      biggest_drop: (a, b) => num(a.dropRatio, -1) - num(b.dropRatio, -1),
    };
    hits.sort(sorters[q.sort]);

    const count = (list: ProductSearchDoc[], key: (d: ProductSearchDoc) => string[]) => {
      const out: Record<string, number> = {};
      for (const d of list) for (const k of key(d)) out[k] = (out[k] ?? 0) + 1;
      return out;
    };
    const priceSet = docs.filter((d) => match(d, "price"));
    const prices = priceSet.map((d) => d[eff.pf]).filter((x): x is number => typeof x === "number");
    const facets: SearchFacets = {
      categories: buckets(count(hits, (d) => d.categorySlugs), labels.categories, eff.category ? [eff.category] : []),
      brands: withBrandLogos(buckets(count(docs.filter((d) => match(d, "brand")), (d) => (d.brandSlug ? [d.brandSlug] : [])), labels.brands, eff.brands), labels),
      retailers: withRetailerMeta(buckets(count(docs.filter((d) => match(d, "retailer")), (d) => d.retailers), labels.retailers, eff.retailers), labels),
      conditions: conditionBuckets(count(docs.filter((d) => match(d, "condition")), (d) => d.conditions), eff.conditions),
      price: priceFacet(prices, count(hits, (d) => (d.priceBucket ? [d.priceBucket] : []))),
      inStockCount: hits.filter((d) => d.inStock).length,
      freeShippingCount: hits.filter((d) => d.freeShipping).length,
      payOverTimeCount: (eff.payOverTime ? docs.filter((d) => match(d, "pay")) : hits).filter((d) => d.payOverTime).length,
      payIn4Count: (eff.payOverTime ? docs.filter((d) => match(d, "pay")) : hits).filter((d) => d.payIn4).length,
      specs: this.buildSpecFacets(
        defs,
        eff,
        (key) => count(eff.specs.has(key) ? docs.filter((d) => match(d, `spec:${key}`)) : hits, (d) => d.specs),
        state.specLabels,
      ),
    };
    const start = (q.page - 1) * q.pageSize;
    return { ids: hits.slice(start, start + q.pageSize).map((d) => d.id), total: hits.length, facets };
  }

  async suggest(q: string): Promise<SuggestResponse> {
    const items: Suggestion[] = [];
    let degraded = false;
    const state = await this.docsState().catch(() => null);
    const docById = new Map((state?.docs ?? []).map((d) => [d.id, d]));
    let productIds: string[] = [];
    try {
      const res = await this.meili.index<ProductSearchDoc>(PRODUCTS_INDEX).search(q, { limit: 6, attributesToRetrieve: ["id"] });
      productIds = res.hits.map((h) => h.id);
    } catch {
      degraded = true;
      const needle = q.toLowerCase();
      productIds = (state?.docs ?? []).filter((d) => d.title.toLowerCase().includes(needle)).sort((a, b) => b.storeCount - a.storeCount).slice(0, 6).map((d) => d.id);
    }
    const cards = await this.catalog.cards(productIds);
    const labels = await this.labelMaps();
    const catCounts = new Map<string, number>();
    const brandCounts = new Map<string, number>();
    for (const d of state?.docs ?? []) {
      for (const s of d.categorySlugs) catCounts.set(s, (catCounts.get(s) ?? 0) + 1);
      if (d.brandSlug) brandCounts.set(d.brandSlug, (brandCounts.get(d.brandSlug) ?? 0) + 1);
    }
    const needle = q.toLowerCase();
    const cats = [...labels.categories.entries()]
      .filter(([slug, name]) => (catCounts.get(slug) ?? 0) > 0 && (name.toLowerCase().includes(needle) || slug.includes(needle.replace(/\s+/g, "-"))))
      .sort((a, b) => Number(b[1].toLowerCase().startsWith(needle)) - Number(a[1].toLowerCase().startsWith(needle)) || (catCounts.get(b[0]) ?? 0) - (catCounts.get(a[0]) ?? 0))
      .slice(0, 4);
    // Categories of the matching products ("in Laptops") when names don't match directly.
    if (cats.length < 2) {
      for (const id of productIds) {
        const slug = docById.get(id)?.categorySlug;
        if (slug && !cats.some(([s]) => s === slug) && cats.length < 3) cats.push([slug, labels.categories.get(slug) ?? slug]);
      }
    }
    const brands = [...labels.brands.entries()]
      .filter(([slug, name]) => (brandCounts.get(slug) ?? 0) > 0 && name.toLowerCase().includes(needle))
      .sort((a, b) => Number(b[1].toLowerCase().startsWith(needle)) - Number(a[1].toLowerCase().startsWith(needle)) || (brandCounts.get(b[0]) ?? 0) - (brandCounts.get(a[0]) ?? 0))
      .slice(0, 4);
    const queries = await this.prisma.searchEvent.groupBy({
      by: ["normalizedQuery"],
      where: { normalizedQuery: { startsWith: needle }, resultCount: { gt: 0 } },
      _count: { _all: true },
      orderBy: { _count: { normalizedQuery: "desc" } },
      take: 4,
    });
    items.push(...queries.filter((x) => x.normalizedQuery !== needle).slice(0, 3).map((x): Suggestion => ({ type: "query", text: x.normalizedQuery })));
    items.push(
      ...cats.map(([slug, name]): Suggestion => {
        const parent = labels.categoryParent.get(slug);
        return { type: "category", text: name, slug, parent: parent ? labels.categories.get(parent) ?? null : null, count: catCounts.get(slug) ?? 0 };
      }),
    );
    items.push(...brands.map(([slug, name]): Suggestion => ({ type: "brand", text: name, slug, count: brandCounts.get(slug) ?? 0 })));
    items.push(
      ...cards.map(
        (c): Suggestion => ({
          type: "product",
          text: c.title,
          slug: c.slug,
          imageUrl: c.image?.url ?? null,
          lowestPriceCents: c.lowestPriceCents,
          storeCount: c.storeCount,
          category: c.category?.name ?? null,
          hasDemoData: c.hasDemoData,
        }),
      ),
    );
    if (!productIds.length && state) {
      const fix = suggestCorrection(q, state.vocab);
      if (fix) items.unshift({ type: "query", text: fix });
    }
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

/** Condition facet in fixed display order (New, Open box, Refurbished, Used), counts per group. */
function conditionBuckets(dist: Record<string, number> | undefined, selected: ConditionGroup[]): FacetBucket[] {
  return CONDITION_ORDER.map((g) => ({ value: g, label: CONDITION_LABELS.get(g) ?? g, count: dist?.[g] ?? 0, selected: selected.includes(g) }));
}

function buckets(dist: Record<string, number> | undefined, labels: Map<string, string>, selected: string[]): FacetBucket[] {
  const list = Object.entries(dist ?? {})
    .filter(([, count]) => count > 0)
    .map(([value, count]) => ({ value, label: labels.get(value) ?? value, count, selected: selected.includes(value) }));
  for (const s of selected) if (!list.some((b) => b.value === s)) list.push({ value: s, label: labels.get(s) ?? s, count: 0, selected: true });
  return list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function withBrandLogos(list: FacetBucket[], labels: Labels): FacetBucket[] {
  return list.map((b) => ({ ...b, logoUrl: labels.brandLogos.get(b.value) ?? null }));
}

function withRetailerMeta(list: FacetBucket[], labels: Labels): FacetBucket[] {
  return list.map((b) => {
    const m = labels.retailerMeta.get(b.value);
    return { ...b, logoUrl: m?.logoUrl ?? null, color: m?.color ?? null };
  });
}

/** Leading number of a spec label, normalized so "1 TB" > "512 GB" and "6.3 in" sorts numerically. */
export function numericValue(label: string): number {
  const m = /(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|k\b)?/i.exec(label.replace(/,(?=\d{3}\b)/g, ""));
  if (!m) return Number.POSITIVE_INFINITY;
  const n = Number(m[1]!.replace(",", "."));
  const unit = m[2]?.toLowerCase();
  return unit === "tb" ? n * 1000 : unit === "mb" ? n / 1000 : n;
}

function sortBuckets(list: FacetBucket[], def: CategoryFacetDef): FacetBucket[] {
  const out = [...list];
  if (def.sort === "numeric") out.sort((a, b) => numericValue(a.label) - numericValue(b.label) || a.label.localeCompare(b.label));
  else if (def.sort === "alpha") out.sort((a, b) => a.label.localeCompare(b.label));
  else if (def.sort === "custom" && def.order?.length) {
    const rank = (l: string) => {
      const i = def.order!.findIndex((o) => l.toLowerCase().startsWith(o.toLowerCase()));
      return i < 0 ? 999 : i;
    };
    out.sort((a, b) => rank(a.label) - rank(b.label) || b.count - a.count);
  } else out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return out;
}

/** Price facet: range + fixed buckets + equal-width histogram (bins aligned to whole dollars). */
export function priceFacet(prices: number[], bucketDist: Record<string, number> | undefined): SearchFacets["price"] {
  if (!prices.length) return { minCents: null, maxCents: null, buckets: [], histogram: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const p of prices) {
    if (p < min) min = p;
    if (p > max) max = p;
  }
  const from = Math.floor(min / 100) * 100;
  const span = Math.max(100, Math.ceil(max / 100) * 100 - from);
  const width = Math.max(100, Math.ceil(span / HISTOGRAM_BINS / 100) * 100);
  const bins = Math.max(1, Math.min(HISTOGRAM_BINS, Math.ceil((max - from + 1) / width)));
  const histogram: PriceHistogramBin[] = Array.from({ length: bins }, (_, i) => ({ fromCents: from + i * width, toCents: from + (i + 1) * width, count: 0 }));
  for (const p of prices) {
    const i = Math.min(bins - 1, Math.floor((p - from) / width));
    histogram[i]!.count++;
  }
  return {
    minCents: Math.round(min),
    maxCents: Math.round(max),
    buckets: PRICE_BUCKETS.map(([f, t]) => ({ fromCents: f, toCents: t, count: bucketDist?.[`${f}-${t ?? ""}`] ?? 0 })).filter((b) => b.count > 0),
    histogram,
  };
}

function emptyFacets(): SearchFacets {
  return {
    categories: [],
    brands: [],
    retailers: [],
    conditions: [],
    price: { minCents: null, maxCents: null, buckets: [], histogram: [] },
    inStockCount: 0,
    freeShippingCount: 0,
    payOverTimeCount: 0,
    payIn4Count: 0,
    specs: [],
  };
}

/** UPC-A / EAN-13 / GTIN-14 representations of the same code. */
export function gtinVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  const core = digits.replace(/^0+/, "");
  const out = new Set<string>([digits]);
  for (const len of [12, 13, 14]) if (core.length <= len) out.add(core.padStart(len, "0"));
  return [...out];
}
