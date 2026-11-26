import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { extractHeadings, sanitizeMarkdown } from "@pricora/content";
import type { AdminGuide, AdminGuideListResponse, GuideDetail, GuideListResponse, GuideSummary, OkResponse } from "@pricora/contracts";
import type { Prisma, TravelGuide, User } from "@pricora/database";
import { Auth, type AuthedRequest, CurrentUser, requireEditor } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";

function summary(g: TravelGuide): GuideSummary {
  return {
    slug: g.slug,
    title: g.title,
    description: g.description,
    city: g.city,
    country: g.country,
    countryIso2: g.countryIso2,
    iataCityCode: g.iataCityCode,
    cityId: g.cityId,
    bestTimeToVisit: g.bestTimeToVisit,
    neighborhoods: g.neighborhoods,
    tags: g.tags,
    lastReviewed: g.lastReviewed?.toISOString().slice(0, 10) ?? null,
    publishedAt: g.publishedAt?.toISOString() ?? null,
    updatedAt: g.updatedAt.toISOString(),
  };
}

function detail(g: TravelGuide): GuideDetail {
  const body = sanitizeMarkdown(g.bodyMarkdown);
  return { ...summary(g), bodyMarkdown: body, headings: extractHeadings(body) };
}

function adminOut(g: TravelGuide): AdminGuide {
  return { ...detail(g), id: g.id, status: g.status, adminEditedAt: g.adminEditedAt?.toISOString() ?? null, updatedById: g.updatedById };
}

/** Published guide slug for a city (used by hotel search). */
export async function guideSlugForCity(prisma: PrismaClient, cityId: number | null, cityName: string | null, countryIso2?: string | null): Promise<string | null> {
  if (cityId === null && !cityName) return null;
  const g = await prisma.travelGuide.findFirst({
    where: {
      status: "published",
      OR: [
        ...(cityId !== null ? [{ cityId }] : []),
        ...(cityName ? [{ city: { equals: cityName, mode: "insensitive" as const }, ...(countryIso2 ? { countryIso2 } : {}) }] : []),
      ],
    },
    select: { slug: true },
  });
  return g?.slug ?? null;
}

@Controller()
export class GuidesController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get("travel/guides")
  async list(@Query() query: unknown): Promise<GuideListResponse> {
    const q = input("travel.guides", "query", query);
    const where: Prisma.TravelGuideWhereInput = {
      status: "published",
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(q.country ? { countryIso2: q.country } : {}),
      ...(q.q ? { OR: [{ city: { contains: q.q, mode: "insensitive" } }, { title: { contains: q.q, mode: "insensitive" } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.travelGuide.count({ where }),
      this.prisma.travelGuide.findMany({ where, orderBy: { city: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { items: rows.map(summary), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  }

  @Get("travel/guides/:slug")
  async get(@Param() params: unknown): Promise<GuideDetail> {
    const { slug } = input("travel.guide", "params", params);
    const g = await this.prisma.travelGuide.findUnique({ where: { slug } });
    if (!g || g.status !== "published") throw notFound("Guide");
    return detail(g);
  }

  // ───────── admin ─────────
  private async audit(req: AuthedRequest, action: string, id: string, diff: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: { actorId: req.user?.id ?? null, action, entityType: "TravelGuide", entityId: id, diff: (diff ?? null) as Prisma.InputJsonValue, ip: req.ip ?? null, userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null },
    });
  }

  @Get("admin/guides")
  @Auth("staff")
  async adminList(@Query() query: unknown): Promise<AdminGuideListResponse> {
    const q = input("admin.guides.list", "query", query);
    const where: Prisma.TravelGuideWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ city: { contains: q.q, mode: "insensitive" } }, { slug: { contains: q.q } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.travelGuide.count({ where }),
      this.prisma.travelGuide.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return {
      items: rows.map((g) => ({ ...summary(g), id: g.id, status: g.status, adminEditedAt: g.adminEditedAt?.toISOString() ?? null, updatedById: g.updatedById })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }

  @Get("admin/guides/:id")
  @Auth("staff")
  async adminGet(@Param() params: unknown): Promise<AdminGuide> {
    const { id } = input("admin.guides.get", "params", params);
    const g = await this.prisma.travelGuide.findUnique({ where: { id } });
    if (!g) throw notFound("Guide");
    return adminOut(g);
  }

  @Post("admin/guides")
  @Auth("staff")
  async adminCreate(@Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminGuide> {
    requireEditor(user);
    const b = input("admin.guides.create", "body", body);
    if (await this.prisma.travelGuide.findUnique({ where: { slug: b.slug } })) throw new ApiException(409, "conflict", "A guide with this slug already exists");
    const g = await this.prisma.travelGuide.create({
      data: {
        ...b,
        iataCityCode: b.iataCityCode ?? null,
        cityId: b.cityId ?? null,
        bestTimeToVisit: b.bestTimeToVisit ?? null,
        lastReviewed: b.lastReviewed ? new Date(`${b.lastReviewed}T00:00:00Z`) : null,
        publishedAt: b.status === "published" ? new Date() : null,
        adminEditedAt: new Date(),
        updatedById: user.id,
      },
    });
    await this.audit(req, "guide.create", g.id, { slug: g.slug, status: g.status });
    return adminOut(g);
  }

  @Patch("admin/guides/:id")
  @Auth("staff")
  async adminUpdate(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<AdminGuide> {
    requireEditor(user);
    const { id } = input("admin.guides.update", "params", params);
    const b = input("admin.guides.update", "body", body);
    const before = await this.prisma.travelGuide.findUnique({ where: { id } });
    if (!before) throw notFound("Guide");
    if (b.slug && b.slug !== before.slug && (await this.prisma.travelGuide.findUnique({ where: { slug: b.slug } }))) {
      throw new ApiException(409, "conflict", "A guide with this slug already exists");
    }
    const { lastReviewed, ...rest } = b;
    const g = await this.prisma.travelGuide.update({
      where: { id },
      data: {
        ...rest,
        ...(lastReviewed !== undefined ? { lastReviewed: lastReviewed ? new Date(`${lastReviewed}T00:00:00Z`) : null } : {}),
        ...(b.status === "published" && !before.publishedAt ? { publishedAt: new Date() } : {}),
        adminEditedAt: new Date(),
        updatedById: user.id,
      },
    });
    await this.audit(req, "guide.update", id, { fields: Object.keys(b), before: { status: before.status, slug: before.slug }, after: { status: g.status, slug: g.slug } });
    return adminOut(g);
  }

  @Delete("admin/guides/:id")
  @Auth("staff")
  async adminDelete(@Param() params: unknown, @Req() req: AuthedRequest, @CurrentUser() user: User): Promise<OkResponse> {
    requireEditor(user);
    const { id } = input("admin.guides.delete", "params", params);
    const g = await this.prisma.travelGuide.findUnique({ where: { id } });
    if (!g) throw notFound("Guide");
    await this.prisma.travelGuide.delete({ where: { id } });
    await this.audit(req, "guide.delete", id, { slug: g.slug });
    return { ok: true };
  }
}
