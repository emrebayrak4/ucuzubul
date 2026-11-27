import { Inject, Injectable } from "@nestjs/common";
import type { ProductDetailResponse } from "@pricora/contracts";
import type { User } from "@pricora/database";
import { notFound } from "../common/errors";
import { PRISMA, type PrismaClient } from "../common/infra";
import { couponInclude, liveWhere, toCoupon } from "../core/coupons";
import { CONDITION_ORDER, EMPTY_FAKE_DISCOUNT, emptyStats, type ProductMetrics } from "../core/metrics";
import { CatalogService, offerInclude, recentPreviousPrice } from "./catalog.service";

@Injectable()
export class ProductService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  /** Full product detail: offers with totals, price stats, Deal Score, fake-discount check, variants, related. */
  async detail(slug: string, zipInput: string | null | undefined, user: User | undefined): Promise<ProductDetailResponse> {
    const p = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        brand: { select: { slug: true, name: true, logoUrl: true } },
        category: true,
        images: { orderBy: { sortOrder: "asc" } },
        identifiers: { include: { retailer: { select: { slug: true } } } },
        attributes: { orderBy: { sortOrder: "asc" } },
        variant: true,
        offers: { where: { isActive: true }, include: offerInclude },
      },
    });
    if (!p || p.status !== "active") throw notFound("Product");

    let zip = zipInput?.trim() || null;
    if (!zip && user) zip = (await this.prisma.userPreference.findUnique({ where: { userId: user.id } }))?.zip ?? null;

    const [metrics, pay] = await Promise.all([this.catalog.metrics.fresh([p.id]).then((x) => x.get(p.id)), this.catalog.paymentIndex()]);
    const crumbSlugs = p.category ? p.category.path.split("/") : [];
    const [crumbs, siblings, allMetrics] = await Promise.all([
      this.prisma.category.findMany({ where: { slug: { in: crumbSlugs } }, select: { slug: true, name: true } }),
      p.variant
        ? this.prisma.productVariant.findMany({
            where: { familyKey: p.variant.familyKey },
            orderBy: { sortOrder: "asc" },
            include: { product: { select: { id: true, slug: true, condition: true, status: true } } },
          })
        : Promise.resolve([]),
      this.catalog.metrics.all(),
    ]);

    const offers = p.offers
      .map((o) => this.catalog.toOffer(o, zip, pay))
      .sort((a, b) => Number(a.stock === "out_of_stock") - Number(b.stock === "out_of_stock") || a.estimatedTotalCents - b.estimatedTotalCents);

    const { related, alternatives } = await this.similar(p, siblings.map((x) => x.product.id), allMetrics, metrics?.lowestPriceCents ?? null);

    const ancestorIds = crumbs.length ? (await this.prisma.category.findMany({ where: { slug: { in: crumbSlugs } }, select: { id: true } })).map((c) => c.id) : [];
    const couponRows = await this.prisma.coupon.findMany({
      where: {
        ...liveWhere(),
        retailerId: { in: [...new Set(p.offers.map((o) => o.retailerId))] },
        AND: [{ OR: [{ productId: null, categoryId: null }, { productId: p.id }, { productId: null, categoryId: { in: ancestorIds } }] }],
      },
      orderBy: [{ status: "asc" }, { successRateBp: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 20,
      include: couponInclude,
    });

    if (user) {
      await this.prisma.recentlyViewed
        .upsert({
          where: { userId_productId: { userId: user.id, productId: p.id } },
          update: { viewedAt: new Date() },
          create: { userId: user.id, productId: p.id },
        })
        .catch(() => undefined);
    }

    return {
      product: {
        id: p.id,
        slug: p.slug,
        title: p.title,
        description: p.description,
        brand: p.brand,
        category: p.category ? { slug: p.category.slug, name: p.category.name } : null,
        breadcrumbs: crumbSlugs.map((s) => crumbs.find((c) => c.slug === s)).filter((c): c is { slug: string; name: string } => Boolean(c)),
        model: p.model,
        mpn: p.mpn,
        condition: p.condition,
        images: p.images.map((i) => ({ url: i.url, alt: i.alt, width: i.width, height: i.height })),
        identifiers: p.identifiers.map((i) => ({ type: i.type, value: i.value, retailerSlug: i.retailer?.slug ?? null })),
        attributes: p.attributes.map((a) => ({ group: a.group, name: a.name, value: a.value, unit: a.unit })),
        variants: siblings
          .filter((s) => s.product.status === "active")
          .map((s) => ({
            slug: s.product.slug,
            label: s.label,
            attributes: Object.fromEntries(Object.entries((s.attributes ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
            condition: s.product.condition,
            lowestPriceCents: allMetrics.get(s.product.id)?.lowestPriceCents ?? null,
            current: s.product.id === p.id,
          })),
        releasedAt: p.releasedAt?.toISOString() ?? null,
        updatedAt: p.updatedAt.toISOString(),
      },
      offers,
      lowestOfferId: metrics?.lowestOfferId ?? null,
      storeCount: metrics?.storeCount ?? 0,
      priceStats: metrics?.stats ?? emptyStats(),
      dealScore: metrics?.dealScore ?? null,
      fakeDiscount: metrics?.fakeDiscount ?? EMPTY_FAKE_DISCOUNT,
      hasDemoData: offers.some((o) => o.source === "demo") || p.isDemo,
      coupons: couponRows.map(toCoupon),
      previousLowestPriceCents: recentPreviousPrice(metrics),
      defaultCondition: metrics?.condition ?? "new",
      conditionNote:
        metrics && metrics.condition !== "new" && !metrics.groups.new
          ? `No new offers right now — showing ${CONDITION_LABEL[metrics.condition]} offers.`
          : null,
      conditionSummary: CONDITION_ORDER.flatMap((g) => {
        const n = offers.filter((o) => o.conditionGroup === g).length;
        return n ? [{ condition: g, offerCount: n, lowestPriceCents: metrics?.groups[g]?.lowestPriceCents ?? null }] : [];
      }),
      byCondition: Object.fromEntries(
        CONDITION_ORDER.flatMap((g) => {
          const gm = metrics?.groups[g];
          return gm
            ? [[g, { priceStats: gm.stats, dealScore: gm.dealScore, fakeDiscount: gm.fakeDiscount, lowestOfferId: gm.lowestOfferId, previousLowestPriceCents: recentPreviousPrice(gm) }]]
            : [];
        }),
      ),
      related,
      alternatives,
      lastUpdatedAt: (metrics?.lastCheckedAt ?? p.updatedAt).toISOString(),
    };
  }

  /**
   * "Similar products": same category, most shared spec values, closest price (variant siblings excluded).
   * "Alternatives": other brands in the same category within ±40% of the price — honest "compare with", no fake popularity.
   */
  private async similar(
    p: { id: string; brandId: string | null; categoryId: string | null; attributes: { name: string; value: string; group: string | null }[] },
    siblingIds: string[],
    allMetrics: Map<string, ProductMetrics>,
    price: number | null,
  ): Promise<{ related: ProductDetailResponse["related"]; alternatives: ProductDetailResponse["alternatives"] }> {
    if (!p.categoryId) return { related: [], alternatives: [] };
    const exclude = new Set([p.id, ...siblingIds]);
    const candidates = await this.prisma.product.findMany({
      where: { categoryId: p.categoryId, status: "active", id: { notIn: [...exclude] } },
      select: { id: true, brandId: true, attributes: { select: { name: true, value: true, group: true } } },
      take: 400,
    });
    const own = new Set(p.attributes.filter((a) => a.group !== "General").map((a) => `${a.name}=${a.value}`));
    const priceOf = (id: string) => allMetrics.get(id)?.lowestPriceCents ?? null;
    const closeness = (id: string) => {
      const c = priceOf(id);
      return price && c ? Math.abs(c - price) / price : 1;
    };
    const scored = candidates
      .filter((c) => priceOf(c.id) !== null)
      .map((c) => ({ c, shared: c.attributes.filter((a) => own.has(`${a.name}=${a.value}`)).length, dist: closeness(c.id) }));
    const relatedIds = [...scored].sort((a, b) => b.shared - a.shared || a.dist - b.dist).slice(0, 10).map((x) => x.c.id);
    const altIds = scored
      .filter((x) => x.c.brandId !== p.brandId && x.dist <= 0.4)
      .sort((a, b) => a.dist - b.dist || b.shared - a.shared)
      .slice(0, 6)
      .map((x) => x.c.id);
    const [related, alternatives] = await Promise.all([this.catalog.cards(relatedIds, allMetrics), this.catalog.cards(altIds, allMetrics)]);
    return { related, alternatives };
  }
}

const CONDITION_LABEL: Record<string, string> = { new: "new", open_box: "open-box", refurbished: "refurbished", used: "used" };
