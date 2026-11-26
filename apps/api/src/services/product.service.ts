import { Inject, Injectable } from "@nestjs/common";
import type { ProductDetailResponse } from "@pricora/contracts";
import type { User } from "@pricora/database";
import { notFound } from "../common/errors";
import { PRISMA, type PrismaClient } from "../common/infra";
import { couponInclude, liveWhere, toCoupon } from "../core/coupons";
import { EMPTY_FAKE_DISCOUNT, emptyStats } from "../core/metrics";
import { CatalogService, offerInclude } from "./catalog.service";

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

    const metrics = (await this.catalog.metrics.fresh([p.id])).get(p.id);
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
      .map((o) => this.catalog.toOffer(o, zip))
      .sort((a, b) => Number(a.stock === "out_of_stock") - Number(b.stock === "out_of_stock") || a.estimatedTotalCents - b.estimatedTotalCents);

    const relatedIds = [...allMetrics.values()]
      .filter((m) => m.productId !== p.id)
      .map((m) => m.productId);
    const relatedProducts = p.categoryId
      ? await this.prisma.product.findMany({ where: { categoryId: p.categoryId, status: "active", id: { in: relatedIds } }, select: { id: true }, take: 24 })
      : [];
    const related = await this.catalog.cards(
      relatedProducts
        .map((r) => r.id)
        .sort((a, b) => (allMetrics.get(b)?.dealScore?.score ?? 0) - (allMetrics.get(a)?.dealScore?.score ?? 0))
        .slice(0, 8),
      allMetrics,
    );

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
      related,
      lastUpdatedAt: (metrics?.lastCheckedAt ?? p.updatedAt).toISOString(),
    };
  }
}
