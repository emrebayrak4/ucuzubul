import { Inject, Injectable } from "@nestjs/common";
import { computeOfferTotal } from "@pricora/algorithms";
import type { DealItem, Offer, ProductCard } from "@pricora/contracts";
import type { Prisma } from "@pricora/database";
import { computeProductMetrics, EMPTY_FAKE_DISCOUNT, emptyStats, type ProductMetrics } from "../core/metrics";
import { PRISMA, type PrismaClient } from "../common/infra";

const CACHE_TTL_MS = 2 * 60_000;

export const cardInclude = {
  brand: { select: { slug: true, name: true, logoUrl: true } },
  category: { select: { slug: true, name: true } },
  images: { orderBy: { sortOrder: "asc" }, take: 1 },
} satisfies Prisma.ProductInclude;

export type CardProduct = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

export const offerInclude = {
  retailer: { select: { id: true, slug: true, name: true, logoUrl: true, brandColor: true } },
} satisfies Prisma.OfferInclude;

export type OfferWithRetailer = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

/** Caches catalog-wide metrics (single-flight, short TTL). */
@Injectable()
export class MetricsService {
  private cache: { at: number; map: Map<string, ProductMetrics> } | null = null;
  private inflight: Promise<Map<string, ProductMetrics>> | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async all(): Promise<Map<string, ProductMetrics>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.map;
    if (!this.inflight) {
      this.inflight = computeProductMetrics(this.prisma)
        .then((map) => {
          this.cache = { at: Date.now(), map };
          return map;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  /** Fresh metrics for specific products (product detail, compare). */
  async fresh(productIds: string[]): Promise<Map<string, ProductMetrics>> {
    return computeProductMetrics(this.prisma, productIds);
  }

  invalidate(): void {
    this.cache = null;
  }
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MetricsService) readonly metrics: MetricsService,
  ) {}

  toCard(p: CardProduct, m: ProductMetrics | undefined, sponsored = false): ProductCard {
    const img = p.images[0];
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      category: p.category,
      condition: p.condition,
      image: img ? { url: img.url, alt: img.alt, width: img.width, height: img.height } : null,
      lowestPriceCents: m?.lowestPriceCents ?? null,
      lowestTotalCents: m?.lowestTotalCents ?? null,
      currency: "USD",
      storeCount: m?.storeCount ?? 0,
      inStock: m?.inStock ?? false,
      dropRatio: m?.dropRatio ?? null,
      dealScore: m?.dealScore?.score ?? null,
      hasDemoData: m?.hasDemoData ?? p.isDemo,
      sponsored,
      updatedAt: (m?.lastCheckedAt ?? p.updatedAt).toISOString(),
    };
  }

  toOffer(o: OfferWithRetailer, zip?: string | null): Offer {
    const total = computeOfferTotal({ priceCents: o.priceCents, quantity: 1, shippingCents: o.shippingCents, zip: zip ?? null });
    const taxKnown = Boolean(zip) && total.taxCents !== null;
    const shippingKind = o.shippingCents === null ? "unknown" : o.shippingCents === 0 ? "free" : "paid";
    return {
      id: o.id,
      retailer: o.retailer,
      title: o.title,
      condition: o.condition,
      priceCents: o.priceCents,
      listPriceCents: o.listPriceCents,
      currency: o.currency,
      shipping: {
        costCents: o.shippingCents,
        kind: shippingKind,
        estimatedDaysMin: o.shippingDaysMin,
        estimatedDaysMax: o.shippingDaysMax,
        pickupAvailable: o.pickupAvailable,
      },
      tax: {
        amountCents: taxKnown ? total.taxCents : null,
        rateBasisPoints: taxKnown && total.taxRatePct !== null ? Math.round(total.taxRatePct * 100) : null,
        status: taxKnown ? "estimated" : "unknown_set_zip",
      },
      estimatedTotalCents: o.priceCents + (o.shippingCents ?? 0) + (taxKnown ? (total.taxCents ?? 0) : 0),
      stock: o.stock,
      couponCode: o.couponCode,
      couponDescription: o.couponDescription,
      goUrl: `/v1/go/${o.id}`,
      isAffiliate: o.affiliateUrl !== null,
      source: o.source,
      sponsored: false,
      lastCheckedAt: o.lastCheckedAt.toISOString(),
    };
  }

  /** Cards for product ids, preserving order and skipping missing/inactive products. */
  async cards(ids: string[], metrics?: Map<string, ProductMetrics>): Promise<ProductCard[]> {
    if (ids.length === 0) return [];
    const m = metrics ?? (await this.metrics.all());
    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, status: "active" }, include: cardInclude });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const p = byId.get(id);
      return p ? [this.toCard(p, m.get(id))] : [];
    });
  }

  /** Deal items (lowest offer + score + fake-discount) for product ids, in order. Skips products without a score. */
  async dealItems(ids: string[], metrics?: Map<string, ProductMetrics>): Promise<DealItem[]> {
    const m = metrics ?? (await this.metrics.all());
    const offerIds = ids.map((id) => m.get(id)?.lowestOfferId).filter((x): x is string => Boolean(x));
    const [cards, offers] = await Promise.all([
      this.cards(ids, m),
      this.prisma.offer.findMany({ where: { id: { in: offerIds } }, include: offerInclude }),
    ]);
    const offerById = new Map(offers.map((o) => [o.id, o]));
    return cards.flatMap((card) => {
      const pm = m.get(card.id);
      const offer = pm?.lowestOfferId ? offerById.get(pm.lowestOfferId) : undefined;
      if (!pm?.dealScore || !offer) return [];
      return [{ product: card, offer: this.toOffer(offer), dealScore: pm.dealScore, fakeDiscount: pm.fakeDiscount }];
    });
  }

  emptyMetricsFallback() {
    return { stats: emptyStats(), fakeDiscount: EMPTY_FAKE_DISCOUNT };
  }

  /** Product id set for a category slug including descendants. */
  async categorySubtreeIds(slug: string): Promise<string[] | null> {
    const cat = await this.prisma.category.findUnique({ where: { slug } });
    if (!cat) return null;
    const cats = await this.prisma.category.findMany({
      where: { OR: [{ id: cat.id }, { path: { startsWith: `${cat.path}/` } }] },
      select: { id: true },
    });
    return cats.map((c) => c.id);
  }
}
