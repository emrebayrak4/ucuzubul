/**
 * Coupon tracking core (API + worker): mapping, usage-based verification stats, auto status changes,
 * follow/alert notifications, expiry/re-verification jobs and feed ingestion (adapters pending without keys).
 * All stats come from real CouponEvent rows only.
 */
import type { Coupon as CouponDto } from "@pricora/contracts";
import type { Prisma, PrismaClient } from "@pricora/database";
import type { EnvLike } from "@pricora/retailer-adapters";

const DAY_MS = 86_400_000;
export const LIVE_STATUSES = ["active", "unverified"] as const;
export const COUPONS_QUEUE = "coupons";
/** Consecutive recent failures before active → unverified, and unverified → reported. */
export const DOWNGRADE_AFTER = 3;
export const REPORT_AFTER = 5;
export const REVERIFY_AFTER_DAYS = 30;
const NOTIFY_COOLDOWN_MS = 6 * 3_600_000;

export const couponInclude = {
  retailer: { select: { id: true, slug: true, name: true, logoUrl: true, brandColor: true } },
  category: { select: { slug: true } },
  product: { select: { slug: true } },
} satisfies Prisma.CouponInclude;
export type CouponRow = Prisma.CouponGetPayload<{ include: typeof couponInclude }>;

export function toCoupon(c: CouponRow): CouponDto {
  return {
    id: c.id,
    retailer: c.retailer,
    code: c.code,
    title: c.title,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    minSpendCents: c.minSpendCents,
    scope: { categorySlug: c.category?.slug ?? null, productSlug: c.product?.slug ?? null },
    startsAt: c.startsAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    source: c.source,
    status: c.status,
    stats: {
      successRate: c.successRateBp === null ? null : c.successRateBp / 10_000,
      successCount: c.successCount,
      failCount: c.failCount,
      lastWorkedAt: c.lastWorkedAt?.toISOString() ?? null,
      lastVerifiedAt: c.lastVerifiedAt?.toISOString() ?? null,
      avgSavingsCents: c.avgSavingsCents,
    },
    goUrl: `/v1/coupons/${c.id}/go`,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Coupons are usable when live and inside their validity window. */
export function liveWhere(now = new Date()): Prisma.CouponWhereInput {
  return {
    status: { in: [...LIVE_STATUSES] },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
  };
}

/** Recomputes stats from events and applies automatic status changes. Returns the updated row. */
export async function recomputeCoupon(prisma: PrismaClient, couponId: string, now = new Date()): Promise<CouponRow> {
  const since = new Date(now.getTime() - 90 * DAY_MS);
  const [coupon, recent, all] = await Promise.all([
    prisma.coupon.findUniqueOrThrow({ where: { id: couponId } }),
    prisma.couponEvent.findMany({ where: { couponId, type: { in: ["worked", "failed"] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    prisma.couponEvent.groupBy({ by: ["type"], where: { couponId, type: { in: ["worked", "failed"] } }, _count: { _all: true } }),
  ]);
  const wWorked = recent.filter((e) => e.type === "worked").reduce((n, e) => n + e.weight, 0);
  const wFailed = recent.filter((e) => e.type === "failed").reduce((n, e) => n + e.weight, 0);
  const savings = recent.filter((e) => e.type === "worked" && e.savingsCents !== null).map((e) => e.savingsCents ?? 0);
  const lastWorked = recent.find((e) => e.type === "worked")?.createdAt ?? coupon.lastWorkedAt;
  const lastFailed = recent.find((e) => e.type === "failed")?.createdAt ?? coupon.lastFailedAt;
  let consecutiveFails = 0;
  for (const e of recent) {
    if (e.type === "failed") consecutiveFails++;
    else break;
  }

  let status = coupon.status;
  const expired = coupon.expiresAt !== null && coupon.expiresAt <= now;
  if (!expired && recent[0]?.type === "worked" && status === "unverified") status = "active";
  else if (status === "active" && consecutiveFails >= DOWNGRADE_AFTER) status = "unverified";
  else if (status === "unverified" && consecutiveFails >= REPORT_AFTER) status = "reported";

  const updated = await prisma.coupon.update({
    where: { id: couponId },
    data: {
      successCount: all.find((g) => g.type === "worked")?._count._all ?? 0,
      failCount: all.find((g) => g.type === "failed")?._count._all ?? 0,
      successRateBp: wWorked + wFailed > 0 ? Math.round((wWorked / (wWorked + wFailed)) * 10_000) : null,
      avgSavingsCents: savings.length ? Math.round(savings.reduce((a, b) => a + b, 0) / savings.length) : null,
      lastWorkedAt: lastWorked,
      lastFailedAt: lastFailed,
      ...(recent[0]?.type === "worked" ? { lastVerifiedAt: recent[0].createdAt } : {}),
      status,
    },
    include: couponInclude,
  });
  if (status !== coupon.status) {
    await prisma.couponEvent.create({
      data: { couponId, retailerId: coupon.retailerId, type: status === "active" ? "activated" : status === "reported" ? "reported" : "status_changed", channel: "system", note: `${coupon.status} → ${status}` },
    });
    if (status === "active") await notifyCouponLive(prisma, couponId);
  }
  return updated;
}

export interface UsageReport {
  worked: boolean;
  orderTotalCents?: number;
  savingsCents?: number;
  channel: "web" | "extension" | "mobile";
  userId: string | null;
  fingerprintHash: string | null;
}

/** Records a real usage report. One report per coupon per user/device per 24 h. */
export async function recordCouponResult(prisma: PrismaClient, couponId: string, r: UsageReport): Promise<{ recorded: boolean; reason: string | null; coupon: CouponRow }> {
  const coupon = await prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
  if (!r.userId && !r.fingerprintHash) throw new Error("report needs a user or fingerprint");
  const since = new Date(Date.now() - DAY_MS);
  const dup = await prisma.couponEvent.findFirst({
    where: {
      couponId,
      type: { in: ["worked", "failed"] },
      createdAt: { gte: since },
      OR: [...(r.userId ? [{ userId: r.userId }] : []), ...(r.fingerprintHash ? [{ fingerprintHash: r.fingerprintHash }] : [])],
    },
  });
  if (dup) {
    return { recorded: false, reason: "Already reported from this account/device in the last 24 hours", coupon: await prisma.coupon.findUniqueOrThrow({ where: { id: couponId }, include: couponInclude }) };
  }
  await prisma.couponEvent.create({
    data: {
      couponId,
      retailerId: coupon.retailerId,
      type: r.worked ? "worked" : "failed",
      channel: r.channel,
      userId: r.userId,
      fingerprintHash: r.fingerprintHash,
      orderTotalCents: r.orderTotalCents ?? null,
      // Savings only make sense for successful applications.
      savingsCents: r.worked ? (r.savingsCents ?? null) : null,
      weight: r.userId ? 3 : 1,
    },
  });
  return { recorded: true, reason: null, coupon: await recomputeCoupon(prisma, couponId) };
}

/** Notifies followers of the store and matching `coupon` price alerts. Dedupe per coupon/user, 6 h cooldown per store. */
export async function notifyCouponLive(prisma: PrismaClient, couponId: string): Promise<number> {
  const c = await prisma.coupon.findUnique({ where: { id: couponId }, include: { retailer: true, product: { select: { slug: true } } } });
  if (!c || !["active", "unverified"].includes(c.status)) return 0;
  const now = Date.now();
  const title = `New ${c.retailer.name} coupon`;
  const body = c.code ? `${c.title} — code ${c.code}` : c.title;
  const url = c.product ? `/products/${c.product.slug}` : `/stores/${c.retailer.slug}/coupons`;
  let created = 0;

  const followers = await prisma.couponFollow.findMany({ where: { retailerId: c.retailerId }, select: { userId: true } });
  for (const f of followers) {
    const recent = await prisma.notification.findFirst({
      where: { userId: f.userId, type: "coupon.followed_store", url: { startsWith: `/stores/${c.retailer.slug}` }, createdAt: { gte: new Date(now - NOTIFY_COOLDOWN_MS) } },
    });
    if (recent) continue;
    const r = await prisma.notification.createMany({
      data: [{ userId: f.userId, type: "coupon.followed_store", title, body, url, channel: "in_app", dedupeKey: `coupon:${c.id}:user:${f.userId}` }],
      skipDuplicates: true,
    });
    created += r.count;
  }

  // Product alerts of type "coupon": product sold at this store; coupon store-wide or scoped to it.
  const alerts = await prisma.priceAlert.findMany({
    where: {
      type: "coupon",
      active: true,
      OR: [{ retailerId: null }, { retailerId: c.retailerId }],
      product: {
        offers: { some: { retailerId: c.retailerId, isActive: true } },
        ...(c.productId ? { id: c.productId } : {}),
        ...(c.categoryId && !c.productId ? { categoryId: c.categoryId } : {}),
      },
    },
    include: { product: { select: { slug: true, title: true } } },
  });
  for (const a of alerts) {
    if (a.cooldownUntil && a.cooldownUntil.getTime() > now) continue;
    const r = await prisma.notification.createMany({
      data: [{ userId: a.userId, alertId: a.id, type: "price_alert.coupon", title: a.product.title, body: `${c.retailer.name}: ${body}`, url: `/products/${a.product.slug}`, channel: "in_app", dedupeKey: `coupon:${c.id}:alert:${a.id}` }],
      skipDuplicates: true,
    });
    if (r.count) {
      created += r.count;
      await prisma.priceAlert.update({ where: { id: a.id }, data: { lastTriggeredAt: new Date(now), cooldownUntil: new Date(now + NOTIFY_COOLDOWN_MS) } });
    }
  }
  return created;
}

/** Marks coupons past expiresAt as expired (with events). */
export async function expireCoupons(prisma: PrismaClient, now = new Date()): Promise<number> {
  const due = await prisma.coupon.findMany({
    where: { expiresAt: { lte: now }, status: { in: ["active", "unverified", "reported", "pending_approval"] } },
    select: { id: true, retailerId: true },
  });
  if (!due.length) return 0;
  await prisma.coupon.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { status: "expired" } });
  await prisma.couponEvent.createMany({ data: due.map((d) => ({ couponId: d.id, retailerId: d.retailerId, type: "expired" as const, channel: "system" as const })) });
  return due.length;
}

/** Active coupons with no successful report for 30 days go back to "unverified" so they get re-checked. */
export async function reverifyStaleCoupons(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REVERIFY_AFTER_DAYS * DAY_MS);
  const stale = await prisma.coupon.findMany({
    where: {
      status: "active",
      source: { notIn: ["admin", "merchant"] },
      createdAt: { lt: cutoff },
      OR: [{ lastWorkedAt: null }, { lastWorkedAt: { lt: cutoff } }],
    },
    select: { id: true, retailerId: true },
  });
  if (!stale.length) return 0;
  await prisma.coupon.updateMany({ where: { id: { in: stale.map((s) => s.id) } }, data: { status: "unverified" } });
  await prisma.couponEvent.createMany({ data: stale.map((s) => ({ couponId: s.id, retailerId: s.retailerId, type: "status_changed" as const, channel: "system" as const, note: "re-verify: no successful report in 30 days" })) });
  return stale.length;
}

// ───────────────────────── ingestion ─────────────────────────

export interface NormalizedCoupon {
  source: "api" | "feed" | "affiliate";
  externalId: string;
  retailerId: string;
  code: string | null;
  title: string;
  description: string | null;
  discountType: "percent" | "amount" | "free_shipping" | "bogo" | "other";
  discountValue: number | null;
  minSpendCents: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  affiliateUrl: string | null;
}

/** Dedupe by (source, externalId) and by (retailer, code); new coupons start "unverified". */
export async function upsertIngestedCoupon(prisma: PrismaClient, n: NormalizedCoupon): Promise<"created" | "updated"> {
  const existing =
    (await prisma.coupon.findUnique({ where: { source_externalId: { source: n.source, externalId: n.externalId } } })) ??
    (n.code ? await prisma.coupon.findFirst({ where: { retailerId: n.retailerId, code: { equals: n.code, mode: "insensitive" } } }) : null);
  const data = {
    title: n.title,
    description: n.description,
    discountType: n.discountType,
    discountValue: n.discountValue,
    minSpendCents: n.minSpendCents,
    startsAt: n.startsAt,
    expiresAt: n.expiresAt,
    affiliateUrl: n.affiliateUrl,
  };
  if (existing) {
    await prisma.coupon.update({ where: { id: existing.id }, data });
    return "updated";
  }
  const c = await prisma.coupon.create({ data: { ...data, retailerId: n.retailerId, code: n.code, source: n.source, externalId: n.externalId, status: "unverified" } });
  await prisma.couponEvent.create({ data: { couponId: c.id, retailerId: c.retailerId, type: "created", channel: "system", note: `ingested from ${n.source}` } });
  return "created";
}

/** Affiliate-network promo/coupon APIs. Each needs credentials (admin → Integrations); none is implemented without them. */
export const COUPON_FEED_SOURCES: readonly { id: string; name: string; requiredEnv: readonly string[]; docsUrl: string }[] = [
  { id: "cj", name: "CJ Affiliate — Link/Promotion API", requiredEnv: ["CJ_PERSONAL_ACCESS_TOKEN", "CJ_WEBSITE_ID"], docsUrl: "https://developers.cj.com/" },
  { id: "impact", name: "Impact — Promo codes (Ads/Deals API)", requiredEnv: ["IMPACT_ACCOUNT_SID", "IMPACT_AUTH_TOKEN"], docsUrl: "https://integrations.impact.com/impact-publisher/reference" },
  { id: "rakuten", name: "Rakuten Advertising — Coupon Web Service", requiredEnv: ["RAKUTEN_CLIENT_ID", "RAKUTEN_CLIENT_SECRET", "RAKUTEN_SID"], docsUrl: "https://developers.rakutenadvertising.com/" },
  { id: "awin", name: "Awin — Offers/Promotions API", requiredEnv: ["AWIN_API_TOKEN", "AWIN_PUBLISHER_ID"], docsUrl: "https://wiki.awin.com/index.php/Publisher_API" },
  { id: "ebay_epn", name: "eBay Partner Network — coupons/deals", requiredEnv: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_EPN_CAMPAIGN_ID"], docsUrl: "https://partnernetwork.ebay.com/" },
  { id: "amazon", name: "Amazon — promotions via Creators API (where allowed)", requiredEnv: ["AMAZON_CREATORS_CREDENTIAL_ID", "AMAZON_CREATORS_CREDENTIAL_SECRET", "AMAZON_ASSOCIATE_TAG"], docsUrl: "https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction" },
];

export interface FeedPullResult {
  id: string;
  status: "pending_configuration" | "not_implemented" | "ok" | "error";
  message: string;
  created: number;
  updated: number;
}

/**
 * Pulls coupons from every configured network. Without credentials a source is skipped as
 * pending_configuration; with credentials it reports not_implemented until its client is built —
 * nothing is ever fabricated.
 */
export async function pullCouponFeeds(_prisma: PrismaClient, env: EnvLike): Promise<FeedPullResult[]> {
  return COUPON_FEED_SOURCES.map((s) => {
    const missing = s.requiredEnv.filter((k) => !env[k]);
    return missing.length
      ? { id: s.id, status: "pending_configuration" as const, message: `Missing ${missing.join(", ")}`, created: 0, updated: 0 }
      : { id: s.id, status: "not_implemented" as const, message: "Credentials present; network coupon client not implemented yet", created: 0, updated: 0 };
  });
}
