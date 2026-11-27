import { Inject, Injectable } from "@nestjs/common";
import { computeOfferTotal } from "@pricora/algorithms";
import { conditionGroupOf, type ConditionGroup, type DealItem, type NetQuantity, type Offer, type ProductCard } from "@pricora/contracts";
import type { Prisma } from "@pricora/database";
import { CONDITION_ORDER, computeProductMetrics, EMPTY_FAKE_DISCOUNT, emptyStats, type ProductMetrics } from "../core/metrics";
import { applicableOptions, loadPaymentIndex, payIn4For, type PaymentIndex } from "../core/payment-options";
import { PRISMA, type PrismaClient } from "../common/infra";
import { netQuantityOf, unitPriceFor } from "../core/grocery";

const CACHE_TTL_MS = 2 * 60_000;

export const cardInclude = {
  brand: { select: { slug: true, name: true, logoUrl: true } },
  category: { select: { slug: true, name: true } },
  images: { orderBy: { sortOrder: "asc" }, take: 1 },
  attributes: { where: { OR: [{ group: null }, { group: { not: "General" } }] }, orderBy: { sortOrder: "asc" }, take: 6, select: { name: true, value: true } },
} satisfies Prisma.ProductInclude;

/** Names whose bare value is ambiguous on a tile ("16 GB") get a short suffix. */
const SPEC_SUFFIX: Record<string, string> = { RAM: "RAM", Storage: "storage", Capacity: "", "Refresh rate": "", "Video memory": "VRAM", Cores: "cores", "Battery life": "battery" };

/** Short spec strings for tiles/list rows, e.g. ["16 GB RAM", "512 GB storage", "15.6 in"]. */
export function keySpecs(attrs: { name: string; value: string }[]): string[] {
  return attrs
    .filter((a) => a.value.length <= 40 && !/brand$/i.test(a.name))
    .slice(0, 4)
    .map((a) => {
      const suffix = SPEC_SUFFIX[a.name];
      return suffix ? `${a.value} ${suffix}` : a.value;
    });
}

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

const DROP_WINDOW_MS = 7 * 86_400_000;

/** Previous price at the store holding today's lowest price, if it dropped within 7 days (real observations only). */
export function recentPreviousPrice(m: ProductMetrics | undefined): number | null {
  const d = m?.recentDrop;
  if (!d || m.lowestPriceCents === null || d.currentPriceCents !== m.lowestPriceCents) return null;
  return Date.now() - d.droppedAt.getTime() <= DROP_WINDOW_MS ? d.previousPriceCents : null;
}

/**
 * Metrics for the headline price: the cheapest of the selected condition groups (search filter),
 * otherwise the product's primary group (new when any new offer exists).
 */
export function headlineMetrics(m: ProductMetrics | undefined, conditions?: ConditionGroup[]): ProductMetrics | undefined {
  if (!m || !conditions?.length) return m;
  const candidates = conditions.map((g) => m.groups[g]).filter((x): x is ProductMetrics => Boolean(x?.lowestPriceCents != null));
  if (!candidates.length) return m;
  return candidates.sort((a, b) => (a.lowestPriceCents ?? Infinity) - (b.lowestPriceCents ?? Infinity))[0];
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MetricsService) readonly metrics: MetricsService,
  ) {}

  private payCache: { at: number; index: PaymentIndex } | null = null;

  /** Retailer pay-over-time options (5-minute cache). */
  async paymentIndex(): Promise<PaymentIndex> {
    if (this.payCache && Date.now() - this.payCache.at < 300_000) return this.payCache.index;
    const index = await loadPaymentIndex(this.prisma).catch((): PaymentIndex => new Map());
    this.payCache = { at: Date.now(), index };
    return index;
  }

  toCard(p: CardProduct, all: ProductMetrics | undefined, sponsored = false, conditions?: ConditionGroup[]): ProductCard {
    const img = p.images[0];
    const m = headlineMetrics(all, conditions);
    const head = m?.lowestPriceCents ?? null;
    // Cheaper offers in other condition groups → muted "Used from $X" line, never the headline.
    const otherConditions = all
      ? CONDITION_ORDER.flatMap((g) => {
          const gm = all.groups[g];
          if (!gm || g === m?.condition || gm.lowestPriceCents === null || (head !== null && gm.lowestPriceCents >= head)) return [];
          return [{ condition: g, lowestPriceCents: gm.lowestPriceCents, offerCount: gm.retailerIds.length }];
        })
      : [];
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
      previousPriceCents: recentPreviousPrice(m),
      priceCondition: m?.condition ?? "new",
      otherConditions,
      keySpecs: keySpecs(p.attributes),
      unitPrice: unitPriceFor(m?.lowestPriceCents ?? null, netQuantityOf(p)),
      sizeLabel: p.sizeLabel,
      updatedAt: (m?.lastCheckedAt ?? p.updatedAt).toISOString(),
    };
  }

  toOffer(o: OfferWithRetailer, zip?: string | null, pay?: PaymentIndex, qty?: NetQuantity | null): Offer {
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
      conditionGroup: conditionGroupOf(o.condition),
      conditionGrade: o.conditionGrade,
      refurbishedBy: o.refurbishedBy,
      seller: o.sellerType ? { name: o.sellerName, type: o.sellerType } : null,
      returnPolicy: o.returnPolicy,
      ...(qty ? { unitPrice: unitPriceFor(o.priceCents, qty) } : {}),
      ...(pay
        ? {
            // Basis = price + known shipping (tax excluded; providers finance the checkout total).
            paymentOptions: applicableOptions(pay.get(o.retailer.id), o.priceCents + (o.shippingCents ?? 0)),
            payIn4: payIn4For(pay.get(o.retailer.id), o.priceCents + (o.shippingCents ?? 0)),
          }
        : {}),
    };
  }

  /** Cards for product ids, preserving order and skipping missing/inactive products. */
  async cards(ids: string[], metrics?: Map<string, ProductMetrics>, opts: { conditions?: ConditionGroup[] } = {}): Promise<ProductCard[]> {
    if (ids.length === 0) return [];
    const m = metrics ?? (await this.metrics.all());
    const [products, pay, offers] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: ids }, status: "active" }, include: cardInclude }),
      this.paymentIndex(),
      this.prisma.offer.findMany({ where: { productId: { in: ids }, isActive: true }, select: { id: true, productId: true, retailerId: true, priceCents: true, shippingCents: true } }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const p = byId.get(id);
      if (!p) return [];
      const pm = m.get(id);
      const own = offers.filter((o) => o.productId === id);
      const head = headlineMetrics(pm, opts.conditions);
      const lowest = own.find((o) => o.id === head?.lowestOfferId);
      const card = this.toCard(p, pm, false, opts.conditions);
      card.payIn4 = lowest ? payIn4For(pay.get(lowest.retailerId), lowest.priceCents + (lowest.shippingCents ?? 0)) : null;
      card.payOverTime = own.some((o) => applicableOptions(pay.get(o.retailerId), o.priceCents + (o.shippingCents ?? 0)).length > 0);
      return [card];
    });
  }

  /** Deal items (lowest offer + score + fake-discount) for product ids, in order. Skips products without a score. */
  async dealItems(ids: string[], metrics?: Map<string, ProductMetrics>): Promise<DealItem[]> {
    const m = metrics ?? (await this.metrics.all());
    const offerIds = ids.map((id) => m.get(id)?.lowestOfferId).filter((x): x is string => Boolean(x));
    const [cards, offers, pay] = await Promise.all([
      this.cards(ids, m),
      this.prisma.offer.findMany({ where: { id: { in: offerIds } }, include: offerInclude }),
      this.paymentIndex(),
    ]);
    const offerById = new Map(offers.map((o) => [o.id, o]));
    return cards.flatMap((card) => {
      const pm = m.get(card.id);
      const offer = pm?.lowestOfferId ? offerById.get(pm.lowestOfferId) : undefined;
      if (!pm?.dealScore || !offer) return [];
      return [{ product: card, offer: this.toOffer(offer, null, pay), dealScore: pm.dealScore, fakeDiscount: pm.fakeDiscount }];
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
