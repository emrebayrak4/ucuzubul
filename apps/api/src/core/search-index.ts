/**
 * Meilisearch product index: document shape, settings and full reindex. Shared by API and worker.
 */
import type { Meilisearch } from "meilisearch";
import type { PrismaClient } from "@pricora/database";
import { computeProductMetrics, type ProductMetrics } from "./metrics";

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
  dealScore: number | null;
  dropRatio: number | null;
  hasDemoData: boolean;
  createdAt: number;
  updatedAt: number;
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
    "dropRatio",
    "priceBucket",
    "dealScore",
    "id",
  ],
  sortableAttributes: ["lowestPriceCents", "lowestTotalCents", "dealScore", "dropRatio", "storeCount", "createdAt", "updatedAt"],
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
};

export async function buildSearchDocuments(
  prisma: PrismaClient,
  metrics?: Map<string, ProductMetrics>,
): Promise<ProductSearchDoc[]> {
  const m = metrics ?? (await computeProductMetrics(prisma));
  const [products, categories, retailers] = await Promise.all([
    prisma.product.findMany({
      where: { status: "active" },
      include: { brand: true, category: true, identifiers: { select: { value: true } } },
    }),
    prisma.category.findMany({ select: { id: true, slug: true, path: true } }),
    prisma.retailer.findMany({ select: { id: true, slug: true } }),
  ]);
  const retailerSlug = new Map(retailers.map((r) => [r.id, r.slug]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  return products.map((p) => {
    const pm = m.get(p.id);
    const cat = p.categoryId ? catById.get(p.categoryId) : undefined;
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
      dealScore: pm?.dealScore?.score ?? null,
      dropRatio: pm?.dropRatio ?? null,
      hasDemoData: pm?.hasDemoData ?? p.isDemo,
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
