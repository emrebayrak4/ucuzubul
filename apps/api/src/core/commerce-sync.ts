/**
 * Store-platform connector sync (Shopify, WooCommerce, Square, Clover, Google Merchant feed) → our catalog.
 * Products go through the same pipeline as CSV/XML uploads (processMerchantFeed: GTIN matching, review queue,
 * URL allow-list); per-location stock lands in StoreInventory. One page per run; the worker can loop with cursors.
 */
import type { PrismaClient } from "@pricora/database";
import type { CommerceProduct, CommerceSyncResult } from "@pricora/retailer-adapters";
import type { PriceEventJob } from "./alerts";
import { processMerchantFeed } from "./feeds";

type ParsedFeed = Parameters<typeof processMerchantFeed>[2];

export function toParsedFeed(retailerId: string, result: CommerceSyncResult): ParsedFeed {
  const now = new Date().toISOString();
  const listings = result.products.map((p: CommerceProduct) => {
    const sku = p.sku ?? p.externalId;
    const total = p.inventory.reduce<number | null>((s, i) => (i.quantity === null ? s : (s ?? 0) + i.quantity), null);
    const anyIn = p.inventory.some((i) => i.stock === "in_stock" || i.stock === "low_stock");
    const availability = anyIn ? "in_stock" : total === 0 || p.inventory.every((i) => i.stock === "out_of_stock") && p.inventory.length ? "out_of_stock" : "unknown";
    return {
      product: {
        retailerId,
        retailerSku: sku,
        title: p.title,
        brand: p.brand,
        mpn: p.mpn,
        model: null,
        gtin: p.gtin,
        imageUrl: p.imageUrl,
        productUrl: p.url,
        categoryPath: [],
        description: p.description,
        attributes: {},
      },
      offer: {
        retailerId,
        retailerSku: sku,
        priceCents: p.priceCents,
        listPriceCents: p.listPriceCents,
        currency: p.currency,
        availability: availability as "in_stock" | "out_of_stock" | "unknown",
        condition: p.condition,
        productUrl: p.url,
        affiliateUrl: null,
        shippingCents: null,
        sellerName: null,
        source: "merchant_upload" as const,
        observedAt: now,
      },
    };
  });
  return { format: "csv", listings, errors: [], stats: { rows: listings.length, valid: listings.length, invalid: 0, withoutPrice: 0 } };
}

export interface SyncOutcome {
  products: number;
  locations: number;
  inventoryRows: number;
}

/** Upserts locations and inventory after the products were processed. */
export async function applyCommerceResult(
  prisma: PrismaClient,
  args: { merchantAccountId: string; retailerId: string; provider: string; result: CommerceSyncResult; enqueue: (job: PriceEventJob) => Promise<void> },
): Promise<SyncOutcome> {
  const { merchantAccountId, retailerId, provider, result } = args;
  // 1) Locations (approximate ZIP-centroid coordinates when the platform gives none).
  const locIds = new Map<string, string>();
  for (const l of result.locations) {
    const zip = l.zip?.slice(0, 5) ?? null;
    if (!zip || !/^\d{5}$/.test(zip)) continue;
    let lat = l.lat;
    let lng = l.lng;
    let precision = "source";
    if (lat === null || lng === null) {
      const z = await prisma.zipCode.findUnique({ where: { zip }, select: { lat: true, lng: true } });
      if (!z) continue;
      lat = z.lat;
      lng = z.lng;
      precision = "zip_centroid";
    }
    const externalId = `${provider}:${l.externalId}`;
    const row = await prisma.storeLocation.upsert({
      where: { retailerId_externalId: { retailerId, externalId } },
      update: { name: l.name, address1: l.address1, city: l.city, state: l.state?.slice(0, 2) ?? null, zip, lat, lng, geoPrecision: precision, phone: l.phone },
      create: {
        retailerId,
        merchantAccountId,
        externalId,
        name: l.name,
        address1: l.address1,
        city: l.city,
        state: l.state?.slice(0, 2) ?? null,
        zip,
        lat,
        lng,
        geoPrecision: precision,
        phone: l.phone,
        source: "merchant_upload",
        verificationStatus: "pending",
      },
    });
    locIds.set(l.externalId, row.id);
  }

  // 2) Products through the shared feed pipeline.
  const feed = await prisma.retailerFeed.create({
    data: { retailerId, merchantAccountId, name: `${provider} sync`, format: "json", status: "queued", rowsTotal: result.products.length, reviewStatus: "pending" },
  });
  await processMerchantFeed(prisma, feed.id, toParsedFeed(retailerId, result), args.enqueue);

  // 3) Per-location stock for products that matched into the catalog.
  const skus = result.products.map((p) => p.sku ?? p.externalId);
  const offers = await prisma.offer.findMany({ where: { retailerId, retailerSku: { in: skus } }, select: { retailerSku: true, productId: true, priceCents: true, currency: true } });
  const offerBySku = new Map(offers.map((o) => [o.retailerSku, o]));
  let inventoryRows = 0;
  const now = new Date();
  for (const p of result.products) {
    const o = offerBySku.get(p.sku ?? p.externalId);
    if (!o) continue;
    for (const inv of p.inventory) {
      const locId = inv.locationExternalId ? locIds.get(inv.locationExternalId) : undefined;
      if (!locId) continue;
      const data = {
        retailerSku: p.sku ?? p.externalId,
        priceCents: o.priceCents,
        currency: o.currency,
        stock: inv.stock,
        quantity: inv.quantity,
        source: "merchant_upload" as const,
        lastCheckedAt: now,
      };
      await prisma.storeInventory.upsert({
        where: { storeLocationId_productId: { storeLocationId: locId, productId: o.productId } },
        update: data,
        create: { ...data, storeLocationId: locId, productId: o.productId },
      });
      inventoryRows++;
    }
  }
  return { products: result.products.length, locations: locIds.size, inventoryRows };
}
