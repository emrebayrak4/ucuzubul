import { conditionGroupOf } from "@pricora/contracts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { verify } from "@node-rs/argon2";
import type {
  DataExportResponse,
  DeviceResponse,
  Favorite,
  FavoriteListResponse,
  OkResponse,
  PreferencesResponse,
  PriceAlert,
  PriceAlertListResponse,
  RecentlyViewedResponse,
  ShoppingListDetail,
  ShoppingListsResponse,
  UserPreferences,
} from "@pricora/contracts";
import type { PriceAlert as PriceAlertRow, User, UserPreference } from "@pricora/database";
import type { Response } from "express";
import { Auth, type AuthedRequest, CurrentUser, SessionService, toPublicUser } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { CatalogService } from "../services/catalog.service";

function prefsOut(p: UserPreference | null): UserPreferences {
  return {
    zip: p?.zip ?? null,
    favoriteRetailers: p?.favoriteRetailers ?? [],
    preferredCategories: p?.preferredCategories ?? [],
    memberships: p?.memberships ?? [],
    notifications: {
      email: p?.notifyEmail ?? true,
      push: p?.notifyPush ?? false,
      priceDrops: p?.notifyPriceDrops ?? true,
      weeklyDigest: p?.weeklyDigest ?? false,
      marketing: p?.marketingOptIn ?? false,
    },
    theme: p?.theme ?? "system",
    homeAirport: p?.homeAirport ?? null,
  };
}

@Controller("me")
@Auth("user")
export class MeController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  private async requireProduct(productId: string) {
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, status: true } });
    if (!p || p.status !== "active") throw notFound("Product");
  }

  // ───────── favorites ─────────
  @Get("favorites")
  async favorites(@CurrentUser() user: User, @Query() query: unknown): Promise<FavoriteListResponse> {
    const q = input("me.favorites.list", "query", query);
    const [total, rows] = await Promise.all([
      this.prisma.favorite.count({ where: { userId: user.id } }),
      this.prisma.favorite.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const cards = await this.catalog.cards(rows.map((r) => r.productId));
    return {
      items: rows.flatMap((r) => {
        const product = cards.find((c) => c.id === r.productId);
        return product ? [{ id: r.id, product, createdAt: r.createdAt.toISOString() }] : [];
      }),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }

  @Post("favorites")
  async addFavorite(@CurrentUser() user: User, @Body() body: unknown): Promise<Favorite> {
    const { productId } = input("me.favorites.create", "body", body);
    await this.requireProduct(productId);
    const fav = await this.prisma.favorite.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      update: {},
      create: { userId: user.id, productId },
    });
    const [product] = await this.catalog.cards([productId]);
    if (!product) throw notFound("Product");
    return { id: fav.id, product, createdAt: fav.createdAt.toISOString() };
  }

  @Delete("favorites/:id")
  async removeFavorite(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("me.favorites.delete", "params", params);
    const r = await this.prisma.favorite.deleteMany({ where: { userId: user.id, OR: [{ id }, { productId: id }] } });
    if (r.count === 0) throw notFound("Favorite");
    return { ok: true };
  }

  // ───────── alerts ─────────
  private async alertsOut(rows: (PriceAlertRow & { retailer: { slug: string } | null })[]): Promise<PriceAlert[]> {
    const cards = await this.catalog.cards([...new Set(rows.map((r) => r.productId))]);
    return rows.flatMap((r) => {
      const product = cards.find((c) => c.id === r.productId);
      if (!product) return [];
      return [
        {
          id: r.id,
          product,
          type: r.type,
          condition: conditionGroupOf(r.condition),
          targetPriceCents: r.targetPriceCents,
          dropPercentBp: r.dropPercentBp,
          retailerSlug: r.retailer?.slug ?? null,
          channels: r.channels,
          active: r.active,
          lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        },
      ];
    });
  }

  @Get("alerts")
  async alerts(@CurrentUser() user: User, @Query() query: unknown): Promise<PriceAlertListResponse> {
    const q = input("me.alerts.list", "query", query);
    const [total, rows] = await Promise.all([
      this.prisma.priceAlert.count({ where: { userId: user.id } }),
      this.prisma.priceAlert.findMany({
        where: { userId: user.id },
        include: { retailer: { select: { slug: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { items: await this.alertsOut(rows), page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) };
  }

  @Post("alerts")
  async createAlert(@CurrentUser() user: User, @Body() body: unknown): Promise<PriceAlert> {
    const b = input("me.alerts.create", "body", body);
    await this.requireProduct(b.productId);
    const retailer = b.retailerSlug ? await this.prisma.retailer.findUnique({ where: { slug: b.retailerSlug } }) : null;
    if (b.retailerSlug && !retailer) throw notFound("Retailer");
    const count = await this.prisma.priceAlert.count({ where: { userId: user.id, active: true } });
    if (count >= 200) throw new ApiException(409, "conflict", "Alert limit reached (200 active alerts)");
    const row = await this.prisma.priceAlert.create({
      data: {
        userId: user.id,
        productId: b.productId,
        type: b.type,
        condition: b.condition,
        targetPriceCents: b.targetPriceCents ?? null,
        dropPercentBp: b.dropPercentBp ?? null,
        retailerId: retailer?.id ?? null,
        channels: b.channels,
      },
      include: { retailer: { select: { slug: true } } },
    });
    const [out] = await this.alertsOut([row]);
    if (!out) throw notFound("Product");
    return out;
  }

  @Patch("alerts/:id")
  async updateAlert(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<PriceAlert> {
    const { id } = input("me.alerts.update", "params", params);
    const b = input("me.alerts.update", "body", body);
    const existing = await this.prisma.priceAlert.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound("Alert");
    const row = await this.prisma.priceAlert.update({
      where: { id },
      data: {
        ...(b.targetPriceCents !== undefined ? { targetPriceCents: b.targetPriceCents } : {}),
        ...(b.dropPercentBp !== undefined ? { dropPercentBp: b.dropPercentBp } : {}),
        ...(b.channels ? { channels: b.channels } : {}),
        ...(b.active !== undefined ? { active: b.active } : {}),
      },
      include: { retailer: { select: { slug: true } } },
    });
    const [out] = await this.alertsOut([row]);
    if (!out) throw notFound("Alert");
    return out;
  }

  @Delete("alerts/:id")
  async deleteAlert(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("me.alerts.delete", "params", params);
    const r = await this.prisma.priceAlert.deleteMany({ where: { id, userId: user.id } });
    if (r.count === 0) throw notFound("Alert");
    return { ok: true };
  }

  // ───────── lists ─────────
  private async listDetail(userId: string, id: string): Promise<ShoppingListDetail> {
    const list = await this.prisma.shoppingList.findFirst({ where: { id, userId }, include: { items: { orderBy: { addedAt: "asc" } } } });
    if (!list) throw notFound("List");
    const metrics = await this.catalog.metrics.all();
    const cards = await this.catalog.cards(list.items.map((i) => i.productId), metrics);
    const items = list.items.flatMap((i) => {
      const product = cards.find((c) => c.id === i.productId);
      return product ? [{ id: i.id, product, quantity: i.quantity, note: i.note, addedAt: i.addedAt.toISOString() }] : [];
    });
    const totals = items.map((i) => (i.product.lowestPriceCents === null ? null : i.product.lowestPriceCents * i.quantity));
    return {
      id: list.id,
      name: list.name,
      isPublic: list.isPublic,
      itemCount: items.length,
      estimatedTotalCents: totals.length && totals.every((t) => t !== null) ? totals.reduce<number>((n, t) => n + (t ?? 0), 0) : null,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      items,
    };
  }

  @Get("lists")
  async lists(@CurrentUser() user: User): Promise<ShoppingListsResponse> {
    const rows = await this.prisma.shoppingList.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true } });
    const details = await Promise.all(rows.map((r) => this.listDetail(user.id, r.id)));
    return { items: details.map(({ items: _items, ...l }) => l) };
  }

  @Post("lists")
  async createList(@CurrentUser() user: User, @Body() body: unknown): Promise<ShoppingListDetail> {
    const b = input("me.lists.create", "body", body);
    const list = await this.prisma.shoppingList.create({ data: { userId: user.id, name: b.name, isPublic: b.isPublic } });
    return this.listDetail(user.id, list.id);
  }

  @Get("lists/:id")
  getList(@CurrentUser() user: User, @Param() params: unknown): Promise<ShoppingListDetail> {
    return this.listDetail(user.id, input("me.lists.get", "params", params).id);
  }

  @Patch("lists/:id")
  async updateList(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<ShoppingListDetail> {
    const { id } = input("me.lists.update", "params", params);
    const b = input("me.lists.update", "body", body);
    const r = await this.prisma.shoppingList.updateMany({ where: { id, userId: user.id }, data: b });
    if (r.count === 0) throw notFound("List");
    return this.listDetail(user.id, id);
  }

  @Delete("lists/:id")
  async deleteList(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("me.lists.delete", "params", params);
    const r = await this.prisma.shoppingList.deleteMany({ where: { id, userId: user.id } });
    if (r.count === 0) throw notFound("List");
    return { ok: true };
  }

  @Post("lists/:id/items")
  async addItem(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<ShoppingListDetail> {
    const { id } = input("me.lists.addItem", "params", params);
    const b = input("me.lists.addItem", "body", body);
    const list = await this.prisma.shoppingList.findFirst({ where: { id, userId: user.id } });
    if (!list) throw notFound("List");
    await this.requireProduct(b.productId);
    await this.prisma.shoppingListItem.upsert({
      where: { listId_productId: { listId: id, productId: b.productId } },
      update: { quantity: b.quantity, note: b.note ?? null },
      create: { listId: id, productId: b.productId, quantity: b.quantity, note: b.note ?? null },
    });
    await this.prisma.shoppingList.update({ where: { id }, data: { updatedAt: new Date() } });
    return this.listDetail(user.id, id);
  }

  @Patch("lists/:id/items/:itemId")
  async updateItem(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<ShoppingListDetail> {
    const { id, itemId } = input("me.lists.updateItem", "params", params);
    const b = input("me.lists.updateItem", "body", body);
    const r = await this.prisma.shoppingListItem.updateMany({
      where: { id: itemId, listId: id, list: { userId: user.id } },
      data: { ...(b.quantity !== undefined ? { quantity: b.quantity } : {}), ...(b.note !== undefined ? { note: b.note } : {}) },
    });
    if (r.count === 0) throw notFound("List item");
    return this.listDetail(user.id, id);
  }

  @Delete("lists/:id/items/:itemId")
  async removeItem(@CurrentUser() user: User, @Param() params: unknown): Promise<ShoppingListDetail> {
    const { id, itemId } = input("me.lists.removeItem", "params", params);
    const r = await this.prisma.shoppingListItem.deleteMany({ where: { id: itemId, listId: id, list: { userId: user.id } } });
    if (r.count === 0) throw notFound("List item");
    return this.listDetail(user.id, id);
  }

  // ───────── push devices ─────────
  @Post("devices")
  async registerDevice(@CurrentUser() user: User, @Body() body: unknown): Promise<DeviceResponse> {
    const b = input("me.devices.register", "body", body);
    const count = await this.prisma.pushDevice.count({ where: { userId: user.id } });
    const existing = await this.prisma.pushDevice.findUnique({ where: { token: b.token } });
    if (!existing && count >= 10) throw new ApiException(409, "conflict", "Too many registered devices (max 10)");
    // A token moves to the most recent user that registers it (device sign-in switch).
    const d = await this.prisma.pushDevice.upsert({
      where: { token: b.token },
      update: { userId: user.id, platform: b.platform, lastSeenAt: new Date() },
      create: { userId: user.id, token: b.token, platform: b.platform },
    });
    return { token: d.token, platform: d.platform, createdAt: d.createdAt.toISOString(), lastSeenAt: d.lastSeenAt.toISOString() };
  }

  @Delete("devices/:token")
  async removeDevice(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { token } = input("me.devices.delete", "params", params);
    await this.prisma.pushDevice.deleteMany({ where: { userId: user.id, token } });
    return { ok: true };
  }

  // ───────── recently viewed / preferences ─────────
  @Get("recently-viewed")
  async recentlyViewed(@CurrentUser() user: User): Promise<RecentlyViewedResponse> {
    const rows = await this.prisma.recentlyViewed.findMany({ where: { userId: user.id }, orderBy: { viewedAt: "desc" }, take: 30 });
    const cards = await this.catalog.cards(rows.map((r) => r.productId));
    return {
      items: rows.flatMap((r) => {
        const product = cards.find((c) => c.id === r.productId);
        return product ? [{ product, viewedAt: r.viewedAt.toISOString() }] : [];
      }),
    };
  }

  @Get("preferences")
  async preferences(@CurrentUser() user: User): Promise<PreferencesResponse> {
    const p = await this.prisma.userPreference.findUnique({ where: { userId: user.id } });
    return { user: toPublicUser(user, p?.zip ?? null), preferences: prefsOut(p) };
  }

  @Patch("preferences")
  async updatePreferences(@CurrentUser() user: User, @Body() body: unknown): Promise<PreferencesResponse> {
    const b = input("me.preferences.update", "body", body);
    const data = {
      ...(b.zip !== undefined ? { zip: b.zip } : {}),
      ...(b.favoriteRetailers ? { favoriteRetailers: b.favoriteRetailers } : {}),
      ...(b.preferredCategories ? { preferredCategories: b.preferredCategories } : {}),
      ...(b.memberships ? { memberships: b.memberships } : {}),
      ...(b.theme ? { theme: b.theme } : {}),
      ...(b.homeAirport !== undefined ? { homeAirport: b.homeAirport } : {}),
      ...(b.notifications
        ? {
            notifyEmail: b.notifications.email,
            notifyPush: b.notifications.push,
            notifyPriceDrops: b.notifications.priceDrops,
            weeklyDigest: b.notifications.weeklyDigest,
            marketingOptIn: b.notifications.marketing,
          }
        : {}),
    };
    const [p, u] = await Promise.all([
      this.prisma.userPreference.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } }),
      b.name ? this.prisma.user.update({ where: { id: user.id }, data: { name: b.name } }) : Promise.resolve(user),
    ]);
    return { user: toPublicUser(u, p.zip), preferences: prefsOut(p) };
  }

  // ───────── export / delete ─────────
  @Get("export")
  async exportData(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response): Promise<DataExportResponse> {
    const [pref, favs, alerts, lists, recent, searches] = await Promise.all([
      this.prisma.userPreference.findUnique({ where: { userId: user.id } }),
      this.prisma.favorite.findMany({ where: { userId: user.id }, include: { product: { select: { slug: true } } } }),
      this.prisma.priceAlert.findMany({ where: { userId: user.id }, include: { product: { select: { slug: true } } } }),
      this.prisma.shoppingList.findMany({ where: { userId: user.id }, include: { items: { include: { product: { select: { slug: true } } } } } }),
      this.prisma.recentlyViewed.findMany({ where: { userId: user.id }, include: { product: { select: { slug: true } } } }),
      this.prisma.searchEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1000 }),
    ]);
    res.setHeader("Content-Disposition", `attachment; filename="pricora-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return {
      exportedAt: new Date().toISOString(),
      user: toPublicUser(user, pref?.zip ?? null),
      preferences: prefsOut(pref),
      favorites: favs.map((f) => ({ productSlug: f.product.slug, createdAt: f.createdAt.toISOString() })),
      alerts: alerts.map((a) => ({ productSlug: a.product.slug, type: a.type, createdAt: a.createdAt.toISOString() })),
      lists: lists.map((l) => ({ name: l.name, items: l.items.map((i) => ({ productSlug: i.product.slug, quantity: i.quantity })) })),
      recentlyViewed: recent.map((r) => ({ productSlug: r.product.slug, viewedAt: r.viewedAt.toISOString() })),
      searches: searches.map((s) => ({ query: s.query, at: s.createdAt.toISOString() })),
    };
  }

  @Delete()
  @HttpCode(200)
  async deleteAccount(@CurrentUser() user: User, @Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response): Promise<OkResponse> {
    const b = input("me.delete", "body", body);
    if (user.passwordHash) {
      if (!b.password || !(await verify(user.passwordHash, b.password))) {
        throw new ApiException(403, "forbidden", "Password confirmation is incorrect");
      }
    }
    if (user.role === "ADMIN") {
      const admins = await this.prisma.user.count({ where: { role: "ADMIN", status: "active" } });
      if (admins <= 1) throw new ApiException(409, "conflict", "Cannot delete the last admin account");
    }
    await this.sessions.revoke(req.sessionId, res);
    // Hard delete: cascades user-owned rows; clicks/audit rows keep userId = null.
    await this.prisma.user.delete({ where: { id: user.id } });
    return { ok: true };
  }
}
