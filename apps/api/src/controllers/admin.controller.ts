import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type {
  AdminAnomalyListResponse,
  AdminBrand,
  AdminBrandListResponse,
  AdminCategoryListResponse,
  AdminProductDetail,
  QueueStats,
  AdminMatchListResponse,
  AdminOfferListResponse,
  AdminProduct,
  AdminProductListResponse,
  AdminRetailer,
  AdminRetailerListResponse,
  AdminStatsResponse,
  AdminUser,
  AdminUserListResponse,
  AuditLogListResponse,
  FeatureFlag,
  FeatureFlagListResponse,
  OkResponse,
} from "@pricora/contracts";
import type { Prisma, User } from "@pricora/database";
import { slugify } from "@pricora/utils";
import { Auth, type AuthedRequest, CurrentUser, requireEditor } from "../common/auth";
import { ApiException, conflict, notFound } from "../common/errors";
import { PRISMA, QUEUES, type PrismaClient, type Queues } from "../common/infra";
import { input } from "../common/validate";
import { MetricsService } from "../services/catalog.service";

const RANGE_MS = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 } as const;

const pg = <T>(items: T[], total: number, page: number, pageSize: number) => ({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });

@Controller("admin")
@Auth("staff")
export class AdminController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(QUEUES) private readonly queues: Queues,
  ) {}

  private async queueStats(): Promise<QueueStats[]> {
    const names = [this.queues.priceEvents, this.queues.searchIndex, this.queues.priceRefresh, this.queues.merchantFeeds];
    return Promise.all(
      names.map(async (q) => {
        try {
          const c = await Promise.race([
            q.getJobCounts("waiting", "active", "failed", "delayed"),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500)),
          ]);
          return { name: q.name, waiting: c["waiting"] ?? 0, active: c["active"] ?? 0, failed: c["failed"] ?? 0, delayed: c["delayed"] ?? 0, available: true };
        } catch {
          return { name: q.name, waiting: 0, active: 0, failed: 0, delayed: 0, available: false };
        }
      }),
    );
  }

  private async audit(req: AuthedRequest, action: string, entityType: string, entityId: string | null, diff: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        action,
        entityType,
        entityId,
        diff: (diff ?? null) as Prisma.InputJsonValue,
        ip: req.ip ?? null,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      },
    });
  }

  private requireAdmin(user: User | undefined): void {
    if (user?.role !== "ADMIN") throw new ApiException(403, "forbidden", "Admin role required");
  }

  // ───────── stats ─────────
  @Get("stats")
  async stats(@Query() query: unknown): Promise<AdminStatsResponse> {
    const { range } = input("admin.stats", "query", query);
    const since = new Date(Date.now() - RANGE_MS[range]);
    const [users, newUsers, products, offers, demoOffers, retailers, live, alerts, searches, clicks, conversions, commission, reviews, errors, topSearches] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: since } } }),
        this.prisma.product.count({ where: { status: "active" } }),
        this.prisma.offer.count({ where: { isActive: true } }),
        this.prisma.offer.count({ where: { isActive: true, source: "demo" } }),
        this.prisma.retailer.count({ where: { isActive: true } }),
        this.prisma.retailer.count({ where: { integrationStatus: "live" } }),
        this.prisma.priceAlert.count({ where: { active: true } }),
        this.prisma.searchEvent.count({ where: { createdAt: { gte: since } } }),
        this.prisma.affiliateClick.count({ where: { createdAt: { gte: since } } }),
        this.prisma.affiliateConversion.count({ where: { occurredAt: { gte: since } } }),
        this.prisma.affiliateConversion.aggregate({ where: { occurredAt: { gte: since }, status: { not: "reversed" } }, _sum: { commissionCents: true } }),
        this.prisma.productMatch.count({ where: { status: "pending_review" } }),
        this.prisma.integrationError.count({ where: { resolvedAt: null } }),
        this.prisma.searchEvent.groupBy({
          by: ["normalizedQuery"],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _min: { resultCount: true },
          orderBy: { _count: { normalizedQuery: "desc" } },
          take: 10,
        }),
      ]);
    const bucketMs = range === "24h" ? 3_600_000 : 86_400_000;
    const series = async (table: "search_events" | "affiliate_clicks" | "users") => {
      const rows = await this.prisma.$queryRawUnsafe<{ t: Date; value: bigint }[]>(
        `SELECT to_timestamp(floor(extract(epoch from "createdAt") * 1000 / $1) * $1 / 1000) AS t, count(*) AS value FROM "${table}" WHERE "createdAt" >= $2 GROUP BY 1 ORDER BY 1`,
        bucketMs,
        since,
      );
      return rows.map((r) => ({ t: new Date(r.t).toISOString(), value: Number(r.value) }));
    };
    return {
      range,
      totals: {
        users,
        newUsers,
        products,
        offers,
        demoOffers,
        retailers,
        liveIntegrations: live,
        activeAlerts: alerts,
        searches,
        affiliateClicks: clicks,
        conversions,
        commissionCents: commission._sum.commissionCents ?? 0,
        pendingMatchReviews: reviews,
        openIntegrationErrors: errors,
      },
      series: { searches: await series("search_events"), clicks: await series("affiliate_clicks"), signups: await series("users") },
      topSearches: topSearches.map((s) => ({ query: s.normalizedQuery, count: s._count._all, zeroResults: (s._min.resultCount ?? 0) === 0 })),
      dataFreshness: await this.freshness(),
      queues: await this.queueStats(),
      generatedAt: new Date().toISOString(),
    };
  }

  private async freshness(): Promise<AdminStatsResponse["dataFreshness"]> {
    const [agg, stale] = await Promise.all([
      this.prisma.offer.aggregate({ where: { isActive: true }, _max: { lastCheckedAt: true }, _min: { lastCheckedAt: true } }),
      this.prisma.offer.count({ where: { isActive: true, lastCheckedAt: { lt: new Date(Date.now() - 86_400_000) } } }),
    ]);
    return {
      newestOfferCheckAt: agg._max.lastCheckedAt?.toISOString() ?? null,
      oldestActiveOfferCheckAt: agg._min.lastCheckedAt?.toISOString() ?? null,
      staleOffers24h: stale,
    };
  }

  // ───────── users (ADMIN) ─────────
  private userOut(u: User): AdminUser {
    return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, emailVerified: u.emailVerifiedAt !== null, createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null };
  }

  @Get("users")
  @Auth("admin")
  async users(@Query() query: unknown): Promise<AdminUserListResponse> {
    const q = input("admin.users.list", "query", query);
    const where: Prisma.UserWhereInput = q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return pg(rows.map((u) => this.userOut(u)), total, q.page, q.pageSize);
  }

  @Patch("users/:id")
  @Auth("admin")
  async updateUser(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<AdminUser> {
    const { id } = input("admin.users.update", "params", params);
    const b = input("admin.users.update", "body", body);
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound("User");
    if (before.id === req.user?.id && (b.role && b.role !== "ADMIN" || b.status === "suspended")) {
      throw new ApiException(409, "conflict", "You cannot demote or suspend your own account");
    }
    const after = await this.prisma.user.update({ where: { id }, data: b });
    if (b.status === "suspended") await this.prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(req, "user.update", "User", id, { before: { role: before.role, status: before.status, name: before.name }, after: b });
    return this.userOut(after);
  }

  // ───────── products ─────────
  private async productOut(ids: string[]): Promise<AdminProduct[]> {
    const m = await this.metrics.all();
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { brand: { select: { name: true } }, category: { select: { slug: true } }, _count: { select: { offers: true } } },
    });
    return ids.flatMap((id) => {
      const p = rows.find((r) => r.id === id);
      if (!p) return [];
      return [
        {
          id: p.id,
          slug: p.slug,
          title: p.title,
          brandName: p.brand?.name ?? null,
          categorySlug: p.category?.slug ?? null,
          condition: p.condition,
          status: p.status,
          offerCount: p._count.offers,
          lowestPriceCents: m.get(p.id)?.lowestPriceCents ?? null,
          isDemo: p.isDemo,
          brandId: p.brandId,
          categoryId: p.categoryId,
          updatedAt: p.updatedAt.toISOString(),
        },
      ];
    });
  }

  @Get("products")
  async products(@Query() query: unknown): Promise<AdminProductListResponse> {
    const q = input("admin.products.list", "query", query);
    const where: Prisma.ProductWhereInput = q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q } }, { mpn: q.q }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, orderBy: { updatedAt: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true } }),
    ]);
    return pg(await this.productOut(rows.map((r) => r.id)), total, q.page, q.pageSize);
  }

  @Get("products/:id")
  async product(@Param() params: unknown): Promise<AdminProductDetail> {
    const { id } = input("admin.products.get", "params", params);
    const [base] = await this.productOut([id]);
    if (!base) throw notFound("Product");
    const p = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      include: { identifiers: true, attributes: { orderBy: { sortOrder: "asc" } } },
    });
    return {
      ...base,
      description: p.description,
      model: p.model,
      mpn: p.mpn,
      identifiers: p.identifiers.map((i) => ({ type: i.type, value: i.value })),
      attributes: p.attributes.map((a) => ({ group: a.group, name: a.name, value: a.value, unit: a.unit })),
    };
  }

  // ───────── brands ─────────
  private async brandOut(ids: string[]): Promise<AdminBrand[]> {
    const rows = await this.prisma.brand.findMany({ where: { id: { in: ids } }, include: { _count: { select: { products: true } } } });
    return ids.flatMap((id) => {
      const b = rows.find((r) => r.id === id);
      return b
        ? [
            {
              id: b.id,
              slug: b.slug,
              name: b.name,
              website: b.website,
              productCount: b._count.products,
              logoUrl: b.logoUrl,
              logoSource: b.logoSource,
              logoUpdatedAt: b.logoUpdatedAt?.toISOString() ?? null,
              updatedAt: b.updatedAt.toISOString(),
            },
          ]
        : [];
    });
  }

  @Get("brands")
  async brands(@Query() query: unknown): Promise<AdminBrandListResponse> {
    const q = input("admin.brands.list", "query", query);
    const where: Prisma.BrandWhereInput = q.q ? { name: { contains: q.q, mode: "insensitive" } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.brand.count({ where }),
      this.prisma.brand.findMany({ where, orderBy: { name: q.order === "desc" ? "asc" : "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true } }),
    ]);
    return pg(await this.brandOut(rows.map((r) => r.id)), total, q.page, q.pageSize);
  }

  @Post("brands")
  async createBrand(@Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminBrand> {
    requireEditor(user);
    const b = input("admin.brands.create", "body", body);
    const slug = b.slug ?? slugify(b.name);
    if (await this.prisma.brand.findFirst({ where: { OR: [{ slug }, { name: b.name }] } })) throw conflict("A brand with this name or slug already exists");
    const created = await this.prisma.brand.create({ data: { name: b.name, slug, website: b.website ?? null, description: b.description ?? null } });
    await this.audit(req, "brand.create", "Brand", created.id, b);
    const [out] = await this.brandOut([created.id]);
    if (!out) throw notFound("Brand");
    return out;
  }

  @Patch("brands/:id")
  async updateBrand(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminBrand> {
    requireEditor(user);
    const { id } = input("admin.brands.update", "params", params);
    const b = input("admin.brands.update", "body", body);
    const before = await this.prisma.brand.findUnique({ where: { id } });
    if (!before) throw notFound("Brand");
    await this.prisma.brand.update({ where: { id }, data: b });
    await this.audit(req, "brand.update", "Brand", id, { before: { name: before.name, slug: before.slug }, after: b });
    const [out] = await this.brandOut([id]);
    if (!out) throw notFound("Brand");
    return out;
  }

  @Post("products")
  async createProduct(@Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminProduct> {
    requireEditor(user);
    const b = input("admin.products.create", "body", body);
    const slug = b.slug ?? slugify(b.title);
    if (await this.prisma.product.findUnique({ where: { slug } })) throw conflict("A product with this slug already exists");
    const p = await this.prisma.product.create({
      data: {
        slug,
        title: b.title,
        brandId: b.brandId ?? null,
        categoryId: b.categoryId ?? null,
        description: b.description ?? null,
        model: b.model ?? null,
        mpn: b.mpn ?? null,
        condition: b.condition,
        status: b.status,
        identifiers: b.identifiers ? { create: b.identifiers.map((i) => ({ type: i.type as never, value: i.value })) } : undefined,
        attributes: b.attributes ? { create: b.attributes.map((a, i) => ({ group: a.group ?? null, name: a.name, value: a.value, unit: a.unit ?? null, sortOrder: i })) } : undefined,
      },
    });
    await this.audit(req, "product.create", "Product", p.id, b);
    this.metrics.invalidate();
    const [out] = await this.productOut([p.id]);
    if (!out) throw notFound("Product");
    return out;
  }

  @Patch("products/:id")
  async updateProduct(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminProduct> {
    requireEditor(user);
    const { id } = input("admin.products.update", "params", params);
    const b = input("admin.products.update", "body", body);
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw notFound("Product");
    const { identifiers: _i, attributes: _a, ...fields } = b;
    await this.prisma.product.update({ where: { id }, data: fields });
    await this.audit(req, "product.update", "Product", id, { before: { title: before.title, status: before.status, slug: before.slug }, after: fields });
    this.metrics.invalidate();
    const [out] = await this.productOut([id]);
    if (!out) throw notFound("Product");
    return out;
  }

  // ───────── categories ─────────
  @Get("categories")
  async categories(): Promise<AdminCategoryListResponse> {
    const [cats, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ depth: "asc" }, { sortOrder: "asc" }] }),
      this.prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    ]);
    const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    return {
      items: cats.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        parentId: c.parentId,
        path: c.path,
        depth: c.depth,
        description: c.description,
        icon: c.icon,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        productCount: cats.filter((x) => x.id === c.id || x.path.startsWith(c.path + "/")).reduce((n, x) => n + (direct.get(x.id) ?? 0), 0),
      })),
    };
  }

  @Post("categories")
  async createCategory(@Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const b = input("admin.categories.create", "body", body);
    const slug = b.slug ?? slugify(b.name);
    const parent = b.parentId ? await this.prisma.category.findUnique({ where: { id: b.parentId } }) : null;
    if (b.parentId && !parent) throw notFound("Parent category");
    const c = await this.prisma.category.create({
      data: {
        slug,
        name: b.name,
        parentId: parent?.id ?? null,
        path: parent ? `${parent.path}/${slug}` : slug,
        depth: parent ? parent.depth + 1 : 0,
        description: b.description ?? null,
        icon: b.icon ?? null,
        sortOrder: b.sortOrder ?? 0,
        isActive: b.isActive ?? true,
      },
    });
    await this.audit(req, "category.create", "Category", c.id, b);
    return { ok: true };
  }

  @Patch("categories/:id")
  async updateCategory(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.categories.update", "params", params);
    const b = input("admin.categories.update", "body", body);
    const before = await this.prisma.category.findUnique({ where: { id } });
    if (!before) throw notFound("Category");
    if (b.parentId !== undefined || b.slug !== undefined) {
      throw new ApiException(400, "bad_request", "Moving or re-slugging categories is not supported yet");
    }
    await this.prisma.category.update({ where: { id }, data: b });
    await this.audit(req, "category.update", "Category", id, { before: { name: before.name, isActive: before.isActive }, after: b });
    return { ok: true };
  }

  // ───────── retailers ─────────
  private async retailerOut(where: Prisma.RetailerWhereInput, q?: { page: number; pageSize: number }): Promise<{ items: AdminRetailer[]; total: number }> {
    const since = new Date(Date.now() - 86_400_000);
    const [total, rows] = await Promise.all([
      this.prisma.retailer.count({ where }),
      this.prisma.retailer.findMany({
        where,
        orderBy: { name: "asc" },
        ...(q ? { skip: (q.page - 1) * q.pageSize, take: q.pageSize } : {}),
        include: {
          _count: { select: { offers: { where: { isActive: true } }, integrationErrors: { where: { occurredAt: { gte: since } } } } },
          ingestionJobs: { orderBy: { queuedAt: "desc" }, take: 1, select: { finishedAt: true } },
        },
      }),
    ]);
    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        domain: r.domain,
        integrationStatus: r.integrationStatus,
        isActive: r.isActive,
        offerCount: r._count.offers,
        lastIngestAt: r.ingestionJobs[0]?.finishedAt?.toISOString() ?? null,
        errorCount24h: r._count.integrationErrors,
        brandColor: r.brandColor,
        freeShippingThresholdCents: r.freeShippingThresholdCents,
        allowedRedirectHosts: r.allowedRedirectHosts,
        logoUrl: r.logoUrl,
        logoSource: r.logoSource,
        logoUpdatedAt: r.logoUpdatedAt?.toISOString() ?? null,
      })),
    };
  }

  @Get("retailers")
  async retailers(@Query() query: unknown): Promise<AdminRetailerListResponse> {
    const q = input("admin.retailers.list", "query", query);
    const where: Prisma.RetailerWhereInput = q.q ? { name: { contains: q.q, mode: "insensitive" } } : {};
    const r = await this.retailerOut(where, q);
    return pg(r.items, r.total, q.page, q.pageSize);
  }

  @Patch("retailers/:id")
  @Auth("admin")
  async updateRetailer(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<AdminRetailer> {
    const { id } = input("admin.retailers.update", "params", params);
    const b = input("admin.retailers.update", "body", body);
    const before = await this.prisma.retailer.findUnique({ where: { id } });
    if (!before) throw notFound("Retailer");
    if (b.allowedRedirectHosts?.some((h) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h))) throw new ApiException(422, "validation_failed", "Invalid redirect host");
    await this.prisma.retailer.update({ where: { id }, data: b });
    await this.audit(req, "retailer.update", "Retailer", id, { before: { name: before.name, isActive: before.isActive, allowedRedirectHosts: before.allowedRedirectHosts }, after: b });
    const { items } = await this.retailerOut({ id });
    const out = items[0];
    if (!out) throw notFound("Retailer");
    return out;
  }

  // ───────── offers / matches / anomalies ─────────
  @Get("offers")
  async offers(@Query() query: unknown): Promise<AdminOfferListResponse> {
    const q = input("admin.offers.list", "query", query);
    const where: Prisma.OfferWhereInput = {
      ...(q.retailer ? { retailer: { slug: q.retailer } } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.offer.count({ where }),
      this.prisma.offer.findMany({
        where,
        orderBy: { lastCheckedAt: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { product: { select: { slug: true, title: true } }, retailer: { select: { slug: true } } },
      }),
    ]);
    return pg(
      rows.map((o) => ({
        id: o.id,
        productSlug: o.product.slug,
        productTitle: o.product.title,
        retailerSlug: o.retailer.slug,
        priceCents: o.priceCents,
        shippingCents: o.shippingCents,
        stock: o.stock,
        condition: o.condition,
        source: o.source,
        isActive: o.isActive,
        lastCheckedAt: o.lastCheckedAt.toISOString(),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  @Patch("offers/:id")
  async updateOffer(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.offers.update", "params", params);
    const b = input("admin.offers.update", "body", body);
    const before = await this.prisma.offer.findUnique({ where: { id } });
    if (!before) throw notFound("Offer");
    await this.prisma.offer.update({ where: { id }, data: { isActive: b.isActive } });
    await this.audit(req, "offer.update", "Offer", id, { before: { isActive: before.isActive }, after: b });
    this.metrics.invalidate();
    return { ok: true };
  }

  @Get("matches")
  async matches(@Query() query: unknown): Promise<AdminMatchListResponse> {
    const q = input("admin.matches.list", "query", query);
    const where: Prisma.ProductMatchWhereInput = {
      ...(q.q ? { candidateTitle: { contains: q.q, mode: "insensitive" } } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.productMatch.count({ where }),
      this.prisma.productMatch.findMany({
        where,
        orderBy: { createdAt: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { retailer: { select: { slug: true } }, product: { select: { title: true } } },
      }),
    ]);
    return pg(
      rows.map((m) => ({
        id: m.id,
        candidateTitle: m.candidateTitle,
        retailerSlug: m.retailer.slug,
        productId: m.productId,
        productTitle: m.product?.title ?? null,
        confidence: m.confidenceBp / 10_000,
        method: m.method,
        status: m.status,
        conflicts: m.conflicts,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  @Post("matches/:id/review")
  @HttpCode(200)
  async reviewMatch(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.matches.review", "params", params);
    const b = input("admin.matches.review", "body", body);
    const match = await this.prisma.productMatch.findUnique({ where: { id } });
    if (!match) throw notFound("Match");
    if (b.decision === "reassign" && !b.productId) throw new ApiException(422, "validation_failed", "productId is required to reassign");
    let productId = b.decision === "reassign" ? (b.productId ?? null) : match.productId;
    if (b.decision === "split") {
      // Detach into a new canonical product (draft, so an editor completes it before it goes live).
      const created = await this.prisma.product.create({
        data: { slug: slugify(match.candidateTitle) + "-" + match.id.slice(-6), title: match.candidateTitle, status: "draft" },
      });
      productId = created.id;
      if (match.offerId) await this.prisma.offer.update({ where: { id: match.offerId }, data: { productId: created.id } });
    }
    await this.prisma.$transaction([
      this.prisma.matchReview.create({ data: { matchId: id, reviewerId: user.id, decision: b.decision, productId, note: b.note ?? null } }),
      this.prisma.productMatch.update({ where: { id }, data: { status: b.decision === "reject" ? "rejected" : "approved", productId } }),
    ]);
    await this.audit(req, "match.review", "ProductMatch", id, b);
    return { ok: true };
  }

  @Get("anomalies")
  async anomalies(@Query() query: unknown): Promise<AdminAnomalyListResponse> {
    const q = input("admin.anomalies.list", "query", query);
    const where: Prisma.PriceAnomalyWhereInput =
      q.status === "open" ? { resolvedAt: null } : q.status === "resolved" ? { resolvedAt: { not: null } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.priceAnomaly.count({ where }),
      this.prisma.priceAnomaly.findMany({
        where,
        orderBy: { detectedAt: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { product: { select: { slug: true } }, offer: { select: { retailer: { select: { slug: true } } } } },
      }),
    ]);
    return pg(
      rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity,
        offerId: a.offerId,
        productSlug: a.product?.slug ?? null,
        retailerSlug: a.offer?.retailer.slug ?? null,
        message: a.message,
        detectedAt: a.detectedAt.toISOString(),
        resolvedAt: a.resolvedAt?.toISOString() ?? null,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  @Post("anomalies/:id/resolve")
  @HttpCode(200)
  async resolveAnomaly(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.anomalies.resolve", "params", params);
    const b = input("admin.anomalies.resolve", "body", body);
    const a = await this.prisma.priceAnomaly.findUnique({ where: { id } });
    if (!a) throw notFound("Anomaly");
    await this.prisma.priceAnomaly.update({ where: { id }, data: { resolvedAt: new Date() } });
    await this.audit(req, "anomaly.resolve", "PriceAnomaly", id, b);
    return { ok: true };
  }

  // ───────── flags / audit ─────────
  @Get("flags")
  async flags(): Promise<FeatureFlagListResponse> {
    const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
    return { items: rows.map((f) => ({ key: f.key, description: f.description, enabled: f.enabled, rolloutPercent: f.rolloutPercent, updatedAt: f.updatedAt.toISOString() })) };
  }

  @Patch("flags/:key")
  @Auth("admin")
  async updateFlag(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<FeatureFlag> {
    const { key } = input("admin.flags.update", "params", params);
    const b = input("admin.flags.update", "body", body);
    const before = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!before) throw notFound("Feature flag");
    const f = await this.prisma.featureFlag.update({ where: { key }, data: b });
    await this.audit(req, "flag.update", "FeatureFlag", key, { before: { enabled: before.enabled, rolloutPercent: before.rolloutPercent }, after: b });
    return { key: f.key, description: f.description, enabled: f.enabled, rolloutPercent: f.rolloutPercent, updatedAt: f.updatedAt.toISOString() };
  }

  @Get("audit-logs")
  @Auth("admin")
  async auditLogs(@Query() query: unknown): Promise<AuditLogListResponse> {
    const q = input("admin.auditLogs.list", "query", query);
    const where: Prisma.AuditLogWhereInput = q.q ? { OR: [{ action: { contains: q.q } }, { entityType: { contains: q.q } }, { entityId: q.q }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: q.order }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { actor: { select: { id: true, email: true } } } }),
    ]);
    return pg(
      rows.map((a) => ({ id: a.id, actor: a.actor, action: a.action, entityType: a.entityType, entityId: a.entityId, diff: a.diff, ip: a.ip, createdAt: a.createdAt.toISOString() })),
      total,
      q.page,
      q.pageSize,
    );
  }
}
