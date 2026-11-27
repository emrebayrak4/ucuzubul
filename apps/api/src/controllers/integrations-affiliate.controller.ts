/**
 * Admin: affiliate programs (network advertiser ↔ retailer mapping) and on-demand network ingestion.
 * Programs are created automatically by ingestion when a network reports an advertiser we have not seen;
 * an admin links each one to a retailer before its coupons/products are imported.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type { AdminAffiliateProgram, AdminAffiliateProgramListResponse, AdminNetworkRunResponse } from "@pricora/contracts";
import { getNetworkMetadata } from "@pricora/retailer-adapters";
import { Auth } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { INTEGRATIONS, PRISMA, QUEUES, type PrismaClient, type Queues } from "../common/infra";
import { input } from "../common/validate";
import type { IntegrationConfig } from "../core/integration-config";
import type { NetworkIngestJob } from "../core/integrations-ingest";

const include = { retailer: { select: { id: true, slug: true, name: true } }, _count: { select: { conversions: true } } } as const;

type Row = {
  id: string;
  network: AdminAffiliateProgram["network"];
  externalId: string | null;
  name: string;
  status: AdminAffiliateProgram["status"];
  isActive: boolean;
  commissionRateBp: number | null;
  cookieDays: number | null;
  createdAt: Date;
  retailer: { id: string; slug: string; name: string } | null;
  _count: { conversions: number };
};

function toDto(p: Row): AdminAffiliateProgram {
  return {
    id: p.id,
    network: p.network,
    externalId: p.externalId,
    name: p.name,
    retailer: p.retailer,
    status: p.status,
    isActive: p.isActive,
    commissionRateBp: p.commissionRateBp,
    cookieDays: p.cookieDays,
    conversions: p._count.conversions,
    createdAt: p.createdAt.toISOString(),
  };
}

@Controller("admin")
export class AffiliateProgramsController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(QUEUES) private readonly queues: Queues,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  @Get("affiliate-programs")
  @Auth("admin")
  async list(@Query() query: unknown): Promise<AdminAffiliateProgramListResponse> {
    const q = input("admin.affiliatePrograms.list", "query", query);
    const rows = await this.prisma.affiliateProgram.findMany({
      where: { ...(q.network ? { network: q.network } : {}), ...(q.unmapped === "true" ? { retailerId: null } : q.unmapped === "false" ? { retailerId: { not: null } } : {}) },
      include,
      orderBy: [{ network: "asc" }, { name: "asc" }],
      take: 2000,
    });
    return { items: rows.map(toDto) };
  }

  @Patch("affiliate-programs/:id")
  @Auth("admin")
  async update(@Param() params: unknown, @Body() body: unknown): Promise<AdminAffiliateProgram> {
    const { id } = input("admin.affiliatePrograms.update", "params", params);
    const b = input("admin.affiliatePrograms.update", "body", body);
    const existing = await this.prisma.affiliateProgram.findUnique({ where: { id } });
    if (!existing) throw notFound("Affiliate program");
    let retailerId: string | null | undefined;
    if (b.retailerSlug === null) retailerId = null;
    else if (b.retailerSlug !== undefined) {
      const r = await this.prisma.retailer.findUnique({ where: { slug: b.retailerSlug }, select: { id: true } });
      if (!r) throw new ApiException(422, "validation_failed", `Unknown retailer "${b.retailerSlug}"`);
      retailerId = r.id;
    }
    const linked = retailerId !== undefined ? retailerId !== null : existing.retailerId !== null;
    const saved = await this.prisma.affiliateProgram.update({
      where: { id },
      data: {
        ...(retailerId !== undefined ? { retailerId } : {}),
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
        ...(b.commissionRateBp !== undefined ? { commissionRateBp: b.commissionRateBp } : {}),
        ...(b.cookieDays !== undefined ? { cookieDays: b.cookieDays } : {}),
        status: linked ? "live" : "pending_configuration",
      },
      include,
    });
    return toDto(saved);
  }

  @Post("affiliate-networks/:network/run")
  @HttpCode(200)
  @Auth("admin")
  async run(@Param() params: unknown, @Body() body: unknown): Promise<AdminNetworkRunResponse> {
    const { network } = input("admin.affiliateNetworks.run", "params", params);
    const { kind } = input("admin.affiliateNetworks.run", "body", body);
    const meta = getNetworkMetadata(network);
    if (!meta) throw notFound("Network");
    if (!meta.capabilities[kind]) return { queued: false, jobId: null, message: `${meta.name} has no ${kind} API` };
    const env = await this.integrations.env();
    const missing = meta.fields.filter((f) => f.required && !env[f.key]).map((f) => f.key);
    if (missing.length) return { queued: false, jobId: null, message: `Pending configuration — missing ${missing.join(", ")}` };
    const job: NetworkIngestJob = { kind, network };
    const j = await this.queues.networkIngest.add(kind, job, { removeOnComplete: 200, removeOnFail: 200 });
    return { queued: true, jobId: j.id ?? null, message: `Queued ${meta.name} ${kind}; results appear in data ingestion jobs` };
  }
}
