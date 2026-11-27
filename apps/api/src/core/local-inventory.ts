/**
 * Local sellers: turn their matched catalog offers into per-location store inventory ("Available nearby").
 * Only offers from approved feeds (or connector/manual offers) count. Existing per-location rows (set by the merchant
 * or a connector with real per-store quantities) are never overwritten — only missing rows are created.
 */
import type { PrismaClient } from "@pricora/database";

const STOCK = { in_stock: "in_stock", low_stock: "low_stock", out_of_stock: "out_of_stock", preorder: "unknown", unknown: "unknown" } as const;

export async function syncLocalInventory(prisma: PrismaClient, merchantAccountId: string): Promise<number> {
  const acc = await prisma.merchantAccount.findUnique({ where: { id: merchantAccountId }, select: { isLocalSeller: true } });
  if (!acc?.isLocalSeller) return 0;
  const [locations, offers] = await Promise.all([
    prisma.storeLocation.findMany({ where: { merchantAccountId, isActive: true, verificationStatus: { not: "rejected" } }, select: { id: true } }),
    prisma.offer.findMany({
      where: { merchantAccountId, OR: [{ feedId: null }, { feed: { reviewStatus: "verified" } }] },
      select: { productId: true, retailerSku: true, priceCents: true, currency: true, stock: true, source: true },
    }),
  ]);
  if (!locations.length || !offers.length) return 0;
  const now = new Date();
  const res = await prisma.storeInventory.createMany({
    data: locations.flatMap((l) =>
      offers.map((o) => ({
        storeLocationId: l.id,
        productId: o.productId,
        retailerSku: o.retailerSku,
        priceCents: o.priceCents,
        currency: o.currency,
        stock: STOCK[o.stock],
        source: o.source === "demo" ? ("demo" as const) : ("merchant_upload" as const),
        lastCheckedAt: now,
      })),
    ),
    skipDuplicates: true,
  });
  return res.count;
}

/** A rejected feed's products leave the merchant's store inventory (merchant-upload rows only). */
export async function removeFeedInventory(prisma: PrismaClient, feedId: string): Promise<number> {
  const feed = await prisma.retailerFeed.findUnique({ where: { id: feedId }, select: { merchantAccountId: true, offers: { select: { productId: true } } } });
  if (!feed?.merchantAccountId) return 0;
  const res = await prisma.storeInventory.deleteMany({
    where: { productId: { in: feed.offers.map((o) => o.productId) }, source: "merchant_upload", location: { merchantAccountId: feed.merchantAccountId } },
  });
  return res.count;
}

type CandidateListing = {
  product?: { retailerSku?: unknown; title?: unknown; productUrl?: unknown };
  offer?: { priceCents?: unknown; listPriceCents?: unknown; currency?: unknown; availability?: unknown; condition?: unknown; productUrl?: unknown; shippingCents?: unknown } | null;
};

const AVAIL: Record<string, "in_stock" | "low_stock" | "out_of_stock" | "preorder" | "unknown"> = {
  in_stock: "in_stock",
  limited: "low_stock",
  out_of_stock: "out_of_stock",
  preorder: "preorder",
};
const CONDITIONS = new Set(["new", "refurbished", "used", "open_box", "for_parts", "unknown"]);

/**
 * A merchant-feed listing that had no GTIN match sits in the review queue as candidate data. When an editor approves
 * it against a catalog product, create the merchant's offer (and store inventory for local sellers).
 * Returns the offer id, or null when the match isn't a merchant listing.
 */
export async function createOfferFromMatch(prisma: PrismaClient, match: { retailerId: string; offerId: string | null; candidateData: unknown }, productId: string): Promise<string | null> {
  if (match.offerId) return null;
  const c = (match.candidateData ?? {}) as CandidateListing;
  const sku = typeof c.product?.retailerSku === "string" ? c.product.retailerSku : null;
  const price = typeof c.offer?.priceCents === "number" && Number.isInteger(c.offer.priceCents) && c.offer.priceCents > 0 ? c.offer.priceCents : null;
  if (!sku || price === null) return null;
  const retailer = await prisma.retailer.findUnique({ where: { id: match.retailerId }, include: { merchantAccount: true } });
  const acc = retailer?.merchantAccount;
  if (!retailer || !acc) return null;
  const rawUrl = typeof c.offer?.productUrl === "string" ? c.offer.productUrl : typeof c.product?.productUrl === "string" ? c.product.productUrl : null;
  let urlOk = false;
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      const hosts = new Set([retailer.domain, `www.${retailer.domain}`, ...retailer.allowedRedirectHosts].map((h) => h.toLowerCase()));
      urlOk = u.protocol === "https:" && hosts.has(u.hostname.toLowerCase());
    } catch {
      urlOk = false;
    }
  }
  if (!urlOk && retailer.kind !== "local") return null;
  const condition = typeof c.offer?.condition === "string" && CONDITIONS.has(c.offer.condition) ? (c.offer.condition as "new") : "unknown";
  const stock = typeof c.offer?.availability === "string" ? (AVAIL[c.offer.availability] ?? "unknown") : "unknown";
  const data = {
    productId,
    title: typeof c.product?.title === "string" ? c.product.title.slice(0, 500) : sku,
    url: urlOk && rawUrl ? rawUrl : retailer.websiteUrl,
    priceCents: price,
    listPriceCents: typeof c.offer?.listPriceCents === "number" ? c.offer.listPriceCents : null,
    shippingCents: typeof c.offer?.shippingCents === "number" ? c.offer.shippingCents : null,
    currency: typeof c.offer?.currency === "string" && c.offer.currency.length === 3 ? c.offer.currency : "USD",
    stock,
    isActive: acc.verificationStatus === "verified" && urlOk,
    merchantAccountId: acc.id,
  };
  const offer = await prisma.offer.upsert({
    where: { retailerId_retailerSku: { retailerId: retailer.id, retailerSku: sku } },
    update: data,
    create: { ...data, retailerId: retailer.id, retailerSku: sku, condition, source: "merchant_upload" },
  });
  await syncLocalInventory(prisma, acc.id);
  return offer.id;
}
