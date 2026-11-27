import { createHash } from "node:crypto";
import { applySubId } from "@pricora/retailer-adapters";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { parseProductUrl } from "@pricora/algorithms";
import type { ServerEnv } from "@pricora/config/env";
import type {
  AdminCheckoutConfig,
  AdminCoupon,
  AdminCouponListResponse,
  Coupon,
  CouponFollow,
  CouponFollowListResponse,
  CouponListQuery,
  CouponListResponse,
  CouponResultResponse,
  ExtensionConfigResponse,
  ExtensionCouponsResponse,
  ExtensionProductResponse,
  OkResponse,
  RetailerCouponStats,
} from "@pricora/contracts";
import type { Prisma, User } from "@pricora/database";
import type { Response } from "express";
import { Auth, type AuthedRequest, CurrentUser, randomToken, requireEditor } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { couponInclude, liveWhere, notifyCouponLive, recordCouponResult, toCoupon, type CouponRow } from "../core/coupons";
import { CatalogService, offerInclude } from "../services/catalog.service";
import { gtinVariants } from "../services/search.service";
import { isAllowedRedirect } from "./go.controller";

const DAY_MS = 86_400_000;

/** parseProductUrl retailer keys → our retailer slugs. */
const URL_RETAILER: Record<string, string> = { amazon: "amazon", walmart: "walmart", bestbuy: "best-buy", target: "target", ebay: "ebay", homedepot: "home-depot", lowes: "lowes", newegg: "newegg", costco: "costco" };

function page<T>(items: T[], total: number, p: number, size: number) {
  return { items, page: p, pageSize: size, total, totalPages: Math.ceil(total / size) };
}

function adminOut(c: CouponRow & { createdBy?: { id: string; email: string } | null }): AdminCoupon {
  return { ...toCoupon(c), createdBy: c.createdBy ?? null, merchantAccountId: c.merchantAccountId, affiliateUrl: c.affiliateUrl };
}

@Controller()
export class CouponsController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  // ───────── public listing ─────────
  private async listCoupons(q: Omit<CouponListQuery, "retailer"> & { retailer?: string }): Promise<CouponListResponse> {
    const now = new Date();
    const statusWhere: Prisma.CouponWhereInput =
      q.status === "all_live" ? liveWhere(now) : q.status === "expired" ? { status: "expired" } : { ...liveWhere(now), status: q.status };
    const catIds = q.category ? ((await this.catalog.categorySubtreeIds(q.category)) ?? []) : null;
    const where: Prisma.CouponWhereInput = {
      ...statusWhere,
      ...(q.retailer ? { retailer: { slug: q.retailer } } : {}),
      ...(catIds ? { OR: [{ categoryId: { in: catIds } }, { product: { categoryId: { in: catIds } } }] } : {}),
    };
    const orderBy: Prisma.CouponOrderByWithRelationInput[] =
      q.sort === "expiring"
        ? [{ expiresAt: { sort: "asc", nulls: "last" } }]
        : q.sort === "popular"
          ? [{ successCount: "desc" }, { createdAt: "desc" }]
          : q.sort === "success_rate"
            ? [{ successRateBp: { sort: "desc", nulls: "last" } }, { successCount: "desc" }]
            : [{ createdAt: "desc" }];
    const [total, rows] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: couponInclude }),
    ]);
    return page(rows.map(toCoupon), total, q.page, q.pageSize);
  }

  @Get("coupons")
  list(@Query() query: unknown): Promise<CouponListResponse> {
    return this.listCoupons(input("coupons.list", "query", query));
  }

  @Get("coupons/:id")
  async get(@Param() params: unknown): Promise<Coupon> {
    const { id } = input("coupons.get", "params", params);
    const c = await this.prisma.coupon.findUnique({ where: { id }, include: couponInclude });
    if (!c || c.status === "pending_approval" || c.status === "rejected") throw notFound("Coupon");
    return toCoupon(c);
  }

  @Get("retailers/:slug/coupons")
  async forRetailer(@Param() params: unknown, @Query() query: unknown): Promise<CouponListResponse> {
    const { slug } = input("coupons.retailer", "params", params);
    if (!(await this.prisma.retailer.findUnique({ where: { slug } }))) throw notFound("Retailer");
    return this.listCoupons({ ...input("coupons.retailer", "query", query), retailer: slug });
  }

  @Get("retailers/:slug/coupon-stats")
  async stats(@Param() params: unknown): Promise<RetailerCouponStats> {
    const { slug } = input("coupons.retailerStats", "params", params);
    const r = await this.prisma.retailer.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, logoUrl: true, brandColor: true } });
    if (!r) throw notFound("Retailer");
    const now = new Date();
    const since90 = new Date(now.getTime() - 90 * DAY_MS);
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const [active, unverified, events90, history] = await Promise.all([
      this.prisma.coupon.count({ where: { ...liveWhere(now), retailerId: r.id, status: "active" } }),
      this.prisma.coupon.count({ where: { ...liveWhere(now), retailerId: r.id, status: "unverified" } }),
      this.prisma.couponEvent.findMany({ where: { retailerId: r.id, type: { in: ["worked", "failed"] }, createdAt: { gte: since90 } }, orderBy: { createdAt: "desc" } }),
      this.prisma.couponEvent.findMany({ where: { retailerId: r.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    ]);
    const worked = events90.filter((e) => e.type === "worked");
    const wW = worked.reduce((n, e) => n + e.weight, 0);
    const wF = events90.filter((e) => e.type === "failed").reduce((n, e) => n + e.weight, 0);
    const savings = worked.filter((e) => e.savingsCents !== null).map((e) => e.savingsCents ?? 0);
    const best30 = worked.filter((e) => e.createdAt >= since30 && e.couponId).sort((a, b) => (b.savingsCents ?? 0) - (a.savingsCents ?? 0))[0];
    const best = best30?.couponId ? await this.prisma.coupon.findFirst({ where: { id: best30.couponId, ...liveWhere(now) }, include: couponInclude }) : null;
    const recent = events90.filter((e) => e.createdAt >= since30);
    return {
      retailer: r,
      activeCount: active,
      unverifiedCount: unverified,
      avgSavingsCents: savings.length ? Math.round(savings.reduce((a, b) => a + b, 0) / savings.length) : null,
      successRate90d: wW + wF > 0 ? Math.round((wW / (wW + wF)) * 10_000) / 10_000 : null,
      reports30d: { worked: recent.filter((e) => e.type === "worked").length, failed: recent.filter((e) => e.type === "failed").length },
      lastWorkedAt: worked[0]?.createdAt.toISOString() ?? null,
      bestRecent: best ? toCoupon(best) : null,
      history: history.map((h) => ({ type: h.type, couponId: h.couponId, at: h.createdAt.toISOString() })),
    };
  }

  // ───────── submissions / results ─────────
  @Post("coupons")
  @Auth("user")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async submit(@Body() body: unknown, @CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<Coupon> {
    const b = input("coupons.submit", "body", body);
    const retailer = await this.prisma.retailer.findUnique({ where: { slug: b.retailerSlug } });
    if (!retailer || !retailer.isActive) throw notFound("Retailer");
    if (b.code) {
      const dup = await this.prisma.coupon.findFirst({ where: { retailerId: retailer.id, code: { equals: b.code, mode: "insensitive" }, status: { notIn: ["rejected", "expired"] } }, include: couponInclude });
      if (dup) {
        res.status(200);
        return toCoupon(dup);
      }
    }
    const c = await this.prisma.coupon.create({
      data: {
        retailerId: retailer.id,
        code: b.code,
        title: b.title,
        description: b.description ?? null,
        discountType: b.discountType,
        discountValue: b.discountValue ?? null,
        minSpendCents: b.minSpendCents ?? null,
        expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
        source: "community",
        status: "unverified",
        createdById: user.id,
      },
      include: couponInclude,
    });
    await this.prisma.couponEvent.create({ data: { couponId: c.id, retailerId: retailer.id, type: "created", channel: "web", userId: user.id } });
    res.status(201);
    return toCoupon(c);
  }

  private fingerprint(req: AuthedRequest, deviceId?: string): string {
    const raw = deviceId ? `dev:${deviceId}` : `ipua:${req.ip ?? ""}|${req.headers["user-agent"] ?? ""}`;
    return createHash("sha256").update(`${raw}|${this.env.SESSION_SECRET}`).digest("hex");
  }

  private async liveCoupon(id: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c || c.status === "pending_approval" || c.status === "rejected") throw notFound("Coupon");
    return c;
  }

  @Post("coupons/:id/result")
  @HttpCode(200)
  @Auth("optional")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async result(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<CouponResultResponse> {
    const { id } = input("coupons.result", "params", params);
    const b = input("coupons.result", "body", body);
    await this.liveCoupon(id);
    const r = await recordCouponResult(this.prisma, id, {
      worked: b.worked,
      orderTotalCents: b.orderTotalCents,
      savingsCents: b.savingsCents,
      channel: b.source,
      userId: req.user?.id ?? null,
      fingerprintHash: this.fingerprint(req, b.deviceId),
    });
    return { recorded: r.recorded, reason: r.reason, coupon: toCoupon(r.coupon) };
  }

  @Post("coupons/:id/vote")
  @HttpCode(200)
  @Auth("user")
  async vote(@Param() params: unknown, @Body() body: unknown, @CurrentUser() user: User, @Req() req: AuthedRequest): Promise<CouponResultResponse> {
    const { id } = input("coupons.vote", "params", params);
    const { worked } = input("coupons.vote", "body", body);
    await this.liveCoupon(id);
    await this.prisma.couponVote.upsert({ where: { userId_couponId: { userId: user.id, couponId: id } }, update: { worked }, create: { userId: user.id, couponId: id, worked } });
    const r = await recordCouponResult(this.prisma, id, { worked, channel: "web", userId: user.id, fingerprintHash: this.fingerprint(req) });
    return { recorded: r.recorded, reason: r.reason, coupon: toCoupon(r.coupon) };
  }

  @Get("coupons/:id/go")
  @Auth("optional")
  async go(@Param() params: unknown, @Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const { id } = input("coupons.go", "params", params);
    const c = await this.prisma.coupon.findUnique({ where: { id }, include: { retailer: true } });
    if (!c || c.status === "pending_approval" || c.status === "rejected") throw notFound("Coupon");
    const url = isAllowedRedirect(c.affiliateUrl ?? c.retailer.websiteUrl, c.retailer.domain, c.retailer.allowedRedirectHosts);
    if (!url) throw new ApiException(400, "bad_request", "Outbound link is not on the retailer allow-list");
    const subId = randomToken(12);
    await this.prisma.affiliateClick.create({
      data: {
        kind: "coupon",
        subId,
        couponId: c.id,
        retailerId: c.retailerId,
        productId: c.productId,
        userId: req.user?.id ?? null,
        placement: "coupon",
        targetHost: url.hostname,
        ipHash: req.ip ? createHash("sha256").update(`${req.ip}|${new Date().toISOString().slice(0, 10)}|${this.env.SESSION_SECRET}`).digest("hex") : null,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      },
    });
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, applySubId(url.toString(), subId));
  }

  // ───────── follows ─────────
  private async followOut(userId: string, retailerIds?: string[]): Promise<CouponFollow[]> {
    const rows = await this.prisma.couponFollow.findMany({
      where: { userId, ...(retailerIds ? { retailerId: { in: retailerIds } } : {}) },
      include: { retailer: { select: { id: true, slug: true, name: true, logoUrl: true, brandColor: true } } },
      orderBy: { createdAt: "desc" },
    });
    const counts = await this.prisma.coupon.groupBy({ by: ["retailerId"], where: { ...liveWhere(), retailerId: { in: rows.map((r) => r.retailerId) } }, _count: { _all: true } });
    return rows.map((r) => ({ retailer: r.retailer, activeCoupons: counts.find((c) => c.retailerId === r.retailerId)?._count._all ?? 0, createdAt: r.createdAt.toISOString() }));
  }

  @Get("me/coupon-follows")
  @Auth("user")
  async follows(@CurrentUser() user: User): Promise<CouponFollowListResponse> {
    return { items: await this.followOut(user.id) };
  }

  @Post("me/coupon-follows")
  @Auth("user")
  async follow(@Body() body: unknown, @CurrentUser() user: User): Promise<CouponFollow> {
    const { retailerSlug } = input("me.couponFollows.create", "body", body);
    const r = await this.prisma.retailer.findUnique({ where: { slug: retailerSlug } });
    if (!r || !r.isActive) throw notFound("Retailer");
    await this.prisma.couponFollow.upsert({ where: { userId_retailerId: { userId: user.id, retailerId: r.id } }, update: {}, create: { userId: user.id, retailerId: r.id } });
    const [out] = await this.followOut(user.id, [r.id]);
    if (!out) throw notFound("Follow");
    return out;
  }

  @Delete("me/coupon-follows/:retailerSlug")
  @Auth("user")
  async unfollow(@Param() params: unknown, @CurrentUser() user: User): Promise<OkResponse> {
    const { retailerSlug } = input("me.couponFollows.delete", "params", params);
    await this.prisma.couponFollow.deleteMany({ where: { userId: user.id, retailer: { slug: retailerSlug } } });
    return { ok: true };
  }

  // ───────── browser extension ─────────
  @Get("extension/config")
  async extensionConfig(@Res({ passthrough: true }) res: Response): Promise<ExtensionConfigResponse> {
    const rows = await this.prisma.retailerCheckoutConfig.findMany({ where: { enabled: true, retailer: { isActive: true } }, include: { retailer: { select: { slug: true, name: true } } }, orderBy: { retailerId: "asc" } });
    const configs = rows.map((c) => ({
      retailerSlug: c.retailer.slug,
      retailerName: c.retailer.name,
      hostPatterns: c.hostPatterns,
      checkoutUrlPatterns: c.checkoutUrlPatterns,
      couponInputSelector: c.couponInputSelector,
      applyButtonSelector: c.applyButtonSelector,
      totalSelector: c.totalSelector,
      successIndicatorSelector: c.successIndicatorSelector,
      errorIndicatorSelector: c.errorIndicatorSelector,
      removeButtonSelector: c.removeButtonSelector,
      version: c.version,
    }));
    const version = createHash("sha256").update(JSON.stringify(configs)).digest("hex").slice(0, 16);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    res.setHeader("ETag", `"${version}"`);
    return { version, configs, generatedAt: new Date().toISOString() };
  }

  private async retailerForHost(host: string) {
    const h = host.replace(/^www\./, "");
    const retailers = await this.prisma.retailer.findMany({ where: { isActive: true }, include: { checkoutConfig: true } });
    return (
      retailers.find((r) => h === r.domain || h.endsWith(`.${r.domain}`)) ??
      retailers.find((r) =>
        (r.checkoutConfig?.hostPatterns ?? []).some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) || h === p.slice(2) : h === p)),
      ) ??
      null
    );
  }

  @Get("extension/coupons")
  async extensionCoupons(@Query() query: unknown): Promise<ExtensionCouponsResponse> {
    const { host } = input("extension.coupons", "query", query);
    const r = await this.retailerForHost(host);
    if (!r) return { retailer: null, coupons: [] };
    const rows = await this.prisma.coupon.findMany({
      where: { ...liveWhere(), retailerId: r.id, code: { not: null }, status: { in: ["active", "unverified"] } },
      orderBy: [{ status: "asc" }, { successRateBp: { sort: "desc", nulls: "last" } }, { successCount: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: couponInclude,
    });
    return { retailer: { id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, brandColor: r.brandColor }, coupons: rows.map(toCoupon) };
  }

  @Get("extension/product")
  async extensionProduct(@Query() query: unknown): Promise<ExtensionProductResponse> {
    const { url } = input("extension.product", "query", query);
    const parsed = parseProductUrl(url);
    if (!parsed) return { status: "not_found", reason: "Not a recognised product page URL", retailer: null };
    const slug = URL_RETAILER[parsed.retailer] ?? parsed.retailer;
    const retailer = await this.prisma.retailer.findUnique({ where: { slug } });
    if (!parsed.id || !retailer) return { status: "not_found", reason: "No product id in URL or store not tracked", retailer: slug };
    const pid = parsed.id;
    const offer = await this.prisma.offer.findFirst({ where: { retailerId: retailer.id, retailerSku: pid, isActive: true } });
    const ident = offer
      ? null
      : await this.prisma.productIdentifier.findFirst({ where: { OR: [{ value: pid, retailerId: retailer.id }, { value: { in: /^\d{8,14}$/.test(pid) ? gtinVariants(pid) : [pid] } }] }, select: { productId: true } });
    const productId = offer?.productId ?? ident?.productId;
    if (!productId) return { status: "not_found", reason: "We don't track this product yet", retailer: slug };
    const [card] = await this.catalog.cards([productId]);
    if (!card) return { status: "not_found", reason: "We don't track this product yet", retailer: slug };
    const offers = (await this.prisma.offer.findMany({ where: { productId, isActive: true, stock: { not: "out_of_stock" } }, include: offerInclude })).map((o) => this.catalog.toOffer(o));
    const current = offers.find((o) => o.retailer.id === retailer.id) ?? null;
    const base = current?.estimatedTotalCents ?? Number.POSITIVE_INFINITY;
    return {
      status: "found",
      product: card,
      currentOffer: current,
      cheaperElsewhere: offers.filter((o) => o.retailer.id !== retailer.id && o.estimatedTotalCents < base).sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents).slice(0, 5),
    };
  }

  // ───────── admin ─────────
  private async audit(req: AuthedRequest, action: string, entityType: string, id: string, diff: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId: req.user?.id ?? null, action, entityType, entityId: id, diff: (diff ?? null) as Prisma.InputJsonValue, ip: req.ip ?? null, userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null },
    });
  }

  @Get("admin/coupons")
  @Auth("staff")
  async adminList(@Query() query: unknown): Promise<AdminCouponListResponse> {
    const q = input("admin.coupons.list", "query", query);
    const where: Prisma.CouponWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.retailer ? { retailer: { slug: q.retailer } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { code: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { ...couponInclude, createdBy: { select: { id: true, email: true } } } }),
    ]);
    return page(rows.map(adminOut), total, q.page, q.pageSize);
  }

  private dates(b: { startsAt?: string | null; expiresAt?: string | null }) {
    return {
      ...(b.startsAt !== undefined ? { startsAt: b.startsAt ? new Date(b.startsAt) : null } : {}),
      ...(b.expiresAt !== undefined ? { expiresAt: b.expiresAt ? new Date(b.expiresAt) : null } : {}),
    };
  }

  @Post("admin/coupons")
  @Auth("staff")
  async adminCreate(@Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminCoupon> {
    requireEditor(user);
    const b = input("admin.coupons.create", "body", body);
    const retailer = await this.prisma.retailer.findUnique({ where: { id: b.retailerId } });
    if (!retailer) throw notFound("Retailer");
    if (b.code && (await this.prisma.coupon.findFirst({ where: { retailerId: retailer.id, code: { equals: b.code, mode: "insensitive" }, status: { notIn: ["rejected", "expired"] } } }))) {
      throw new ApiException(409, "conflict", "This store already has a live coupon with that code");
    }
    const { startsAt: _s, expiresAt: _e, ...rest } = b;
    const c = await this.prisma.coupon.create({
      data: { ...rest, ...this.dates(b), source: "admin", createdById: user.id },
      include: { ...couponInclude, createdBy: { select: { id: true, email: true } } },
    });
    await this.prisma.couponEvent.create({ data: { couponId: c.id, retailerId: c.retailerId, type: "created", channel: "admin", userId: user.id } });
    await this.audit(req, "coupon.create", "Coupon", c.id, { ...b });
    if (c.status === "active") await notifyCouponLive(this.prisma, c.id);
    return adminOut(c);
  }

  @Patch("admin/coupons/:id")
  @Auth("staff")
  async adminUpdate(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminCoupon> {
    requireEditor(user);
    const { id } = input("admin.coupons.update", "params", params);
    const b = input("admin.coupons.update", "body", body);
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw notFound("Coupon");
    const { startsAt: _s, expiresAt: _e, ...rest } = b;
    const c = await this.prisma.coupon.update({ where: { id }, data: { ...rest, ...this.dates(b) }, include: { ...couponInclude, createdBy: { select: { id: true, email: true } } } });
    if (b.status && b.status !== before.status) {
      await this.prisma.couponEvent.create({
        data: { couponId: id, retailerId: c.retailerId, type: b.status === "active" ? "activated" : b.status === "expired" ? "expired" : b.status === "reported" ? "reported" : "status_changed", channel: "admin", userId: user.id, note: `${before.status} → ${b.status}` },
      });
      if (b.status === "active") await notifyCouponLive(this.prisma, id);
    }
    await this.audit(req, "coupon.update", "Coupon", id, { before: { status: before.status, title: before.title, code: before.code }, after: b });
    return adminOut(c);
  }

  @Delete("admin/coupons/:id")
  @Auth("staff")
  async adminDelete(@Param() params: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.coupons.delete", "params", params);
    const before = await this.prisma.coupon.findUnique({ where: { id } });
    if (!before) throw notFound("Coupon");
    await this.prisma.coupon.delete({ where: { id } });
    await this.audit(req, "coupon.delete", "Coupon", id, { code: before.code, title: before.title, retailerId: before.retailerId });
    return { ok: true };
  }

  private configOut(c: Prisma.RetailerCheckoutConfigGetPayload<{ include: { retailer: { select: { slug: true; name: true } } } }>): AdminCheckoutConfig {
    return {
      id: c.id,
      retailerId: c.retailerId,
      retailerSlug: c.retailer.slug,
      retailerName: c.retailer.name,
      hostPatterns: c.hostPatterns,
      checkoutUrlPatterns: c.checkoutUrlPatterns,
      couponInputSelector: c.couponInputSelector,
      applyButtonSelector: c.applyButtonSelector,
      totalSelector: c.totalSelector,
      successIndicatorSelector: c.successIndicatorSelector,
      errorIndicatorSelector: c.errorIndicatorSelector,
      removeButtonSelector: c.removeButtonSelector,
      version: c.version,
      enabled: c.enabled,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  @Get("admin/checkout-configs")
  @Auth("staff")
  async configs() {
    const rows = await this.prisma.retailerCheckoutConfig.findMany({ include: { retailer: { select: { slug: true, name: true } } }, orderBy: { retailerId: "asc" } });
    return { items: rows.map((r) => this.configOut(r)) };
  }

  @Put("admin/checkout-configs/:id")
  @Auth("staff")
  async upsertConfig(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminCheckoutConfig> {
    requireEditor(user);
    const { id: retailerId } = input("admin.checkoutConfigs.upsert", "params", params);
    const b = input("admin.checkoutConfigs.upsert", "body", body);
    if (!(await this.prisma.retailer.findUnique({ where: { id: retailerId } }))) throw notFound("Retailer");
    const existing = await this.prisma.retailerCheckoutConfig.findUnique({ where: { retailerId } });
    const merged = { ...existing, ...b };
    if (merged.enabled && (!merged.couponInputSelector || !merged.applyButtonSelector || !(merged.hostPatterns ?? []).length)) {
      throw new ApiException(422, "validation_failed", "Enable requires hostPatterns, couponInputSelector and applyButtonSelector (verified by an admin)");
    }
    const c = await this.prisma.retailerCheckoutConfig.upsert({
      where: { retailerId },
      update: { ...b, version: { increment: 1 }, updatedById: user.id },
      create: { retailerId, ...b, updatedById: user.id },
      include: { retailer: { select: { slug: true, name: true } } },
    });
    await this.audit(req, "checkout_config.upsert", "RetailerCheckoutConfig", retailerId, b);
    return this.configOut(c);
  }

  // ───────── merchant ─────────
  @Get("merchant/coupons")
  @Auth("merchant")
  async merchantList(@Query() query: unknown, @CurrentUser() user: User): Promise<AdminCouponListResponse> {
    const q = input("merchant.coupons.list", "query", query);
    const acc = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (!acc) throw notFound("Merchant account");
    const where = { merchantAccountId: acc.id };
    const [total, rows] = await Promise.all([
      this.prisma.coupon.count({ where }),
      this.prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { ...couponInclude, createdBy: { select: { id: true, email: true } } } }),
    ]);
    return page(rows.map(adminOut), total, q.page, q.pageSize);
  }

  @Post("merchant/coupons")
  @Auth("merchant")
  async merchantCreate(@Body() body: unknown, @CurrentUser() user: User): Promise<AdminCoupon> {
    const b = input("merchant.coupons.create", "body", body);
    const acc = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (!acc?.retailerId) throw new ApiException(409, "conflict", "Your merchant account is not linked to a store yet");
    const pending = await this.prisma.coupon.count({ where: { merchantAccountId: acc.id, status: "pending_approval" } });
    if (pending >= 50) throw new ApiException(409, "conflict", "Too many coupons awaiting approval (max 50)");
    const { startsAt: _s, expiresAt: _e, ...rest } = b;
    const c = await this.prisma.coupon.create({
      data: { ...rest, ...this.dates(b), retailerId: acc.retailerId, source: "merchant", status: "pending_approval", createdById: user.id, merchantAccountId: acc.id },
      include: { ...couponInclude, createdBy: { select: { id: true, email: true } } },
    });
    await this.prisma.couponEvent.create({ data: { couponId: c.id, retailerId: c.retailerId, type: "created", channel: "web", userId: user.id, note: "merchant submission (pending approval)" } });
    return adminOut(c);
  }
}

