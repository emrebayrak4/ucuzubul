import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type {
  AdminLocalMerchant,
  AdminLocalMerchantListResponse,
  ChecklistItem,
  DataQualityFlag,
  LocalSellerStatusResponse,
  LocalStoresResponse,
  MerchantInventoryUpsertResponse,
  MerchantLocation,
  MerchantLocationInventoryResponse,
  MerchantLocationListResponse,
  OkResponse,
  ProductNearbyResponse,
  StoreLocationInput,
} from "@pricora/contracts";
import type { ServerEnv } from "@pricora/config/env";
import type { MerchantAccount, Prisma, User } from "@pricora/database";
import { slugify } from "@pricora/utils";
import { Auth, CurrentUser, type AuthedRequest } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { removeFeedInventory, syncLocalInventory } from "../core/local-inventory";
import { MetricsService } from "../services/catalog.service";
import { LocalService, locationInclude, locationOut } from "../services/local.service";

const STALE_INVENTORY_MS = 7 * 86_400_000;

// ───────────────────────────── public ─────────────────────────────

@Controller()
export class LocalController {
  constructor(@Inject(LocalService) private readonly local: LocalService) {}

  @Get("products/:slug/nearby")
  @Auth("optional")
  nearby(@Param() params: unknown, @Query() query: unknown, @Req() req: AuthedRequest): Promise<ProductNearbyResponse> {
    const { slug } = input("products.nearby", "params", params);
    const q = input("products.nearby", "query", query);
    return this.local.productNearby(slug, q, req.user);
  }

  @Get("local/stores")
  @Auth("optional")
  stores(@Query() query: unknown, @Req() req: AuthedRequest): Promise<LocalStoresResponse> {
    return this.local.storesNear(input("local.stores", "query", query), req.user);
  }
}

// ───────────────────────────── shared helpers ─────────────────────────────

/** Approximate coordinates from our Census ZCTA table (precise geocoding provider: pending configuration). */
async function geocodeZip(prisma: PrismaClient, zip: string): Promise<{ lat: number; lng: number; city: string | null; state: string | null }> {
  const row = await prisma.zipCode.findUnique({ where: { zip: zip.slice(0, 5) }, select: { lat: true, lng: true, city: true, state: true } });
  if (!row) throw new ApiException(422, "validation_failed", `ZIP ${zip} was not found in the US ZIP table — check the ZIP code`);
  return row;
}

function locationData(b: StoreLocationInput) {
  return {
    name: b.name,
    address1: b.address1,
    city: b.city,
    state: b.state,
    zip: b.zip,
    phone: b.phone ?? null,
    ...(b.hours ? { hours: b.hours as Prisma.InputJsonValue } : {}),
    pickup: b.pickup,
    deliveryRadiusMiles: b.deliveryRadiusMiles ?? null,
    pickupMinimumCents: b.pickupMinimumCents ?? null,
    deliveryMinimumCents: b.deliveryMinimumCents ?? null,
  };
}

type LocationRow = Prisma.StoreLocationGetPayload<{ include: typeof locationInclude & { _count: { select: { inventory: true } } } }>;

function merchantLocationOut(l: LocationRow): MerchantLocation {
  return { ...locationOut(l), verificationStatus: l.verificationStatus, isActive: l.isActive, inventoryCount: l._count.inventory, createdAt: l.createdAt.toISOString() };
}

const withCount = { ...locationInclude, _count: { select: { inventory: true } } } satisfies Prisma.StoreLocationInclude;

async function uniqueRetailerSlug(prisma: PrismaClient, name: string): Promise<string> {
  const base = slugify(name, { maxLength: 60 }) || "local-store";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await prisma.retailer.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// ───────────────────────────── merchant portal ─────────────────────────────

@Controller("merchant")
@Auth("merchant")
export class MerchantLocalController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  private async account(user: User): Promise<MerchantAccount> {
    const acc = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (!acc) throw new ApiException(404, "not_found", "No merchant account is linked to this user");
    return acc;
  }

  async status(acc: MerchantAccount): Promise<LocalSellerStatusResponse> {
    const [retailer, locations, feeds, connections, offers, inventory] = await Promise.all([
      acc.retailerId ? this.prisma.retailer.findUnique({ where: { id: acc.retailerId }, select: { id: true, slug: true, name: true, isActive: true } }) : null,
      this.prisma.storeLocation.findMany({ where: { merchantAccountId: acc.id }, select: { hours: true, verificationStatus: true } }),
      this.prisma.retailerFeed.count({ where: { merchantAccountId: acc.id } }),
      this.prisma.commerceConnection.count({ where: { merchantAccountId: acc.id, status: "live" } }),
      this.prisma.offer.count({ where: { merchantAccountId: acc.id } }),
      this.prisma.storeInventory.count({ where: { location: { merchantAccountId: acc.id } } }),
    ]);
    const checklist: ChecklistItem[] = [
      { key: "business", label: "Business details", done: Boolean(acc.legalName && acc.businessPhone), hint: acc.legalName ? null : "Add your legal business name and phone" },
      { key: "location", label: "Store location", done: locations.length > 0, hint: locations.length ? null : "Add at least one store address" },
      { key: "hours", label: "Opening hours", done: locations.some((l) => Array.isArray(l.hours) && l.hours.length > 0), hint: "Shoppers see “open now” and pickup times" },
      {
        key: "catalog",
        label: "Products",
        done: offers > 0 || feeds > 0 || connections > 0,
        hint: offers > 0 ? null : "Upload a CSV/XML feed or connect Shopify, WooCommerce, Square, Clover or a Google Merchant feed",
      },
      { key: "inventory", label: "In-store stock", done: inventory > 0, hint: inventory > 0 ? null : "Set stock per location so you appear under “Available nearby”" },
      {
        key: "review",
        label: "WhichLess review",
        done: acc.verificationStatus === "verified",
        hint: acc.verificationStatus === "rejected" ? (acc.reviewNote ?? "Application rejected — contact support") : acc.verificationStatus === "verified" ? null : "We check your business and address before your listing goes live",
      },
    ];
    return {
      merchant: {
        id: acc.id,
        companyName: acc.companyName,
        legalName: acc.legalName,
        businessCategory: acc.businessCategory,
        verificationStatus: acc.verificationStatus,
        isLocalSeller: acc.isLocalSeller,
        submittedAt: acc.submittedAt?.toISOString() ?? null,
        reviewedAt: acc.reviewedAt?.toISOString() ?? null,
        reviewNote: acc.reviewNote,
      },
      retailer,
      freeListing: true,
      checklist,
    };
  }

  /** Self-serve application. Any signed-in user; creates an inactive local store until an admin approves it. */
  @Post("local/apply")
  @Auth("user")
  async apply(@CurrentUser() user: User, @Body() body: unknown): Promise<LocalSellerStatusResponse> {
    const b = input("merchant.local.apply", "body", body);
    const existing = await this.prisma.merchantAccount.findUnique({ where: { userId: user.id } });
    if (existing) throw new ApiException(409, "conflict", "This account already has a merchant profile — manage it in the merchant portal");
    const geo = await geocodeZip(this.prisma, b.location.zip);
    const slug = await uniqueRetailerSlug(this.prisma, b.companyName);
    let host: string | null = null;
    if (b.website) {
      const u = new URL(b.website);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new ApiException(422, "validation_failed", "Website must be an http(s) URL");
      host = u.hostname.toLowerCase();
      const clash = await this.prisma.retailer.findUnique({ where: { domain: host }, select: { id: true } });
      if (clash) throw new ApiException(409, "conflict", "A store with this website is already listed — contact support to claim it");
    }
    // Shops without a website get a reserved .invalid domain (RFC 2606) and link to their WhichLess store page.
    const domain = host ?? `${slug}.local.invalid`;
    const websiteUrl = b.website ?? `${this.env.WEB_ORIGIN.replace(/\/$/, "")}/stores/${slug}`;

    const acc = await this.prisma.$transaction(async (tx) => {
      const retailer = await tx.retailer.create({
        data: {
          slug,
          name: b.companyName,
          domain,
          websiteUrl,
          kind: "local",
          isActive: false,
          integrationStatus: "pending_configuration",
          allowedRedirectHosts: host ? [host, `www.${host.replace(/^www\./, "")}`] : [],
        },
      });
      const account = await tx.merchantAccount.create({
        data: {
          userId: user.id,
          retailerId: retailer.id,
          companyName: b.companyName,
          legalName: b.legalName,
          contactEmail: b.contactEmail,
          businessPhone: b.businessPhone,
          website: b.website ?? null,
          businessCategory: b.businessCategory,
          einLast4: b.einLast4 ?? null,
          isLocalSeller: true,
          verificationStatus: "pending",
          submittedAt: new Date(),
        },
      });
      await tx.storeLocation.create({
        data: {
          ...locationData(b.location),
          retailerId: retailer.id,
          merchantAccountId: account.id,
          lat: geo.lat,
          lng: geo.lng,
          geoPrecision: "zip_centroid",
          source: "merchant_upload",
          verificationStatus: "pending",
        },
      });
      if (user.role === "USER") await tx.user.update({ where: { id: user.id }, data: { role: "MERCHANT" } });
      return account;
    });
    return this.status(acc);
  }

  @Get("local/status")
  async localStatus(@CurrentUser() user: User): Promise<LocalSellerStatusResponse> {
    return this.status(await this.account(user));
  }

  @Get("locations")
  async locations(@CurrentUser() user: User): Promise<MerchantLocationListResponse> {
    const acc = await this.account(user);
    const rows = await this.prisma.storeLocation.findMany({ where: { merchantAccountId: acc.id }, include: withCount, orderBy: { createdAt: "asc" } });
    return { items: rows.map(merchantLocationOut) };
  }

  @Post("locations")
  async createLocation(@CurrentUser() user: User, @Body() body: unknown): Promise<MerchantLocation> {
    const b = input("merchant.locations.create", "body", body);
    const acc = await this.account(user);
    if (!acc.retailerId) throw new ApiException(409, "conflict", "Your merchant account is not linked to a store yet");
    if ((await this.prisma.storeLocation.count({ where: { merchantAccountId: acc.id } })) >= 200) throw new ApiException(422, "validation_failed", "Location limit reached (200)");
    const geo = await geocodeZip(this.prisma, b.zip);
    const row = await this.prisma.storeLocation.create({
      data: { ...locationData(b), retailerId: acc.retailerId, merchantAccountId: acc.id, lat: geo.lat, lng: geo.lng, geoPrecision: "zip_centroid", source: "merchant_upload", verificationStatus: "pending" },
      include: withCount,
    });
    if (await syncLocalInventory(this.prisma, acc.id)) return merchantLocationOut(await this.prisma.storeLocation.findUniqueOrThrow({ where: { id: row.id }, include: withCount }));
    return merchantLocationOut(row);
  }

  private async ownLocation(user: User, id: string) {
    const acc = await this.account(user);
    const loc = await this.prisma.storeLocation.findUnique({ where: { id } });
    if (!loc || loc.merchantAccountId !== acc.id) throw notFound("Location");
    return { acc, loc };
  }

  @Patch("locations/:id")
  async updateLocation(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<MerchantLocation> {
    const { id } = input("merchant.locations.update", "params", params);
    const b = input("merchant.locations.update", "body", body);
    const { loc } = await this.ownLocation(user, id);
    const data: Prisma.StoreLocationUpdateInput = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.phone !== undefined) data.phone = b.phone;
    if (b.hours !== undefined) data.hours = b.hours as Prisma.InputJsonValue;
    if (b.pickup !== undefined) data.pickup = b.pickup;
    if (b.deliveryRadiusMiles !== undefined) data.deliveryRadiusMiles = b.deliveryRadiusMiles;
    if (b.pickupMinimumCents !== undefined) data.pickupMinimumCents = b.pickupMinimumCents;
    if (b.deliveryMinimumCents !== undefined) data.deliveryMinimumCents = b.deliveryMinimumCents;
    if (b.isActive !== undefined) data.isActive = b.isActive;
    const addressChanged =
      (b.address1 !== undefined && b.address1 !== loc.address1) || (b.city !== undefined && b.city !== loc.city) || (b.state !== undefined && b.state !== loc.state) || (b.zip !== undefined && b.zip !== loc.zip);
    if (addressChanged) {
      if (b.address1 !== undefined) data.address1 = b.address1;
      if (b.city !== undefined) data.city = b.city;
      if (b.state !== undefined) data.state = b.state;
      if (b.zip !== undefined && b.zip !== loc.zip) {
        const geo = await geocodeZip(this.prisma, b.zip);
        Object.assign(data, { zip: b.zip, lat: geo.lat, lng: geo.lng, geoPrecision: "zip_centroid" });
      }
      // A moved store needs a fresh check.
      data.verificationStatus = "pending";
    }
    const row = await this.prisma.storeLocation.update({ where: { id }, data, include: withCount });
    return merchantLocationOut(row);
  }

  @Delete("locations/:id")
  async deleteLocation(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("merchant.locations.delete", "params", params);
    await this.ownLocation(user, id);
    await this.prisma.storeLocation.delete({ where: { id } });
    return { ok: true };
  }

  @Get("locations/:id/inventory")
  async inventoryGet(@CurrentUser() user: User, @Param() params: unknown): Promise<MerchantLocationInventoryResponse> {
    const { id } = input("merchant.locations.inventoryGet", "params", params);
    const { acc, loc } = await this.ownLocation(user, id);
    const [offers, rows, pendingMatches] = await Promise.all([
      this.prisma.offer.findMany({
        where: { OR: [{ merchantAccountId: acc.id }, ...(acc.retailerId ? [{ retailerId: acc.retailerId }] : [])] },
        select: { id: true, productId: true, priceCents: true, isActive: true, title: true, product: { select: { slug: true, sizeLabel: true } } },
        orderBy: { title: "asc" },
        take: 1000,
      }),
      this.prisma.storeInventory.findMany({ where: { storeLocationId: id } }),
      acc.retailerId ? this.prisma.productMatch.count({ where: { retailerId: acc.retailerId, status: "pending_review" } }) : Promise.resolve(0),
    ]);
    const byProduct = new Map(rows.map((r) => [r.productId, r]));
    return {
      location: { id: loc.id, name: loc.name, verificationStatus: loc.verificationStatus },
      items: offers.map((o) => {
        const r = byProduct.get(o.productId);
        return {
          offerId: o.id,
          productSlug: o.product.slug,
          title: o.title,
          sizeLabel: o.product.sizeLabel,
          onlinePriceCents: o.priceCents,
          offerActive: o.isActive,
          storePriceCents: r?.priceCents ?? null,
          stock: r ? (r.stock === "preorder" ? "unknown" : r.stock) : null,
          quantity: r?.quantity ?? null,
          pickupToday: r?.pickupToday ?? false,
          lastCheckedAt: r?.lastCheckedAt.toISOString() ?? null,
        };
      }),
      pendingMatches,
    };
  }

  @Put("locations/:id/inventory")
  async inventory(@CurrentUser() user: User, @Param() params: unknown, @Body() body: unknown): Promise<MerchantInventoryUpsertResponse> {
    const { id } = input("merchant.locations.inventory", "params", params);
    const b = input("merchant.locations.inventory", "body", body);
    const { acc } = await this.ownLocation(user, id);
    const offers = await this.prisma.offer.findMany({
      where: { id: { in: b.items.map((i) => i.offerId) }, OR: [{ merchantAccountId: acc.id }, ...(acc.retailerId ? [{ retailerId: acc.retailerId }] : [])] },
      select: { id: true, productId: true, retailerSku: true, priceCents: true, currency: true, source: true },
    });
    const byId = new Map(offers.map((o) => [o.id, o]));
    const skipped: MerchantInventoryUpsertResponse["skipped"] = [];
    let updated = 0;
    const now = new Date();
    for (const item of b.items) {
      const o = byId.get(item.offerId);
      if (!o) {
        skipped.push({ offerId: item.offerId, reason: "Offer not found in your catalog" });
        continue;
      }
      const data = {
        retailerSku: o.retailerSku,
        priceCents: item.priceCents ?? o.priceCents,
        currency: o.currency,
        stock: item.stock,
        quantity: item.quantity ?? null,
        pickupToday: item.pickupToday ?? false,
        // Demo merchant catalogs stay labeled demo; real merchant input is merchant_upload.
        source: o.source === "demo" ? ("demo" as const) : ("merchant_upload" as const),
        lastCheckedAt: now,
      };
      await this.prisma.storeInventory.upsert({
        where: { storeLocationId_productId: { storeLocationId: id, productId: o.productId } },
        update: data,
        create: { ...data, storeLocationId: id, productId: o.productId },
      });
      updated++;
    }
    return { updated, skipped };
  }
}

// ───────────────────────────── admin ─────────────────────────────

const merchantInclude = {
  retailer: { select: { id: true, slug: true, name: true, isActive: true } },
  locations: { include: { _count: { select: { inventory: true } } }, orderBy: { createdAt: "asc" } },
  feeds: { orderBy: { uploadedAt: "desc" }, take: 10 },
  connections: { select: { provider: true, status: true, lastSyncAt: true, lastError: true } },
} satisfies Prisma.MerchantAccountInclude;
type MerchantRow = Prisma.MerchantAccountGetPayload<{ include: typeof merchantInclude }>;

@Controller("admin/local")
@Auth("staff")
export class AdminLocalController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  private async audit(req: AuthedRequest, action: string, entityType: string, entityId: string, diff: unknown): Promise<void> {
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

  private async toAdmin(rows: MerchantRow[]): Promise<AdminLocalMerchant[]> {
    const locs = rows.flatMap((r) => r.locations);
    const zips = [...new Set(locs.map((l) => l.zip))];
    const merchantIds = rows.map((r) => r.id);
    const [zipRows, staleRows, dupRows, noGtin] = await Promise.all([
      this.prisma.zipCode.findMany({ where: { zip: { in: zips } }, select: { zip: true, city: true, state: true } }),
      this.prisma.storeInventory.groupBy({ by: ["storeLocationId"], where: { storeLocationId: { in: locs.map((l) => l.id) } }, _max: { lastCheckedAt: true } }),
      this.prisma.storeLocation.findMany({
        where: { zip: { in: zips }, address1: { in: locs.map((l) => l.address1).filter((a): a is string => Boolean(a)), mode: "insensitive" }, id: { notIn: locs.map((l) => l.id) } },
        select: { zip: true, address1: true },
      }),
      Promise.all(
        merchantIds.map((id) =>
          this.prisma.offer.count({ where: { merchantAccountId: id, product: { identifiers: { none: { type: { in: ["UPC", "EAN", "GTIN"] } } } } } }).then((n) => [id, n] as const),
        ),
      ),
    ]);
    const zipBy = new Map(zipRows.map((z) => [z.zip, z]));
    const lastBy = new Map(staleRows.map((s) => [s.storeLocationId, s._max.lastCheckedAt]));
    const dupKey = new Set(dupRows.map((d) => `${d.zip}|${(d.address1 ?? "").toLowerCase()}`));
    const noGtinBy = new Map(noGtin);
    return rows.map((r) => {
      const flags: DataQualityFlag[] = [];
      if (!r.website) flags.push({ code: "missing_website", severity: "info", message: "No website — listing links to the WhichLess store page" });
      for (const f of r.feeds) if ((f.rowsRejected ?? 0) > 0) flags.push({ code: "feed_rejected_rows", severity: "warning", message: `Feed “${f.name}”: ${f.rowsRejected} rejected rows` });
      const missingGtin = noGtinBy.get(r.id) ?? 0;
      if (missingGtin > 0) flags.push({ code: "feed_missing_gtin", severity: "info", message: `${missingGtin} offers without UPC/EAN/GTIN (matching is harder)` });
      for (const c of r.connections) if (c.lastError) flags.push({ code: "connector_error", severity: "error", message: `${c.provider}: ${c.lastError}` });
      return {
        id: r.id,
        companyName: r.companyName,
        legalName: r.legalName,
        contactEmail: r.contactEmail,
        businessPhone: r.businessPhone,
        website: r.website,
        businessCategory: r.businessCategory,
        einLast4: r.einLast4,
        verificationStatus: r.verificationStatus,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewNote: r.reviewNote,
        retailer: r.retailer,
        locations: r.locations.map((l) => {
          const z = zipBy.get(l.zip);
          const lf: DataQualityFlag[] = [];
          if (!z) lf.push({ code: "zip_not_found", severity: "error", message: `ZIP ${l.zip} is not in the Census ZIP table` });
          if (l.geoPrecision === "zip_centroid") lf.push({ code: "approximate_location", severity: "info", message: "Coordinates are the ZIP centroid (precise geocoding pending configuration)" });
          if (!Array.isArray(l.hours) || l.hours.length === 0) lf.push({ code: "missing_hours", severity: "warning", message: "No opening hours" });
          if (!l.phone) lf.push({ code: "missing_phone", severity: "info", message: "No store phone" });
          if (l._count.inventory === 0) lf.push({ code: "no_inventory", severity: "warning", message: "No in-store stock reported yet" });
          const last = lastBy.get(l.id);
          if (last && Date.now() - last.getTime() > STALE_INVENTORY_MS) lf.push({ code: "stale_inventory", severity: "warning", message: `Stock last updated ${last.toISOString().slice(0, 10)}` });
          if (dupKey.has(`${l.zip}|${(l.address1 ?? "").toLowerCase()}`)) lf.push({ code: "duplicate_address", severity: "warning", message: "Another store uses this address" });
          if (z?.state && l.state && z.state !== l.state) lf.push({ code: "zip_not_found", severity: "error", message: `ZIP ${l.zip} is in ${z.state}, address says ${l.state}` });
          return {
            id: l.id,
            name: l.name,
            address1: l.address1,
            city: l.city,
            state: l.state,
            zip: l.zip,
            geoPrecision: l.geoPrecision === "provider" || l.geoPrecision === "source" ? l.geoPrecision : "zip_centroid",
            verificationStatus: l.verificationStatus,
            zipKnown: Boolean(z),
            zipCity: z?.city ?? null,
            zipState: z?.state ?? null,
            inventoryCount: l._count.inventory,
            flags: lf,
          };
        }),
        feeds: r.feeds.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          reviewStatus: f.reviewStatus,
          rowsTotal: f.rowsTotal,
          rowsAccepted: f.rowsAccepted,
          rowsRejected: f.rowsRejected,
          uploadedAt: f.uploadedAt.toISOString(),
        })),
        connections: r.connections.map((c) => ({ provider: c.provider, status: c.status, lastSyncAt: c.lastSyncAt?.toISOString() ?? null, lastError: c.lastError })),
        flags,
      };
    });
  }

  @Get("merchants")
  async merchants(@Query() query: unknown): Promise<AdminLocalMerchantListResponse> {
    const q = input("admin.local.merchants", "query", query);
    const where: Prisma.MerchantAccountWhereInput = { isLocalSeller: true, ...(q.status === "all" ? {} : { verificationStatus: q.status }) };
    const [total, rows, grouped] = await Promise.all([
      this.prisma.merchantAccount.count({ where }),
      this.prisma.merchantAccount.findMany({ where, include: merchantInclude, orderBy: [{ submittedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.merchantAccount.groupBy({ by: ["verificationStatus"], where: { isLocalSeller: true }, _count: { _all: true } }),
    ]);
    const count = (s: string) => grouped.find((g) => g.verificationStatus === s)?._count._all ?? 0;
    return {
      items: await this.toAdmin(rows),
      counts: { pending: count("pending"), verified: count("verified"), rejected: count("rejected"), unverified: count("unverified") },
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }

  @Patch("merchants/:id")
  @Auth("admin")
  async reviewMerchant(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<AdminLocalMerchant> {
    const { id } = input("admin.local.reviewMerchant", "params", params);
    const b = input("admin.local.reviewMerchant", "body", body);
    const acc = await this.prisma.merchantAccount.findUnique({ where: { id } });
    if (!acc || !acc.isLocalSeller) throw notFound("Local merchant");
    await this.prisma.$transaction(async (tx) => {
      await tx.merchantAccount.update({ where: { id }, data: { verificationStatus: b.decision, reviewNote: b.note ?? null, reviewedAt: new Date() } });
      if (acc.retailerId) {
        // Only approved local stores are visible to shoppers.
        const retailer = await tx.retailer.update({ where: { id: acc.retailerId }, data: { isActive: b.decision === "verified", integrationStatus: b.decision === "verified" ? "live" : "pending_configuration" } });
        // Approved → offers from approved feeds (with a real product link) go online; otherwise everything goes offline.
        if (b.decision === "verified") {
          await tx.offer.updateMany({
            where: { merchantAccountId: id, url: { not: retailer.websiteUrl }, OR: [{ feedId: null }, { feed: { reviewStatus: "verified" } }] },
            data: { isActive: true },
          });
        } else {
          await tx.offer.updateMany({ where: { merchantAccountId: id }, data: { isActive: false } });
        }
      }
    });
    if (b.decision === "verified") await syncLocalInventory(this.prisma, id);
    this.metrics.invalidate();
    await this.audit(req, `local_merchant.${b.decision}`, "MerchantAccount", id, { before: acc.verificationStatus, after: b.decision, note: b.note ?? null });
    const row = await this.prisma.merchantAccount.findUniqueOrThrow({ where: { id }, include: merchantInclude });
    return (await this.toAdmin([row]))[0] as AdminLocalMerchant;
  }

  @Patch("locations/:id")
  @Auth("admin")
  async reviewLocation(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<OkResponse> {
    const { id } = input("admin.local.reviewLocation", "params", params);
    const b = input("admin.local.reviewLocation", "body", body);
    const loc = await this.prisma.storeLocation.findUnique({ where: { id }, select: { verificationStatus: true } });
    if (!loc) throw notFound("Location");
    await this.prisma.storeLocation.update({ where: { id }, data: { verificationStatus: b.verificationStatus } });
    await this.audit(req, "store_location.review", "StoreLocation", id, { before: loc.verificationStatus, after: b.verificationStatus });
    return { ok: true };
  }

  @Patch("feeds/:id")
  @Auth("admin")
  async reviewFeed(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<OkResponse> {
    const { id } = input("admin.local.reviewFeed", "params", params);
    const b = input("admin.local.reviewFeed", "body", body);
    const feed = await this.prisma.retailerFeed.findUnique({
      where: { id },
      select: { reviewStatus: true, merchantAccountId: true, merchantAccount: { select: { verificationStatus: true } }, retailer: { select: { websiteUrl: true } } },
    });
    if (!feed) throw notFound("Feed");
    await this.prisma.$transaction(async (tx) => {
      await tx.retailerFeed.update({ where: { id }, data: { reviewStatus: b.reviewStatus } });
      // Approved feed of an approved merchant → linked offers online; rejected/pending → offline. In-store-only rows never link out.
      const online = b.reviewStatus === "verified" && feed.merchantAccount?.verificationStatus === "verified";
      await tx.offer.updateMany({ where: { feedId: id, ...(online ? { url: { not: feed.retailer.websiteUrl } } : {}) }, data: { isActive: online } });
    });
    if (feed.merchantAccountId) {
      if (b.reviewStatus === "verified") await syncLocalInventory(this.prisma, feed.merchantAccountId);
      if (b.reviewStatus === "rejected") await removeFeedInventory(this.prisma, id);
    }
    this.metrics.invalidate();
    await this.audit(req, "merchant_feed.review", "RetailerFeed", id, { before: feed.reviewStatus, after: b.reviewStatus });
    return { ok: true };
  }
}
