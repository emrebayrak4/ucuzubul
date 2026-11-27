/**
 * Merchant feed ingestion (shared by API inline path and the worker).
 * Small feeds are processed inline by the API; larger ones are queued to the worker (SEC-M2).
 */
import type { Prisma, PrismaClient } from "@pricora/database";
import { AffiliateFeedAdapter, type ParsedFeed } from "@pricora/retailer-adapters";
import type { PriceEventJob } from "./alerts";

export const MERCHANT_FEEDS_QUEUE = "merchant-feeds";

/** Rows processed synchronously inside the upload request. */
export const FEED_INLINE_MAX_ROWS = 500;
/** Hard cap per upload. */
export const FEED_MAX_ROWS = 20_000;
/** Pending match-review rows an unverified merchant may have at once (protects the admin queue). */
export const UNVERIFIED_PENDING_MATCH_CAP = 100;
/** Same cap for verified merchants. */
export const VERIFIED_PENDING_MATCH_CAP = 2_000;

export interface MerchantFeedJob {
  feedId: string;
  /** Absolute path of the staged upload (shared FEED_UPLOAD_DIR). */
  path: string;
  format: "csv" | "xml";
}

export interface FeedRowError {
  row: number;
  field: string | null;
  message: string;
}

const FORMULA_LEAD = /^[=+@\t\r]|^-(?=[^\d\s])/;

/** Neutralise spreadsheet-formula leading characters (SEC-L3) so exports can never execute them. */
export function neutralizeFormula(v: string): { value: string; changed: boolean } {
  return FORMULA_LEAD.test(v) ? { value: `'${v}`, changed: true } : { value: v, changed: false };
}

export function parseMerchantFeed(content: string, format: "csv" | "xml", meta: { id: string; name: string; retailerId: string }): ParsedFeed {
  const parser = new AffiliateFeedAdapter({ id: meta.id, name: meta.name, retailerId: meta.retailerId, dataAccess: "partner_only" });
  return parser.parseFeed(content, format);
}

function gtinVariants(code: string): string[] {
  const digits = code.replace(/\D/g, "");
  const core = digits.replace(/^0+/, "");
  const out = new Set<string>([digits]);
  for (const len of [12, 13, 14]) if (core.length <= len) out.add(core.padStart(len, "0"));
  return [...out];
}

function allowed(target: string, domain: string, hosts: string[]): boolean {
  try {
    const u = new URL(target);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    return new Set([domain, `www.${domain}`, ...hosts].map((h) => h.toLowerCase())).has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Processes a parsed feed for an existing RetailerFeed row and marks it completed. */
export async function processMerchantFeed(
  prisma: PrismaClient,
  feedId: string,
  parsed: ParsedFeed,
  enqueuePriceEvent: (job: PriceEventJob) => Promise<void>,
): Promise<void> {
  const feed = await prisma.retailerFeed.findUniqueOrThrow({ where: { id: feedId }, include: { retailer: true, merchantAccount: true } });
  const retailer = feed.retailer;
  const acc = feed.merchantAccount;
  const live = acc?.verificationStatus === "verified";
  // Local sellers: offers stay offline until an admin approves the feed; shops without a website are listed in-store only.
  const local = retailer.kind === "local";
  const feedApproved = feed.reviewStatus === "verified";
  await prisma.retailerFeed.update({ where: { id: feedId }, data: { status: "processing" } });

  const errors: FeedRowError[] = parsed.errors.flatMap((e) =>
    e.issues.filter((i) => i.severity === "error").map((i) => ({ row: e.row, field: i.field || null, message: i.message })),
  );

  const listings = parsed.listings.slice(0, FEED_MAX_ROWS);
  const gtins = [...new Set(listings.flatMap((l) => (l.product.gtin ? gtinVariants(l.product.gtin) : [])))];
  const idents = gtins.length
    ? await prisma.productIdentifier.findMany({
        where: { value: { in: gtins }, product: { status: "active" } },
        select: { value: true, product: { select: { id: true, condition: true } } },
      })
    : [];
  const skus = listings.map((l) => l.product.retailerSku);
  const existingOffers = await prisma.offer.findMany({ where: { retailerId: retailer.id, retailerSku: { in: skus } } });
  const existingBySku = new Map(existingOffers.map((o) => [o.retailerSku, o]));
  let pendingMatches = await prisma.productMatch.count({ where: { retailerId: retailer.id, status: "pending_review" } });
  const matchCap = live ? VERIFIED_PENDING_MATCH_CAP : UNVERIFIED_PENDING_MATCH_CAP;

  let accepted = 0;
  let row = 0;
  for (const listing of listings) {
    row++;
    const o = listing.offer;
    if (!o) {
      errors.push({ row, field: "price", message: "Missing or invalid price" });
      continue;
    }
    const rawTarget = o.productUrl ?? listing.product.productUrl;
    const urlOk = Boolean(rawTarget && allowed(rawTarget, retailer.domain, retailer.allowedRedirectHosts));
    if (!urlOk && !local) {
      errors.push({ row, field: "url", message: `Product URL must be https on ${retailer.domain}` });
      continue;
    }
    // In-store-only listing (local shop without a matching product URL): never linked out, shown under "Available nearby".
    const storeOnly = !urlOk;
    const target = urlOk && rawTarget ? rawTarget : retailer.websiteUrl;
    const title = neutralizeFormula(listing.product.title);
    if (title.changed) errors.push({ row, field: "title", message: "Leading formula character neutralised (row accepted)" });

    const gtinSet = listing.product.gtin ? new Set(gtinVariants(listing.product.gtin)) : null;
    const product = gtinSet ? idents.find((i) => gtinSet.has(i.value) && i.product.condition === o.condition)?.product : undefined;
    if (!product) {
      if (pendingMatches >= matchCap) {
        errors.push({
          row,
          field: "gtin",
          message: live
            ? "Review queue limit reached — add GTINs so listings can be matched automatically"
            : "Unmatched listings are limited until your account is verified — add GTINs or wait for verification",
        });
        continue;
      }
      await prisma.productMatch.create({
        data: {
          retailerId: retailer.id,
          candidateTitle: title.value,
          candidateData: JSON.parse(JSON.stringify(listing)) as Prisma.InputJsonValue,
          confidenceBp: 0,
          method: "manual",
          status: "pending_review",
          conflicts: listing.product.gtin ? ["gtin_not_in_catalog"] : ["no_gtin"],
        },
      });
      pendingMatches++;
      accepted++;
      continue;
    }

    const stock =
      o.availability === "in_stock" ? "in_stock" : o.availability === "limited" ? "low_stock" : o.availability === "out_of_stock" ? "out_of_stock" : o.availability === "preorder" ? "preorder" : "unknown";
    const existing = existingBySku.get(listing.product.retailerSku);
    const now = new Date();
    const saved = await prisma.offer.upsert({
      where: { retailerId_retailerSku: { retailerId: retailer.id, retailerSku: listing.product.retailerSku } },
      update: {
        title: title.value,
        url: target,
        priceCents: o.priceCents,
        listPriceCents: o.listPriceCents,
        shippingCents: o.shippingCents,
        stock,
        feedId,
        lastCheckedAt: now,
        ...(existing && existing.priceCents !== o.priceCents ? { lastChangedAt: now } : {}),
      },
      create: {
        productId: product.id,
        retailerId: retailer.id,
        retailerSku: listing.product.retailerSku,
        title: title.value,
        url: target,
        condition: o.condition,
        priceCents: o.priceCents,
        listPriceCents: o.listPriceCents,
        shippingCents: o.shippingCents,
        currency: o.currency,
        stock,
        source: "merchant_upload",
        isActive: live && !storeOnly && (!local || feedApproved),
        feedId,
        merchantAccountId: acc?.id ?? null,
      },
    });
    if (!existing || existing.priceCents !== o.priceCents || existing.stock !== stock) {
      await prisma.priceHistory
        .create({
          data: { offerId: saved.id, observedAt: now, productId: saved.productId, retailerId: retailer.id, priceCents: o.priceCents, shippingCents: o.shippingCents, stock, source: "merchant_upload" },
        })
        .catch(() => undefined);
      if (existing) {
        await enqueuePriceEvent({
          offerId: existing.id,
          previousPriceCents: existing.priceCents,
          newPriceCents: o.priceCents,
          previousInStock: existing.stock !== "out_of_stock",
          newInStock: stock !== "out_of_stock",
          occurredAt: now.toISOString(),
        });
      }
    }
    accepted++;
  }
  if (parsed.listings.length > FEED_MAX_ROWS) {
    errors.push({ row: FEED_MAX_ROWS + 1, field: null, message: `Only the first ${FEED_MAX_ROWS} rows were processed` });
  }

  await prisma.retailerFeed.update({
    where: { id: feedId },
    data: {
      status: "completed",
      rowsTotal: parsed.stats.rows,
      rowsAccepted: accepted,
      rowsRejected: parsed.stats.rows - accepted,
      errors: errors.slice(0, 500) as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}
