import { Controller, Get, Inject } from "@nestjs/common";
import type { AdminCoverageResponse, CoverageCount } from "@pricora/contracts";
import { Auth } from "../common/auth";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";
import { adapterStatuses } from "./health.controller";

const DAY = 86_400_000;
const SOURCE_LABEL: Record<string, string> = { api: "Retailer API", feed: "Product feed", merchant_upload: "Merchant upload", affiliate: "Affiliate network", demo: "Demo data" };
const KIND_LABEL: Record<string, string> = { national: "National chains", marketplace: "Marketplaces", local: "Local sellers" };

/** Coverage dashboard: how many stores / offers / categories we cover and how fresh the data is. */
@Controller("admin")
@Auth("staff")
export class CoverageController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  @Get("coverage")
  async coverage(): Promise<AdminCoverageResponse> {
    const now = Date.now();
    const [
      retailers,
      activeRetailers,
      kinds,
      locations,
      verifiedLocations,
      approxLocations,
      locBySource,
      locByState,
      products,
      offers,
      bySource,
      inventoryRows,
      fresh1,
      fresh7,
      fresh30,
      connections,
      catRows,
    ] = await Promise.all([
      this.prisma.retailer.count({ where: { homeMarketId: "us" } }),
      this.prisma.retailer.count({ where: { homeMarketId: "us", isActive: true } }),
      this.prisma.retailer.groupBy({ by: ["kind"], where: { homeMarketId: "us" }, _count: { _all: true } }),
      this.prisma.storeLocation.count(),
      this.prisma.storeLocation.count({ where: { verificationStatus: "verified" } }),
      this.prisma.storeLocation.count({ where: { geoPrecision: "zip_centroid" } }),
      this.prisma.storeLocation.groupBy({ by: ["source"], _count: { _all: true } }),
      this.prisma.storeLocation.groupBy({ by: ["state"], _count: { _all: true }, orderBy: { _count: { state: "desc" } }, take: 15 }),
      this.prisma.product.count({ where: { status: "active" } }),
      this.prisma.offer.count({ where: { isActive: true, marketId: "us" } }),
      this.prisma.offer.groupBy({ by: ["source"], where: { isActive: true, marketId: "us" }, _count: { _all: true } }),
      this.prisma.storeInventory.count(),
      this.prisma.offer.count({ where: { isActive: true, marketId: "us", lastCheckedAt: { gte: new Date(now - DAY) } } }),
      this.prisma.offer.count({ where: { isActive: true, marketId: "us", lastCheckedAt: { gte: new Date(now - 7 * DAY) } } }),
      this.prisma.offer.count({ where: { isActive: true, marketId: "us", lastCheckedAt: { gte: new Date(now - 30 * DAY) } } }),
      this.prisma.commerceConnection.groupBy({ by: ["provider", "status"], _count: { _all: true } }),
      this.prisma.$queryRaw<{ slug: string; name: string; products: bigint; offers: bigint; retailers: bigint; demo: bigint }[]>`
        SELECT c.slug, c.name,
               COUNT(DISTINCT p.id) AS products,
               COUNT(o.id) AS offers,
               COUNT(DISTINCT o."retailerId") AS retailers,
               COUNT(o.id) FILTER (WHERE o.source = 'demo') AS demo
        FROM categories c
        JOIN categories leaf ON leaf.path = c.path OR leaf.path LIKE c.path || '/%'
        JOIN products p ON p."categoryId" = leaf.id AND p.status = 'active'
        LEFT JOIN offers o ON o."productId" = p.id AND o."isActive" = true AND o."marketId" = 'us'
        WHERE c.depth = 0 AND c."isActive" = true
        GROUP BY c.slug, c.name
        ORDER BY offers DESC`,
    ]);

    const demoOffers = bySource.find((s) => s.source === "demo")?._count._all ?? 0;
    const providers = [...new Set(connections.map((c) => c.provider))];
    const count = (rows: { _count: { _all: number } }[]) => rows.reduce((s, r) => s + r._count._all, 0);
    const offersBySource: CoverageCount[] = bySource.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source] ?? s.source, value: s._count._all })).sort((a, b) => b.value - a.value);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        retailers,
        activeRetailers,
        storeLocations: locations,
        verifiedLocations,
        approximateLocations: approxLocations,
        products,
        offers,
        storeInventoryRows: inventoryRows,
        demoOffers,
        liveOffers: offers - demoOffers,
      },
      retailersByKind: (["national", "marketplace", "local"] as const).map((k) => ({ key: k, label: KIND_LABEL[k] ?? k, value: kinds.find((x) => x.kind === k)?._count._all ?? 0 })),
      offersBySource,
      locationsBySource: locBySource.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source] ?? s.source, value: s._count._all })),
      locationsByState: locByState.map((s) => ({ key: s.state ?? "?", label: s.state ?? "Unknown", value: s._count._all })),
      offersByCategory: catRows.map((r) => ({
        slug: r.slug,
        name: r.name,
        products: Number(r.products),
        offers: Number(r.offers),
        retailers: Number(r.retailers),
        demoShare: Number(r.offers) > 0 ? Math.round((Number(r.demo) / Number(r.offers)) * 1000) / 1000 : 0,
      })),
      freshness: [
        { key: "24h", label: "Checked < 24 h", value: fresh1 },
        { key: "7d", label: "1–7 days", value: fresh7 - fresh1 },
        { key: "30d", label: "7–30 days", value: fresh30 - fresh7 },
        { key: "older", label: "Older than 30 days", value: offers - fresh30 },
      ],
      connectors: providers.map((p) => {
        const rows = connections.filter((c) => c.provider === p);
        return { provider: p, connections: count(rows), live: count(rows.filter((r) => r.status === "live")), errors: count(rows.filter((r) => r.status === "error")) };
      }),
      adapters: adapterStatuses(await this.integrations.env()).map((a) => ({ id: a.id, name: a.name, kind: a.kind, status: a.status })),
      hasDemoData: demoOffers > 0,
    };
  }
}
