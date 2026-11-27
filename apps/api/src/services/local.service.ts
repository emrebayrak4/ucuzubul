import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { EbayBrowseAdapter, getAdapterStatuses } from "@pricora/retailer-adapters";
import type {
  LocalStoresQuery,
  LocalStoresResponse,
  NearbyAvailability,
  NearestStore,
  ProductNearbyQuery,
  ProductNearbyResponse,
  StoreHours,
  StoreLocationPublic,
  ZipOrigin,
} from "@pricora/contracts";
import type { Prisma, User } from "@pricora/database";
import { notFound } from "../common/errors";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";
import { boundingBox, haversineKm } from "../core/geo-zip";
import { KM_PER_MILE, localStock, netQuantityOf, round1, unitPriceFor } from "../core/grocery";

export const locationInclude = {
  retailer: { select: { slug: true, name: true, kind: true, logoUrl: true, brandColor: true, isActive: true } },
} satisfies Prisma.StoreLocationInclude;
export type LocationWithRetailer = Prisma.StoreLocationGetPayload<{ include: typeof locationInclude }>;

export type OriginResult = { status: "ok"; origin: ZipOrigin } | { status: "set_zip" | "unknown_zip"; origin: null };

/** Parses StoreLocation.hours JSON defensively. */
export function parseHours(raw: unknown): StoreHours | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.flatMap((h) => {
    if (!h || typeof h !== "object") return [];
    const o = h as Record<string, unknown>;
    const day = o["day"];
    const open = o["open"];
    const close = o["close"];
    if (typeof day !== "number" || typeof open !== "string" || typeof close !== "string") return [];
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || day < 0 || day > 6) return [];
    return [{ day, open, close }];
  });
  return out.length ? out : null;
}

export function locationOut(l: LocationWithRetailer): StoreLocationPublic {
  return {
    id: l.id,
    name: l.name,
    retailer: { slug: l.retailer.slug, name: l.retailer.name, kind: l.retailer.kind, logoUrl: l.retailer.logoUrl, brandColor: l.retailer.brandColor },
    address1: l.address1,
    city: l.city,
    state: l.state,
    zip: l.zip,
    lat: l.lat,
    lng: l.lng,
    geoPrecision: l.geoPrecision === "provider" || l.geoPrecision === "source" ? l.geoPrecision : "zip_centroid",
    phone: l.phone,
    hours: parseHours(l.hours),
    pickup: l.pickup,
    deliveryRadiusMiles: l.deliveryRadiusMiles,
    pickupMinimumCents: l.pickupMinimumCents,
    deliveryMinimumCents: l.deliveryMinimumCents,
    source: l.source,
    verified: l.verificationStatus === "verified",
  };
}

/** Where-clause for store locations shoppers may see: active store of an active (approved) retailer, not rejected. */
export function visibleLocationWhere(origin: ZipOrigin, radiusMi: number): Prisma.StoreLocationWhereInput {
  const box = boundingBox(origin.lat, origin.lng, radiusMi * KM_PER_MILE);
  return {
    isActive: true,
    verificationStatus: { not: "rejected" },
    retailer: { isActive: true },
    lat: { gte: box.minLat, lte: box.maxLat },
    lng: { gte: box.minLng, lte: box.maxLng },
  };
}

export function distanceMi(origin: { lat: number; lng: number }, l: { lat: number; lng: number }): number {
  return round1(haversineKm(origin.lat, origin.lng, l.lat, l.lng) / KM_PER_MILE);
}

const STOCK_RANK = { in_stock: 0, limited: 1, unknown: 2, out_of_stock: 3 } as const;

@Injectable()
export class LocalService {
  private nearCache = new Map<string, { at: number; map: Map<string, NearestStore> }>();
  private readonly log = new Logger("Local");

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Optional() @Inject(INTEGRATIONS) private readonly integrations?: IntegrationConfig,
  ) {}

  /** Status of store-level / local-pickup sources (no network calls). */
  private async sources(): Promise<{ list: NonNullable<ProductNearbyResponse["sources"]>; env: Record<string, string | undefined> }> {
    const env = ((await this.integrations?.env().catch(() => undefined)) ?? process.env) as Record<string, string | undefined>;
    const st = new Map(getAdapterStatuses(env).map((a) => [a.id, a.status]));
    const s = (id: string): "live" | "pending_configuration" | "error" => {
      const v = st.get(id);
      return v === "live" ? "live" : v === "error" ? "error" : "pending_configuration";
    };
    return {
      env,
      list: [
        { id: "local-sellers", name: "Local stores on WhichLess", status: "live", note: "Self-serve listings, reviewed before they appear" },
        { id: "kroger", name: "Kroger store prices", status: s("kroger"), note: s("kroger") === "live" ? "Store prices are refreshed by the ingestion job" : "Needs Kroger API keys" },
        { id: "ebay-local-pickup", name: "eBay local pickup", status: s("ebay"), note: s("ebay") === "live" ? null : "Needs eBay API keys" },
        { id: "etsy", name: "Etsy sellers", status: s("etsy"), note: s("etsy") === "live" ? "Shown in search results" : "Needs an Etsy API key" },
      ],
    };
  }

  /** eBay listings with seller-arranged local pickup near the ZIP (only when eBay is configured). */
  private async ebayPickup(title: string, gtin: string | null, zip: string, radiusMi: number, env: Record<string, string | undefined>): Promise<NonNullable<ProductNearbyResponse["marketplacePickup"]>> {
    try {
      const adapter = new EbayBrowseAdapter({ env, http: { timeoutMs: 4000 } });
      const res = await adapter.searchLocalPickup({ ...(gtin ? { gtin } : { keywords: title }), zip, radiusMiles: Math.min(radiusMi, 100), limit: 6 });
      return res.data.map((x) => {
        const url = x.offer.affiliateUrl ?? x.offer.productUrl ?? x.product.productUrl;
        let safe: string | null = null;
        if (url) {
          try {
            const u = new URL(url);
            if (u.protocol === "https:" && /(^|\.)ebay\.com$/.test(u.hostname)) safe = u.toString();
          } catch {
            safe = null;
          }
        }
        return {
          source: "ebay" as const,
          title: x.product.title,
          priceCents: x.offer.priceCents,
          currency: x.offer.currency,
          condition: x.offer.condition,
          sellerName: x.sellerName,
          city: x.itemLocation.city,
          state: x.itemLocation.stateOrProvince,
          postalCode: x.itemLocation.postalCode,
          url: safe,
        };
      });
    } catch (err) {
      this.log.warn(`eBay local pickup unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /** ZIP from the query, else the signed-in user's saved ZIP. */
  async resolveOrigin(zipInput: string | null | undefined, user: User | undefined): Promise<OriginResult> {
    let zip = zipInput?.trim().slice(0, 5) || null;
    if (!zip && user) zip = (await this.prisma.userPreference.findUnique({ where: { userId: user.id }, select: { zip: true } }))?.zip?.slice(0, 5) ?? null;
    if (!zip) return { status: "set_zip", origin: null };
    const row = await this.prisma.zipCode.findUnique({ where: { zip }, select: { zip: true, city: true, state: true, lat: true, lng: true } });
    if (!row) return { status: "unknown_zip", origin: null };
    return { status: "ok", origin: { zip: row.zip, city: row.city, state: row.state, lat: row.lat, lng: row.lng } };
  }

  async productNearby(slug: string, q: ProductNearbyQuery, user: User | undefined): Promise<ProductNearbyResponse> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, title: true, status: true, isDemo: true, netQuantity: true, netUnit: true, packCount: true, sizeLabel: true, identifiers: { where: { type: { in: ["UPC", "EAN", "GTIN"] } }, select: { value: true }, take: 1 } },
    });
    if (!product || product.status !== "active") throw notFound("Product");
    const qty = netQuantityOf(product);

    const onlineOffer = await this.prisma.offer.findFirst({
      where: { productId: product.id, isActive: true, condition: "new", stock: { not: "out_of_stock" } },
      orderBy: { priceCents: "asc" },
      select: { priceCents: true, source: true, retailer: { select: { name: true } } },
    });
    const online = onlineOffer ? { priceCents: onlineOffer.priceCents, retailerName: onlineOffer.retailer.name, source: onlineOffer.source } : null;

    const { list: sources, env } = await this.sources();
    const o = await this.resolveOrigin(q.zip, user);
    if (o.status !== "ok") return { status: o.status, origin: null, radiusMi: q.radius, items: [], sponsored: [], online, sources, hasDemoData: Boolean(online?.source === "demo") };
    const origin = o.origin;
    const pickupPromise =
      sources.find((s) => s.id === "ebay-local-pickup")?.status === "live" ? this.ebayPickup(product.title, product.identifiers[0]?.value ?? null, origin.zip, q.radius, env) : Promise.resolve([]);

    const rows = await this.prisma.storeInventory.findMany({
      where: { productId: product.id, location: visibleLocationWhere(origin, q.radius) },
      include: { location: { include: locationInclude } },
      take: 500,
    });
    const toItem = (r: (typeof rows)[number], sponsored: boolean): NearbyAvailability => {
      const d = distanceMi(origin, r.location);
      return {
        location: locationOut(r.location),
        distanceMi: d,
        stock: localStock(r.stock, r.quantity),
        priceCents: r.priceCents,
        currency: r.currency,
        unitPrice: unitPriceFor(r.priceCents, qty),
        pickupToday: r.pickupToday && r.location.pickup,
        deliversToYou: r.location.deliveryRadiusMiles !== null && d <= r.location.deliveryRadiusMiles,
        source: r.source,
        lastCheckedAt: r.lastCheckedAt.toISOString(),
        sponsored,
      };
    };
    const items = rows
      .map((r) => toItem(r, false))
      .filter((i) => i.distanceMi <= q.radius)
      // Organic order: distance, with out-of-stock stores last. Sponsorship never touches this list.
      .sort((a, b) => Number(a.stock === "out_of_stock") - Number(b.stock === "out_of_stock") || a.distanceMi - b.distanceMi || STOCK_RANK[a.stock] - STOCK_RANK[b.stock]);

    // Promoted local listing (separate slot, labeled "Sponsored"): an active "nearby" campaign of a merchant whose store carries it.
    const now = new Date();
    const campaigns = await this.prisma.sponsoredCampaign.findMany({
      where: {
        status: "active",
        placement: "nearby",
        merchantAccountId: { not: null },
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      select: { merchantAccountId: true, productIds: true, budgetCents: true, spentCents: true },
      take: 50,
    });
    const sponsorMerchants = new Set(
      campaigns.filter((c) => c.spentCents < c.budgetCents && (c.productIds.length === 0 || c.productIds.includes(product.id))).map((c) => c.merchantAccountId as string),
    );
    const sponsored = rows
      .filter((r) => r.location.merchantAccountId && sponsorMerchants.has(r.location.merchantAccountId) && r.stock !== "out_of_stock")
      .map((r) => toItem(r, true))
      .filter((i) => i.distanceMi <= q.radius)
      .sort((a, b) => a.distanceMi - b.distanceMi)
      .slice(0, 1);

    const shown = items.slice(0, q.limit);
    return {
      status: "ok",
      origin,
      radiusMi: q.radius,
      items: shown,
      sponsored,
      online,
      sources,
      marketplacePickup: await pickupPromise,
      hasDemoData: shown.some((i) => i.source === "demo") || sponsored.some((i) => i.source === "demo") || online?.source === "demo",
    };
  }

  async storesNear(q: LocalStoresQuery, user: User | undefined): Promise<LocalStoresResponse> {
    const o = await this.resolveOrigin(q.zip, user);
    if (o.status !== "ok") return { status: o.status, origin: null, radiusMi: q.radius, items: [], hasDemoData: false };
    const origin = o.origin;
    const where: Prisma.StoreLocationWhereInput = { ...visibleLocationWhere(origin, q.radius) };
    if (q.kind || q.retailer) where.retailer = { isActive: true, ...(q.kind ? { kind: q.kind } : {}), ...(q.retailer ? { slug: q.retailer } : {}) };
    const rows = await this.prisma.storeLocation.findMany({ where, include: { ...locationInclude, _count: { select: { inventory: true } } }, take: 1000 });
    const items = rows
      .map((l) => ({ ...locationOut(l), distanceMi: distanceMi(origin, l), productCount: l._count.inventory }))
      .filter((l) => l.distanceMi <= q.radius)
      .sort((a, b) => a.distanceMi - b.distanceMi)
      .slice(0, q.limit);
    return { status: "ok", origin, radiusMi: q.radius, items, hasDemoData: items.some((i) => i.source === "demo") };
  }

  /**
   * Nearest store (in stock or unknown stock) per product within the radius — drives the search "Near me" filter
   * and "Distance" sort. Cached 60 s per ZIP + radius.
   */
  async nearestByProduct(origin: ZipOrigin, radiusMi: number): Promise<Map<string, NearestStore>> {
    const key = `${origin.zip}:${radiusMi}`;
    const hit = this.nearCache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.map;
    const rows = await this.prisma.storeInventory.findMany({
      where: { stock: { not: "out_of_stock" }, location: visibleLocationWhere(origin, radiusMi) },
      select: {
        productId: true,
        stock: true,
        quantity: true,
        priceCents: true,
        location: { select: { name: true, lat: true, lng: true, geoPrecision: true, retailer: { select: { slug: true } } } },
      },
    });
    const map = new Map<string, NearestStore>();
    for (const r of rows) {
      const d = distanceMi(origin, r.location);
      if (d > radiusMi) continue;
      const prev = map.get(r.productId);
      if (prev && prev.distanceMi <= d) continue;
      map.set(r.productId, {
        storeName: r.location.name,
        retailerSlug: r.location.retailer.slug,
        distanceMi: d,
        stock: localStock(r.stock, r.quantity),
        priceCents: r.priceCents,
        approximate: r.location.geoPrecision === "zip_centroid",
      });
    }
    if (this.nearCache.size > 200) this.nearCache.clear();
    this.nearCache.set(key, { at: Date.now(), map });
    return map;
  }
}
