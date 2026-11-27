import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import type { FlightAlert, FlightAlertListResponse, FlightCalendarResponse, FlightExploreResponse, FlightSearchResponse, OkResponse } from "@pricora/contracts";
import type { TravelAlert, User } from "@pricora/database";
import { Auth, CurrentUser } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { FlightFareService } from "../core/flights";
import type { IntegrationConfig } from "../core/integration-config";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const MAX_ALERTS_PER_USER = 50;

function alertOut(a: TravelAlert): FlightAlert {
  return {
    id: a.id,
    from: (a.fromIata ?? "").trim(),
    to: (a.toIata ?? "").trim(),
    depart: a.departDate ? isoDate(a.departDate) : "",
    return: a.returnDate ? isoDate(a.returnDate) : null,
    targetPriceCents: a.targetPriceCents,
    active: a.active,
    lastTriggeredAt: a.lastTriggeredAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

@Controller("travel/flights")
export class TravelFlightsController {
  readonly fares: FlightFareService;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(INTEGRATIONS) integrations: IntegrationConfig,
  ) {
    this.fares = new FlightFareService(prisma, () => integrations.env());
  }

  @Get("search")
  async search(@Query() query: unknown): Promise<FlightSearchResponse> {
    return this.fares.search(input("travel.flights", "query", query));
  }

  @Get("calendar")
  async calendar(@Query() query: unknown): Promise<FlightCalendarResponse> {
    return this.fares.calendar(input("travel.flightCalendar", "query", query));
  }

  @Get("explore")
  async explore(@Query() query: unknown): Promise<FlightExploreResponse> {
    return this.fares.explore(input("travel.flightExplore", "query", query));
  }

  @Get("alerts")
  @Auth("user")
  async alerts(@CurrentUser() user: User, @Query() query: unknown): Promise<FlightAlertListResponse> {
    const q = input("travel.flightAlerts.list", "query", query);
    const rows = await this.prisma.travelAlert.findMany({
      where: { userId: user.id, kind: "flight", ...(q.from ? { fromIata: q.from } : {}), ...(q.to ? { toIata: q.to } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items: rows.map(alertOut) };
  }

  /** Idempotent per user + route + dates: re-tracking returns (and re-activates) the existing alert. */
  @Post("alerts")
  @Auth("user")
  async createAlert(@CurrentUser() user: User, @Body() body: unknown): Promise<FlightAlert> {
    const b = input("travel.flightAlerts.create", "body", body);
    const departDate = new Date(`${b.depart}T00:00:00Z`);
    const returnDate = b.return ? new Date(`${b.return}T00:00:00Z`) : null;
    const existing = await this.prisma.travelAlert.findFirst({ where: { userId: user.id, kind: "flight", fromIata: b.from, toIata: b.to, departDate, returnDate } });
    let target = b.targetPriceCents ?? null;
    if (target === null) {
      const cur = await this.fares.cheapestForAlert(b.from, b.to, b.depart, b.return ?? null);
      target = cur?.priceCents ?? null;
    }
    if (existing) {
      const row = await this.prisma.travelAlert.update({ where: { id: existing.id }, data: { active: true, ...(b.targetPriceCents ? { targetPriceCents: b.targetPriceCents } : {}) } });
      return alertOut(row);
    }
    const count = await this.prisma.travelAlert.count({ where: { userId: user.id, active: true } });
    if (count >= MAX_ALERTS_PER_USER) throw new ApiException(409, "conflict", `You can track up to ${MAX_ALERTS_PER_USER} routes. Remove one to add another.`);
    const row = await this.prisma.travelAlert.create({
      data: { userId: user.id, kind: "flight", fromIata: b.from, toIata: b.to, departDate, returnDate, targetPriceCents: target },
    });
    return alertOut(row);
  }

  @Delete("alerts/:id")
  @HttpCode(200)
  @Auth("user")
  async deleteAlert(@CurrentUser() user: User, @Param() params: unknown): Promise<OkResponse> {
    const { id } = input("travel.flightAlerts.delete", "params", params);
    const res = await this.prisma.travelAlert.deleteMany({ where: { id, userId: user.id, kind: "flight" } });
    if (res.count === 0) throw notFound("Alert");
    return { ok: true };
  }
}
