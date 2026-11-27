import { Controller, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type {
  BrandDetailResponse,
  CategoryCount,
  CategoryDetailResponse,
  CategoryNode,
  CategorySummary,
  CategoryTreeResponse,
  CompareResponse,
  DealsResponse,
  HomeResponse,
  PriceDropItem,
  PriceDropsResponse,
  ProductDetailResponse,
  ProductHistoryResponse,
  RetailerDetailResponse,
  RetailerListResponse,
  RetailerSummary,
} from "@pricora/contracts";
import { Auth, type AuthedRequest } from "../common/auth";
import { notFound } from "../common/errors";
import { PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { dailyLowest, emptyStats, type ProductMetrics } from "../core/metrics";
import { effectiveFacets, parseFacetJson } from "../core/search-index";
import type { Prisma } from "@pricora/database";
import { conditionGroupOf, type ConditionGroup } from "@pricora/contracts";
import { CatalogService } from "../services/catalog.service";
import { ProductService } from "../services/product.service";

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<string, number | null> = { "7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365, all: null };
const DROP_WINDOW_MS: Record<string, number> = { "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS };

function page<T>(all: T[], pageNo: number, pageSize: number) {
  const start = (pageNo - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page: pageNo, pageSize, total: all.length, totalPages: Math.ceil(all.length / pageSize) };
}

@Controller()
export class CatalogController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(ProductService) private readonly products: ProductService,
  ) {}

  // ───────── categories / brands / retailers ─────────

  private async categorySummaries(): Promise<CategorySummary[]> {
    const [cats, counts] = await Promise.all([
      this.prisma.category.findMany({ where: { isActive: true }, orderBy: [{ depth: "asc" }, { sortOrder: "asc" }] }),
      this.prisma.product.groupBy({ by: ["categoryId"], where: { status: "active" }, _count: { _all: true } }),
    ]);
    const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return cats.map((c) => {
      const subtree = cats.filter((x) => x.id === c.id || x.path.startsWith(`${c.path}/`));
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentId: c.parentId,
        icon: c.icon,
        productCount: subtree.reduce((n, x) => n + (direct.get(x.id) ?? 0), 0),
      };
    });
  }

  @Get("categories")
  async categories(): Promise<CategoryTreeResponse> {
    const all = await this.categorySummaries();
    const build = (parentId: string | null): CategoryNode[] =>
      all.filter((c) => c.parentId === parentId).map((c) => ({ ...c, children: build(c.id) }));
    return { items: build(null) };
  }

  @Get("categories/:slug")
  async category(@Param() params: unknown): Promise<CategoryDetailResponse> {
    const { slug } = input("catalog.category", "params", params);
    const cat = await this.prisma.category.findUnique({ where: { slug } });
    if (!cat || !cat.isActive) throw notFound("Category");
    const all = await this.categorySummaries();
    const summary = all.find((c) => c.id === cat.id);
    if (!summary) throw notFound("Category");
    const pathSlugs = cat.path.split("/");
    const crumbs = await this.prisma.category.findMany({ where: { slug: { in: pathSlugs } }, select: { slug: true, name: true, facets: true } });
    const ids = (await this.catalog.categorySubtreeIds(slug)) ?? [];
    const brands = await this.prisma.product.groupBy({
      by: ["brandId"],
      where: { status: "active", categoryId: { in: ids }, brandId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { brandId: "desc" } },
      take: 16,
    });
    const brandRows = await this.prisma.brand.findMany({ where: { id: { in: brands.map((b) => b.brandId).filter((x): x is string => Boolean(x)) } } });
    const facetsBySlug = new Map(crumbs.map((c) => [c.slug, parseFacetJson(c.facets)]));
    return {
      category: { ...summary, description: cat.description, depth: cat.depth },
      breadcrumbs: pathSlugs.map((s) => crumbs.find((c) => c.slug === s)).filter((c): c is (typeof crumbs)[number] => Boolean(c)).map((c) => ({ slug: c.slug, name: c.name })),
      children: all.filter((c) => c.parentId === cat.id && c.productCount > 0),
      siblings: cat.parentId ? all.filter((c) => c.parentId === cat.parentId && c.productCount > 0) : [],
      topBrands: brands.flatMap((b) => {
        const row = brandRows.find((x) => x.id === b.brandId);
        return row ? [{ slug: row.slug, name: row.name, productCount: b._count._all, logoUrl: row.logoUrl }] : [];
      }),
      facets: effectiveFacets(pathSlugs, facetsBySlug),
      seoText: cat.seoText,
    };
  }

  /** Product counts per category (with parent) for a product filter — brand/store breakdowns. */
  private async categoryBreakdown(where: Prisma.ProductWhereInput): Promise<CategoryCount[]> {
    const [groups, cats] = await Promise.all([
      this.prisma.product.groupBy({ by: ["categoryId"], where: { status: "active", ...where }, _count: { _all: true } }),
      this.prisma.category.findMany({ select: { id: true, slug: true, name: true, parentId: true } }),
    ]);
    const byId = new Map(cats.map((c) => [c.id, c]));
    return groups
      .flatMap((g): CategoryCount[] => {
        const c = g.categoryId ? byId.get(g.categoryId) : undefined;
        if (!c) return [];
        const parent = c.parentId ? byId.get(c.parentId) : undefined;
        return [{ slug: c.slug, name: c.name, parent: parent ? { slug: parent.slug, name: parent.name } : null, count: g._count._all }];
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  @Get("brands/:slug")
  async brand(@Param() params: unknown): Promise<BrandDetailResponse> {
    const { slug } = input("catalog.brand", "params", params);
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) throw notFound("Brand");
    const [count, catIds] = await Promise.all([
      this.prisma.product.count({ where: { brandId: brand.id, status: "active" } }),
      this.prisma.product.findMany({ where: { brandId: brand.id, status: "active" }, select: { categoryId: true }, distinct: ["categoryId"] }),
    ]);
    const all = await this.categorySummaries();
    return {
      brand: { id: brand.id, slug: brand.slug, name: brand.name, logoUrl: brand.logoUrl, productCount: count, description: brand.description, website: brand.website },
      categories: all.filter((c) => catIds.some((x) => x.categoryId === c.id)),
      categoryBreakdown: await this.categoryBreakdown({ brandId: brand.id }),
    };
  }

  private async retailerSummaries(where: { slug?: string } = {}): Promise<(RetailerSummary & { _row: Awaited<ReturnType<PrismaClient["retailer"]["findMany"]>>[number] })[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.retailer.findMany({ where: { isActive: true, ...where }, orderBy: { name: "asc" } }),
      this.prisma.offer.groupBy({ by: ["retailerId"], where: { isActive: true }, _count: { _all: true } }),
    ]);
    const c = new Map(counts.map((x) => [x.retailerId, x._count._all]));
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      logoUrl: r.logoUrl,
      brandColor: r.brandColor,
      integrationStatus: r.integrationStatus,
      offerCount: c.get(r.id) ?? 0,
      freeShippingThresholdCents: r.freeShippingThresholdCents,
      membershipName: r.membershipName,
      _row: r,
    }));
  }

  @Get("retailers")
  async retailers(): Promise<RetailerListResponse> {
    const list = await this.retailerSummaries();
    return { items: list.map(({ _row, ...r }) => r) };
  }

  @Get("retailers/:slug")
  async retailer(@Param() params: unknown): Promise<RetailerDetailResponse> {
    const { slug } = input("catalog.retailer", "params", params);
    const [found] = await this.retailerSummaries({ slug });
    if (!found) throw notFound("Retailer");
    const { _row, ...summary } = found;
    const cats = await this.prisma.product.groupBy({
      by: ["categoryId"],
      where: { status: "active", offers: { some: { retailerId: _row.id, isActive: true } } },
      _count: { _all: true },
      orderBy: { _count: { categoryId: "desc" } },
      take: 8,
    });
    const all = await this.categorySummaries();
    return {
      retailer: { ...summary, websiteUrl: _row.websiteUrl, returnPolicyUrl: _row.returnPolicyUrl, affiliateDisclosure: _row.affiliateDisclosure },
      topCategories: cats.map((c) => all.find((x) => x.id === c.categoryId)).filter((x): x is CategorySummary => Boolean(x)),
      categoryBreakdown: await this.categoryBreakdown({ offers: { some: { retailerId: _row.id, isActive: true } } }),
      paymentOptions: (await this.catalog.paymentIndex()).get(_row.id) ?? [],
    };
  }

  // ───────── products ─────────

  @Get("products/:slug")
  @Auth("optional")
  product(@Param() params: unknown, @Query() query: unknown, @Req() req: AuthedRequest): Promise<ProductDetailResponse> {
    const { slug } = input("catalog.product", "params", params);
    const q = input("catalog.product", "query", query);
    return this.products.detail(slug, q.zip, req.user);
  }

  @Get("products/:slug/history")
  async history(@Param() params: unknown, @Query() query: unknown): Promise<ProductHistoryResponse> {
    const { slug } = input("catalog.productHistory", "params", params);
    const q = input("catalog.productHistory", "query", query);
    const p = await this.prisma.product.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!p || p.status !== "active") throw notFound("Product");
    const days = RANGE_DAYS[q.range] ?? null;
    const since = days === null ? undefined : new Date(Date.now() - days * DAY_MS);
    const primary = (await this.catalog.metrics.fresh([p.id])).get(p.id);
    // One condition group per chart: used/refurbished observations never enter the new-price history or stats.
    const cond = q.condition ?? primary?.condition ?? "new";
    const metrics = primary?.groups[cond];
    const offers = (
      await this.prisma.offer.findMany({
        where: { productId: p.id, ...(q.retailer ? { retailer: { slug: q.retailer } } : {}) },
        include: {
          retailer: { select: { slug: true, name: true, brandColor: true } },
          history: { where: since ? { observedAt: { gte: since } } : {}, orderBy: { observedAt: "asc" } },
        },
      })
    ).filter((o) => conditionGroupOf(o.condition) === cond);
    const all = offers.flatMap((o) => o.history.map((h) => ({ t: h.observedAt, priceCents: h.priceCents })));
    return {
      productId: p.id,
      range: q.range,
      currency: "USD",
      series: offers.map((o) => ({
        retailer: o.retailer,
        offerId: o.id,
        source: o.source,
        points: o.history.map((h) => ({ t: h.observedAt.toISOString(), priceCents: h.priceCents, shippingCents: h.shippingCents, stock: h.stock })),
      })),
      lowest: dailyLowest(all).map((x) => ({ t: x.t.toISOString(), priceCents: x.priceCents })),
      stats: metrics?.stats ?? emptyStats(),
    };
  }

  @Get("compare")
  async compare(@Query() query: unknown): Promise<CompareResponse> {
    const { ids } = input("catalog.compare", "query", query);
    const metrics = await this.catalog.metrics.fresh(ids);
    const [cards, attrs] = await Promise.all([
      this.catalog.cards(ids, metrics),
      this.prisma.productAttribute.findMany({ where: { productId: { in: ids } }, orderBy: { sortOrder: "asc" } }),
    ]);
    const keys: { group: string | null; name: string }[] = [];
    for (const a of attrs) if (!keys.some((k) => k.name === a.name && k.group === a.group)) keys.push({ group: a.group, name: a.name });
    return {
      products: cards.map((card) => ({
        card,
        attributes: attrs.filter((a) => a.productId === card.id).map((a) => ({ group: a.group, name: a.name, value: a.value, unit: a.unit })),
        priceStats: metrics.get(card.id)?.stats ?? emptyStats(),
        dealScore: metrics.get(card.id)?.dealScore ?? null,
      })),
      attributeKeys: keys,
    };
  }

  // ───────── home / deals / drops ─────────

  private priceDropItems(metrics: Map<string, ProductMetrics>, windowMs: number, minDrop = 0.01) {
    const since = Date.now() - windowMs;
    return [...metrics.values()]
      .filter((m) => m.recentDrop && m.recentDrop.droppedAt.getTime() >= since && m.recentDrop.dropRatio >= minDrop)
      .sort((a, b) => (b.recentDrop?.dropRatio ?? 0) - (a.recentDrop?.dropRatio ?? 0));
  }

  private async toDropItems(list: ProductMetrics[], metrics: Map<string, ProductMetrics>): Promise<PriceDropItem[]> {
    const cards = await this.catalog.cards(list.map((m) => m.productId), metrics);
    const retailers = await this.prisma.retailer.findMany({ select: { id: true, slug: true, name: true } });
    return cards.flatMap((card) => {
      const d = metrics.get(card.id)?.recentDrop;
      const r = d ? retailers.find((x) => x.id === d.retailerId) : undefined;
      if (!d || !r) return [];
      return [
        {
          product: card,
          previousPriceCents: d.previousPriceCents,
          currentPriceCents: d.currentPriceCents,
          dropCents: d.dropCents,
          dropRatio: d.dropRatio,
          retailer: { slug: r.slug, name: r.name },
          droppedAt: d.droppedAt.toISOString(),
          source: d.source as PriceDropItem["source"],
        },
      ];
    });
  }

  /** Product id → metrics of one condition group (deals/drops/home rails are new-only unless asked). */
  private async groupMetrics(g: ConditionGroup): Promise<Map<string, ProductMetrics>> {
    const all = await this.catalog.metrics.all();
    const out = new Map<string, ProductMetrics>();
    for (const [id, m] of all) {
      const gm = m.groups[g];
      if (gm) out.set(id, { ...gm, groups: {} });
    }
    return out;
  }

  @Get("home")
  @Auth("optional")
  async home(@Req() req: AuthedRequest): Promise<HomeResponse> {
    const metrics = await this.groupMetrics("new");
    const list = [...metrics.values()];
    const byScore = list.filter((m) => m.dealScore).sort((a, b) => (b.dealScore?.score ?? 0) - (a.dealScore?.score ?? 0));
    const under = (max: number) =>
      list
        .filter((m) => m.lowestPriceCents !== null && m.lowestPriceCents < max && m.inStock)
        .sort((a, b) => (b.dealScore?.score ?? 0) - (a.dealScore?.score ?? 0))
        .slice(0, 20)
        .map((m) => m.productId);

    const since = new Date(Date.now() - 7 * DAY_MS);
    const clicks = await this.prisma.affiliateClick.groupBy({
      by: ["productId"],
      where: { createdAt: { gte: since }, productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 20,
    });
    const trendingIds = clicks.map((c) => c.productId).filter((x): x is string => Boolean(x));
    for (const m of [...list].sort((a, b) => b.storeCount - a.storeCount || (b.dealScore?.score ?? 0) - (a.dealScore?.score ?? 0))) {
      if (trendingIds.length >= 20) break;
      if (!trendingIds.includes(m.productId)) trendingIds.push(m.productId);
    }

    const [trending, bestDeals, priceDrops, u25, u50, u100, cats, retailers, recent] = await Promise.all([
      this.catalog.cards(trendingIds, metrics),
      // Enough candidates for two deal rails on the home page (near-lowest + best deals) after de-duplication.
      this.catalog.dealItems(byScore.slice(0, 40).map((m) => m.productId), metrics),
      this.toDropItems(this.priceDropItems(metrics, 7 * DAY_MS).slice(0, 20), metrics),
      this.catalog.cards(under(2500), metrics),
      this.catalog.cards(under(5000), metrics),
      this.catalog.cards(under(10000), metrics),
      this.categorySummaries(),
      this.retailerSummaries(),
      req.user
        ? this.prisma.recentlyViewed.findMany({ where: { userId: req.user.id }, orderBy: { viewedAt: "desc" }, take: 12, select: { productId: true } })
        : Promise.resolve(null),
    ]);
    const all = [...trending, ...bestDeals.map((d) => d.product), ...priceDrops.map((d) => d.product), ...u25, ...u50, ...u100];
    return {
      trending,
      bestDeals,
      priceDrops,
      under25: u25,
      under50: u50,
      under100: u100,
      topCategories: cats.filter((c) => c.parentId === null),
      retailers: retailers.sort((a, b) => b.offerCount - a.offerCount).map(({ _row, ...r }) => r),
      ...(recent ? { recentlyViewed: await this.catalog.cards(recent.map((r) => r.productId)) } : {}),
      hasDemoData: all.some((c) => c.hasDemoData),
      generatedAt: new Date().toISOString(),
    };
  }

  @Get("deals")
  async deals(@Query() query: unknown): Promise<DealsResponse> {
    const q = input("catalog.deals", "query", query);
    const metrics = await this.groupMetrics(q.condition);
    let list = [...metrics.values()].filter((m) => m.dealScore && (q.minScore === undefined || m.dealScore.score >= q.minScore));
    if (q.category) {
      const catIds = new Set((await this.catalog.categorySubtreeIds(q.category)) ?? []);
      const ids = await this.prisma.product.findMany({ where: { categoryId: { in: [...catIds] } }, select: { id: true } });
      const allowed = new Set(ids.map((x) => x.id));
      list = list.filter((m) => allowed.has(m.productId));
    }
    const sorters: Record<typeof q.sort, (a: ProductMetrics, b: ProductMetrics) => number> = {
      score: (a, b) => (b.dealScore?.score ?? 0) - (a.dealScore?.score ?? 0),
      drop: (a, b) => (b.dropRatio ?? -1) - (a.dropRatio ?? -1),
      newest: (a, b) => (b.recentDrop?.droppedAt.getTime() ?? 0) - (a.recentDrop?.droppedAt.getTime() ?? 0),
      price_asc: (a, b) => (a.lowestPriceCents ?? 0) - (b.lowestPriceCents ?? 0),
    };
    list.sort(sorters[q.sort]);
    const pg = page(list, q.page, q.pageSize);
    return { ...pg, items: await this.catalog.dealItems(pg.items.map((m) => m.productId), metrics) };
  }

  @Get("price-drops")
  async priceDrops(@Query() query: unknown): Promise<PriceDropsResponse> {
    const q = input("catalog.priceDrops", "query", query);
    const metrics = await this.groupMetrics(q.condition);
    let list = this.priceDropItems(metrics, DROP_WINDOW_MS[q.window] ?? 7 * DAY_MS, q.minDropRatio ?? 0.01);
    if (q.category) {
      const catIds = (await this.catalog.categorySubtreeIds(q.category)) ?? [];
      const ids = new Set((await this.prisma.product.findMany({ where: { categoryId: { in: catIds } }, select: { id: true } })).map((x) => x.id));
      list = list.filter((m) => ids.has(m.productId));
    }
    const pg = page(list, q.page, q.pageSize);
    return { ...pg, items: await this.toDropItems(pg.items, metrics) };
  }
}
