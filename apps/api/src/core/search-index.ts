/**
 * Meilisearch product index: document shape, settings and full reindex. Shared by API and worker.
 */
import type { Meilisearch } from "meilisearch";
import type { CategoryFacetDef } from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";
import { slugify } from "@pricora/utils";
import { CONDITION_ORDER, computeProductMetrics, type ProductMetrics } from "./metrics";
import type { ConditionGroup } from "@pricora/contracts";
import { applicableOptions, loadPaymentIndex, payIn4For } from "./payment-options";

export const PRODUCTS_INDEX = "products";

/** Price facet buckets in cents: [from, to) — last bucket open-ended. */
export const PRICE_BUCKETS: [number, number | null][] = [[0, 2500], [2500, 5000], [5000, 10000], [10000, 25000], [25000, 50000], [50000, 100000], [100000, null]];

export function priceBucketKey(cents: number | null): string | null {
  if (cents === null) return null;
  const b = PRICE_BUCKETS.find(([from, to]) => cents >= from && (to === null || cents < to));
  return b ? `${b[0]}-${b[1] ?? ""}` : null;
}

export interface ProductSearchDoc {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  brandSlug: string | null;
  category: string | null;
  categorySlug: string | null;
  /** Category slug + all ancestor slugs (for subtree filtering). */
  categorySlugs: string[];
  retailers: string[];
  condition: string;
  identifiers: string[];
  model: string | null;
  lowestPriceCents: number | null;
  lowestTotalCents: number | null;
  priceBucket: string | null;
  storeCount: number;
  inStock: boolean;
  freeShipping: boolean;
  pickup: boolean;
  /** Some store offers a pay-over-time option (BNPL / financing) for its price. */
  payOverTime: boolean;
  /** Some store offers interest-free pay-in-4 for its total (known limits). */
  payIn4: boolean;
  dealScore: number | null;
  dropRatio: number | null;
  hasDemoData: boolean;
  /** Condition groups with an active offer (new / open_box / refurbished / used). */
  conditions: string[];
  /** Lowest price / total per condition-group mask (see conditionMask), e.g. p_1 = new only, p_15 = any. */
  [priceField: `p_${number}` | `t_${number}`]: number | undefined;
  /** Spec facet values as `key.value-slug` (keys from the category's effective facet definitions). */
  specs: string[];
  /** Display labels for `specs`, same order (not filterable; used for facet labels and key specs). */
  specLabels: string[];
  /** First-listed time (earliest offer) — drives "Newly added". */
  createdAt: number;
  updatedAt: number;
}

/** Bit mask of condition groups: new=1, open_box=2, refurbished=4, used=8 (15 = all). */
export function conditionMask(groups: ConditionGroup[]): number {
  return groups.reduce((m, g) => m | (1 << CONDITION_ORDER.indexOf(g)), 0) || 1;
}

const MASKS = Array.from({ length: 15 }, (_, i) => i + 1);
const PRICE_FIELDS = MASKS.flatMap((m) => [`p_${m}`, `t_${m}`]);

/** Lowest price/total over the groups in each mask (only for masks with offers). */
function maskPrices(pm: ProductMetrics | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!pm) return out;
  for (const m of MASKS) {
    let p: number | null = null;
    let t: number | null = null;
    CONDITION_ORDER.forEach((g, i) => {
      if (!(m & (1 << i))) return;
      const gm = pm.groups[g];
      if (gm?.lowestPriceCents != null && (p === null || gm.lowestPriceCents < p)) p = gm.lowestPriceCents;
      if (gm?.lowestTotalCents != null && (t === null || gm.lowestTotalCents < t)) t = gm.lowestTotalCents;
    });
    if (p !== null) out[`p_${m}`] = p;
    if (t !== null) out[`t_${m}`] = t;
  }
  return out;
}

/** Spec value → URL-safe slug used in `spec=key.slug`. */
export function specSlug(value: string): string {
  return slugify(value) || "x";
}

/** Effective facet definitions for a category path (root → leaf); deeper definitions override by key. */
export function effectiveFacets(pathSlugs: string[], facetsBySlug: Map<string, CategoryFacetDef[]>): CategoryFacetDef[] {
  const out = new Map<string, CategoryFacetDef>();
  for (const slug of pathSlugs) for (const f of facetsBySlug.get(slug) ?? []) out.set(f.key, f);
  return [...out.values()];
}

/** Parses Category.facets JSON defensively (admin-editable). */
export function parseFacetJson(raw: unknown): CategoryFacetDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f): CategoryFacetDef[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    if (typeof o["key"] !== "string" || typeof o["label"] !== "string" || typeof o["attribute"] !== "string") return [];
    const sort = o["sort"] === "alpha" || o["sort"] === "numeric" || o["sort"] === "custom" ? o["sort"] : "count";
    const order = Array.isArray(o["order"]) ? o["order"].filter((x): x is string => typeof x === "string") : undefined;
    return [{ key: o["key"], label: o["label"], attribute: o["attribute"], sort, ...(order ? { order } : {}) }];
  });
}

export const SEARCH_SETTINGS = {
  searchableAttributes: ["title", "brand", "model", "identifiers", "category", "description"],
  filterableAttributes: [
    "categorySlugs",
    "brandSlug",
    "retailers",
    "condition",
    "lowestPriceCents",
    "inStock",
    "freeShipping",
    "pickup",
    "payOverTime",
    "payIn4",
    "dropRatio",
    "priceBucket",
    "dealScore",
    "specs",
    "conditions",
    ...PRICE_FIELDS,
    "id",
  ],
  sortableAttributes: ["lowestPriceCents", "lowestTotalCents", "dealScore", "dropRatio", "storeCount", "createdAt", "updatedAt", ...PRICE_FIELDS],
  synonyms: {
    tv: ["television", "televisions", "tvs"],
    television: ["tv"],
    laptop: ["notebook", "macbook", "ultrabook"],
    notebook: ["laptop"],
    headphones: ["earbuds", "headset", "earphones"],
    earbuds: ["headphones", "airpods"],
    phone: ["smartphone", "iphone", "galaxy", "pixel"],
    smartphone: ["phone"],
    watch: ["smartwatch"],
    smartwatch: ["watch"],
    ps5: ["playstation 5", "playstation"],
    playstation: ["ps5"],
    vacuum: ["vacuum cleaner", "roomba"],
    fridge: ["refrigerator"],
  },
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
  faceting: { maxValuesPerFacet: 3000 },
  pagination: { maxTotalHits: 5000 },
};

export async function buildSearchDocuments(
  prisma: PrismaClient,
  metrics?: Map<string, ProductMetrics>,
): Promise<ProductSearchDoc[]> {
  const m = metrics ?? (await computeProductMetrics(prisma));
  const [products, categories, retailers] = await Promise.all([
    prisma.product.findMany({
      where: { status: "active" },
      include: { brand: true, category: true, identifiers: { select: { value: true } }, attributes: { select: { name: true, value: true } } },
    }),
    prisma.category.findMany({ select: { id: true, slug: true, path: true, facets: true } }),
    prisma.retailer.findMany({ select: { id: true, slug: true } }),
  ]);
  const [pay, payOffers] = await Promise.all([
    loadPaymentIndex(prisma).catch(() => new Map()),
    prisma.offer.findMany({ where: { isActive: true }, select: { productId: true, retailerId: true, priceCents: true, shippingCents: true } }),
  ]);
  const payOverTime = new Set<string>();
  const payIn4Set = new Set<string>();
  for (const o of payOffers) {
    const total = o.priceCents + (o.shippingCents ?? 0);
    if (applicableOptions(pay.get(o.retailerId), total).length) payOverTime.add(o.productId);
    if (payIn4For(pay.get(o.retailerId), total)) payIn4Set.add(o.productId);
  }
  const retailerSlug = new Map(retailers.map((r) => [r.id, r.slug]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const facetsBySlug = new Map(categories.map((c) => [c.slug, parseFacetJson(c.facets)]));
  const facetCache = new Map<string, CategoryFacetDef[]>();
  return products.map((p) => {
    const pm = m.get(p.id);
    const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
    let defs: CategoryFacetDef[] = [];
    if (cat) {
      defs = facetCache.get(cat.path) ?? effectiveFacets(cat.path.split("/"), facetsBySlug);
      facetCache.set(cat.path, defs);
    }
    const specs: string[] = [];
    const specLabels: string[] = [];
    for (const d of defs) {
      const a = p.attributes.find((x) => x.name === d.attribute);
      if (!a) continue;
      specs.push(`${d.key}.${specSlug(a.value)}`);
      specLabels.push(a.value);
    }
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description ?? "",
      brand: p.brand?.name ?? null,
      brandSlug: p.brand?.slug ?? null,
      category: p.category?.name ?? null,
      categorySlug: p.category?.slug ?? null,
      categorySlugs: cat ? cat.path.split("/") : [],
      retailers: (pm?.retailerIds ?? []).map((id) => retailerSlug.get(id)).filter((s): s is string => Boolean(s)),
      condition: p.condition,
      identifiers: p.identifiers.map((i) => i.value),
      model: p.model,
      lowestPriceCents: pm?.lowestPriceCents ?? null,
      lowestTotalCents: pm?.lowestTotalCents ?? null,
      priceBucket: priceBucketKey(pm?.lowestPriceCents ?? null),
      storeCount: pm?.storeCount ?? 0,
      inStock: pm?.inStock ?? false,
      freeShipping: pm?.freeShipping ?? false,
      pickup: pm?.pickup ?? false,
      payOverTime: payOverTime.has(p.id),
      payIn4: payIn4Set.has(p.id),
      dealScore: pm?.dealScore?.score ?? null,
      dropRatio: pm?.dropRatio ?? null,
      hasDemoData: pm?.hasDemoData ?? p.isDemo,
      specs,
      specLabels,
      conditions: pm ? CONDITION_ORDER.filter((g) => pm.groups[g]) : [],
      ...maskPrices(pm),
      createdAt: p.createdAt.getTime(),
      updatedAt: p.updatedAt.getTime(),
    };
  });
}

/** Creates/updates the index settings and replaces all documents. Returns the number of documents indexed. */
export async function reindexProducts(
  prisma: PrismaClient,
  meili: Meilisearch,
  metrics?: Map<string, ProductMetrics>,
): Promise<number> {
  const docs = await buildSearchDocuments(prisma, metrics);
  const index = meili.index<ProductSearchDoc>(PRODUCTS_INDEX);
  await meili.createIndex(PRODUCTS_INDEX, { primaryKey: "id" }).waitTask().catch(() => undefined);
  await index.updateSettings(SEARCH_SETTINGS).waitTask();
  await index.deleteAllDocuments().waitTask();
  if (docs.length > 0) await index.addDocuments(docs, { primaryKey: "id" }).waitTask();
  return docs.length;
}
