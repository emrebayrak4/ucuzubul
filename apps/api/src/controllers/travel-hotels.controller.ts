import { Controller, Get, Inject, Logger, Param, Query } from "@nestjs/common";
import {
  HOTEL_TOP_PICKS_RULE,
  HotelPropertyType,
  type BoardType,
  type HotelDealsResponse,
  type HotelDestinationsResponse,
  type HotelDetailResponse,
  type HotelHouseRules,
  type HotelNearbyPlace,
  type HotelRate,
  type HotelRatePlan,
  type HotelRoomType,
  type HotelSearchQuery,
  type HotelSearchResponse,
  type HotelSummary,
  type ProviderStatus,
} from "@pricora/contracts";
import type { Hotel, HotelRate as HotelRateRow, HotelRoom, Prisma } from "@pricora/database";
import { createHotelProviders, type HotelProvider } from "@pricora/retailer-adapters";
import { notFound } from "../common/errors";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { haversineKm, resolvePlacePoint } from "../core/places";
import type { IntegrationConfig } from "../core/integration-config";
import {
  applyFilters,
  buildFacets,
  DAY_MS,
  median,
  nightsBetween,
  parseRatePlans,
  priceDemoRoom,
  sortHotels,
  toPins,
  type HotelCandidate,
} from "../core/hotels/engine";
import { guideSlugForCity } from "./guides.controller";

type HotelRow = Hotel & { rooms: HotelRoom[]; rates: HotelRateRow[] };
type Stay = { checkin: string; checkout: string; nights: number; guests: number; rooms: number };
type Location = { name: string; countryIso2: string | null; point: { lat: number; lng: number } | null; cityId: number | null; countryOnly: boolean };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const asPropertyType = (v: string) => (HotelPropertyType.safeParse(v).success ? (v as HotelPropertyType) : "hotel");

function aggregateSource(sources: string[]): HotelSearchResponse["source"] {
  const set = new Set(sources);
  if (set.size === 0) return "none";
  if (set.size > 1) return "mixed";
  return [...set][0] as HotelSearchResponse["source"];
}

/** Next Friday → Sunday (UTC dates). */
export function nextWeekend(now = new Date()): { checkin: string; checkout: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const add = (5 - d.getUTCDay() + 7) % 7 || 7;
  const fri = new Date(d.getTime() + add * DAY_MS);
  return { checkin: isoDate(fri), checkout: isoDate(new Date(fri.getTime() + 2 * DAY_MS)) };
}

function houseRules(json: unknown): HotelHouseRules | null {
  if (typeof json !== "object" || json === null) return null;
  const o = json as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);
  return {
    checkinFrom: s("checkinFrom"),
    checkinUntil: s("checkinUntil"),
    checkoutUntil: s("checkoutUntil"),
    pets: s("pets"),
    smoking: s("smoking"),
    parties: s("parties"),
    minCheckinAge: typeof o["minCheckinAge"] === "number" ? (o["minCheckinAge"] as number) : null,
    quietHours: s("quietHours"),
  };
}

function faqs(json: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(json)) return [];
  return json.flatMap((f) => {
    if (typeof f !== "object" || f === null) return [];
    const o = f as Record<string, unknown>;
    return typeof o["q"] === "string" && typeof o["a"] === "string" ? [{ q: o["q"], a: o["a"] }] : [];
  });
}

type PricedOffer = HotelRate & { bedConfig: string | null; roomSort: number };

@Controller("travel")
export class TravelHotelsController {
  private readonly log = new Logger("TravelHotels");
  private cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  private async providerSet(): Promise<{ statuses: ProviderStatus[]; live: HotelProvider[] }> {
    const all = createHotelProviders({ env: await this.integrations.env() });
    const statuses = all.map((p): ProviderStatus => {
      const s = p.status();
      return {
        id: p.id,
        name: p.name,
        status: s === "live" ? "live" : s === "error" ? "error" : "pending_configuration",
        ...(s === "pending_configuration" ? { message: `Missing ${p.missingEnv().join(", ")}` } : {}),
      };
    });
    return { statuses, live: all.filter((p) => p.status() === "live") };
  }

  /* ---------------- pricing ---------------- */

  /** All offers for the stay: stored provider snapshots for these exact dates + demo room series. Never extrapolated. */
  private offersFor(h: HotelRow, stay: Stay): PricedOffer[] {
    const perRoom = Math.ceil(stay.guests / stay.rooms);
    const out: PricedOffer[] = [];
    for (const room of h.rooms) {
      if (room.maxOccupancy < perRoom) continue;
      const prices = priceDemoRoom(room, stay.checkin, stay.checkout, stay.rooms, h.country);
      if (!prices) continue;
      for (const p of prices) {
        out.push({
          id: `${room.id}~${p.plan.code}~${stay.checkin}~${stay.checkout}`,
          provider: { id: "demo", name: "Demo data" },
          roomName: room.name,
          roomId: room.id,
          ratePlanName: p.plan.name,
          boardType: p.plan.boardType,
          refundable: p.plan.refundable,
          payLater: p.plan.payLater,
          nightlyPriceCents: p.nightlyCents,
          totalPriceCents: p.totalCents,
          taxesAndFeesCents: p.taxesCents,
          taxesEstimated: true,
          currency: "USD",
          goUrl: "",
          source: room.source,
          fetchedAt: (room.demoRatesFrom ?? h.updatedAt).toISOString(),
          bedConfig: room.bedConfig,
          roomSort: room.sortOrder,
        });
      }
    }
    for (const r of h.rates) {
      if (isoDate(r.checkin) !== stay.checkin || isoDate(r.checkout) !== stay.checkout) continue;
      out.push({
        id: r.id,
        provider: { id: r.provider, name: r.provider === "demo" ? "Demo data" : r.provider },
        roomName: r.roomName,
        roomId: null,
        ratePlanName: null,
        boardType: r.boardType,
        refundable: r.refundable,
        payLater: null,
        nightlyPriceCents: r.nightlyPriceCents,
        totalPriceCents: r.totalPriceCents,
        taxesAndFeesCents: r.taxesAndFeesCents,
        taxesEstimated: false,
        currency: r.currency,
        goUrl: r.source === "demo" ? "" : `/v1/travel/go/hotel/${r.id}`,
        source: r.source,
        fetchedAt: r.fetchedAt.toISOString(),
        bedConfig: null,
        roomSort: 100,
      });
    }
    return out.sort((a, b) => a.totalPriceCents - b.totalPriceCents);
  }

  private candidate(h: HotelRow, stay: Stay, centers: Map<number, { lat: number; lng: number }>, fallbackCenter: { lat: number; lng: number } | null): HotelCandidate {
    const offers = this.offersFor(h, stay);
    const cheapest = offers[0] ?? null;
    const center = (h.cityId !== null ? centers.get(h.cityId) : undefined) ?? fallbackCenter;
    const distanceKm = center && h.lat !== null && h.lon !== null ? Math.round(haversineKm(center.lat, center.lng, h.lat, h.lon) * 10) / 10 : null;
    const meals = [...new Set(offers.map((o) => o.boardType).filter((b): b is BoardType => b !== null))];
    const summary: HotelSummary = {
      id: h.id,
      name: h.name,
      stars: h.starRating,
      propertyType: asPropertyType(h.propertyType),
      address: h.address,
      city: h.city,
      region: h.region,
      country: h.country,
      neighborhood: h.neighborhood,
      chain: h.chain,
      lat: h.lat,
      lon: h.lon,
      distanceKm,
      imageUrl: h.imageUrl ?? h.images[0] ?? null,
      amenities: h.amenities,
      roomSummary: cheapest ? [cheapest.roomName, cheapest.bedConfig].filter(Boolean).join(" · ") : null,
      freeCancellation: offers.some((o) => o.refundable === true),
      payAtProperty: offers.some((o) => o.payLater === true),
      breakfastAvailable: meals.some((m) => m !== "room_only") || h.amenities.includes("breakfast"),
      lowestNightlyCents: cheapest?.nightlyPriceCents ?? null,
      lowestTotalCents: cheapest?.totalPriceCents ?? null,
      lowestTaxesCents: cheapest?.taxesAndFeesCents ?? null,
      taxesEstimated: cheapest?.taxesEstimated ?? false,
      providerCount: new Set(offers.map((o) => o.provider.id)).size,
      currency: cheapest?.currency ?? "USD",
      source: h.source,
    };
    return { summary, accessibility: h.accessibility, meals };
  }

  private async cityCenters(ids: Array<number | null>): Promise<Map<number, { lat: number; lng: number }>> {
    const uniq = [...new Set(ids.filter((x): x is number => x !== null))];
    if (!uniq.length) return new Map();
    const rows = await this.prisma.city.findMany({ where: { geonameId: { in: uniq } }, select: { geonameId: true, lat: true, lng: true } });
    return new Map(rows.map((c) => [c.geonameId, { lat: c.lat, lng: c.lng }]));
  }

  /* ---------------- location ---------------- */

  private async resolveLocation(q: HotelSearchQuery): Promise<Location | null> {
    if (q.placeId) {
      const p = await resolvePlacePoint(this.prisma, q.placeId);
      if (!p) return null;
      let cityId: number | null = null;
      if (q.placeId.startsWith("city_")) cityId = Number(q.placeId.slice(5));
      if (q.placeId.startsWith("airport_")) cityId = (await this.prisma.airport.findUnique({ where: { iata: q.placeId.slice(8).toUpperCase() }, select: { cityId: true } }))?.cityId ?? null;
      return { name: p.name, countryIso2: p.countryIso2, point: p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null, cityId, countryOnly: p.kind === "country" };
    }
    if (q.cityId) {
      const c = await this.prisma.city.findUnique({ where: { geonameId: q.cityId } });
      return c ? { name: c.name, countryIso2: c.countryIso2, point: { lat: c.lat, lng: c.lng }, cityId: c.geonameId, countryOnly: false } : null;
    }
    if (q.lat !== undefined && q.lng !== undefined) return { name: q.city ?? "Selected area", countryIso2: null, point: { lat: q.lat, lng: q.lng }, cityId: null, countryOnly: false };
    const name = q.city?.split(",")[0]?.trim();
    if (!name) return null;
    const c = await this.prisma.city.findFirst({
      where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { asciiName: { equals: name, mode: "insensitive" } }, { alternateNames: { has: name } }, { population: { gte: 1_000_000 }, name: { startsWith: name, mode: "insensitive" } }] },
      orderBy: { population: "desc" },
    });
    return c ? { name: c.name, countryIso2: c.countryIso2, point: { lat: c.lat, lng: c.lng }, cityId: c.geonameId, countryOnly: false } : { name, countryIso2: null, point: null, cityId: null, countryOnly: false };
  }

  private locationWhere(loc: Location, radiusKm: number): Prisma.HotelWhereInput {
    if (loc.countryOnly && loc.countryIso2) return { country: loc.countryIso2 };
    const or: Prisma.HotelWhereInput[] = [{ city: { equals: loc.name, mode: "insensitive" } }];
    if (loc.cityId !== null) or.push({ cityId: loc.cityId });
    if (loc.point) {
      const dLat = radiusKm / 110.574;
      const dLng = radiusKm / (111.32 * Math.max(0.1, Math.cos((loc.point.lat * Math.PI) / 180)));
      or.push({ lat: { gte: loc.point.lat - dLat, lte: loc.point.lat + dLat }, lon: { gte: loc.point.lng - dLng, lte: loc.point.lng + dLng } });
    }
    return { OR: or };
  }

  private stayInclude(stay: Stay) {
    return { rooms: { orderBy: { sortOrder: "asc" as const } }, rates: { where: { checkin: new Date(`${stay.checkin}T00:00:00Z`), checkout: new Date(`${stay.checkout}T00:00:00Z`) } } };
  }

  /**
   * Live providers: results are persisted as provider hotels + rate snapshots for the stay (so detail pages and
   * redirects work), and for that location they replace demo inventory.
   */
  private async liveSearch(live: HotelProvider[], loc: Location, stay: Stay, radiusKm: number): Promise<{ ok: boolean; failed: Set<string> }> {
    const failed = new Set<string>();
    let any = false;
    for (const p of live) {
      try {
        const res = await p.searchHotels({
          destination: loc.point ? { type: "coordinates", latitude: loc.point.lat, longitude: loc.point.lng, radiusKm } : { type: "city", value: loc.name },
          checkin: stay.checkin,
          checkout: stay.checkout,
          adults: stay.guests,
          rooms: stay.rooms,
          currency: "USD",
        });
        for (const o of res.data) {
          if (o.currency !== "USD") continue;
          any = true;
          const slug = `${p.id}-${o.hotelId}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 150);
          const hotel = await this.prisma.hotel.upsert({
            where: { slug },
            create: {
              slug,
              name: o.name ?? "Hotel",
              starRating: o.starRating,
              city: loc.name,
              country: loc.countryIso2 ?? "US",
              cityId: loc.cityId,
              providerRefs: { [p.id]: o.hotelId },
              source: o.source,
            },
            update: { ...(o.name ? { name: o.name } : {}), starRating: o.starRating },
          });
          const checkin = new Date(`${stay.checkin}T00:00:00Z`);
          const checkout = new Date(`${stay.checkout}T00:00:00Z`);
          await this.prisma.hotelRate.deleteMany({ where: { hotelId: hotel.id, provider: p.id, checkin, checkout, roomName: o.roomName ?? "Room" } });
          await this.prisma.hotelRate.create({
            data: {
              hotelId: hotel.id,
              provider: p.id,
              roomName: o.roomName ?? "Room",
              refundable: o.refundable,
              checkin,
              checkout,
              guests: stay.guests,
              rooms: stay.rooms,
              nightlyPriceCents: Math.round(o.totalCents / stay.nights / stay.rooms),
              totalPriceCents: o.totalCents,
              taxesAndFeesCents: null,
              currency: o.currency,
              deepLink: o.deepLink,
              source: o.source,
            },
          });
        }
      } catch (err) {
        failed.add(p.id);
        this.log.warn(`Hotel provider ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { ok: any, failed };
  }

  /* ---------------- endpoints ---------------- */

  @Get("hotels/search")
  async search(@Query() query: unknown): Promise<HotelSearchResponse> {
    const q = input("travel.hotels", "query", query);
    const stay: Stay = { checkin: q.checkin, checkout: q.checkout, nights: nightsBetween(q.checkin, q.checkout), guests: q.guests, rooms: q.rooms };
    const loc = await this.resolveLocation(q);
    const { statuses, live } = await this.providerSet();

    let rows: HotelRow[] = [];
    if (loc) {
      const where = this.locationWhere(loc, q.radiusKm);
      let hideDemo = false;
      if (live.length) {
        const res = await this.liveSearch(live, loc, stay, q.radiusKm);
        for (const s of statuses) if (res.failed.has(s.id)) Object.assign(s, { status: "error", message: "Provider request failed" });
        hideDemo = res.ok;
      }
      rows = await this.prisma.hotel.findMany({ where: hideDemo ? { AND: [where, { source: { not: "demo" } }] } : where, include: this.stayInclude(stay) });
      // Radius check on top of the bounding box (city-name / cityId matches are kept regardless).
      if (loc.point && !loc.countryOnly) {
        const p = loc.point;
        rows = rows.filter(
          (h) =>
            (loc.cityId !== null && h.cityId === loc.cityId) ||
            fold(h.city) === fold(loc.name) ||
            (h.lat !== null && h.lon !== null && haversineKm(p.lat, p.lng, h.lat, h.lon) <= q.radiusKm),
        );
      }
    }

    const centers = await this.cityCenters(rows.map((h) => h.cityId));
    const all = rows.map((h) => this.candidate(h, stay, centers, loc?.point ?? null));
    const filtered = sortHotels(applyFilters(all, q), q.sort);
    const facets = buildFacets(all, q, { amenities: q.amenities, accessibility: q.accessibility });
    const items = filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map((c) => c.summary);
    const guideSlug = loc && !loc.countryOnly ? await guideSlugForCity(this.prisma, loc.cityId, loc.name, loc.countryIso2) : null;
    return {
      items,
      pins: toPins(filtered),
      facets,
      providers: statuses,
      source: aggregateSource(all.map((c) => c.summary.source)),
      total: filtered.length,
      unfilteredTotal: all.length,
      page: q.page,
      pageSize: q.pageSize,
      nights: stay.nights,
      location: loc ? { name: loc.name, countryIso2: loc.countryIso2, lat: loc.point?.lat ?? null, lng: loc.point?.lng ?? null, cityId: loc.cityId } : null,
      guideSlug,
      topPicksRule: HOTEL_TOP_PICKS_RULE,
      searchedAt: new Date().toISOString(),
    };
  }

  @Get("hotels/deals")
  async deals(@Query() query: unknown): Promise<HotelDealsResponse> {
    const q = input("travel.hotelDeals", "query", query);
    const wk = nextWeekend();
    const checkin = q.checkin ?? wk.checkin;
    const checkout = q.checkout && q.checkout > checkin ? q.checkout : isoDate(new Date(Date.parse(checkin) + 2 * DAY_MS));
    const stay: Stay = { checkin, checkout, nights: nightsBetween(checkin, checkout), guests: 2, rooms: 1 };
    const rule = "Stay price at least 5% below the same room's typical price for those weekdays (median of our stored nightly rates over the next 180 days). Demo listings use demo prices.";
    const items = await this.cached(`deals:${checkin}:${checkout}`, 10 * 60_000, async () => {
      const rows = await this.prisma.hotel.findMany({ where: { rooms: { some: {} } }, include: this.stayInclude(stay) });
      const centers = await this.cityCenters(rows.map((h) => h.cityId));
      const deals: HotelDealsResponse["items"] = [];
      for (const h of rows) {
        const c = this.candidate(h, stay, centers, null);
        const best = this.offersFor(h, stay)[0];
        const room = best?.roomId ? h.rooms.find((r) => r.id === best.roomId) : undefined;
        if (!best || !room?.demoRatesFrom) continue;
        const plan = parseRatePlans(room.ratePlans).find((p) => p.name === best.ratePlanName);
        if (!plan) continue;
        // Typical = per-night median of the same weekday across the stored series, same plan factor.
        const from = room.demoRatesFrom.getTime();
        let typical = 0;
        for (let n = 0; n < stay.nights; n++) {
          const dow = new Date(Date.parse(checkin) + n * DAY_MS).getUTCDay();
          const same = room.demoNightlyCents.filter((_, i) => new Date(from + i * DAY_MS).getUTCDay() === dow);
          typical += median(same) * plan.priceFactor;
        }
        const typicalNightly = Math.round(typical / stay.nights / 100) * 100;
        const savingsPct = Math.round(((typicalNightly - best.nightlyPriceCents) / typicalNightly) * 100);
        if (savingsPct >= 5) deals.push({ ...c.summary, typicalNightlyCents: typicalNightly, savingsPct });
      }
      deals.sort((a, b) => b.savingsPct - a.savingsPct || a.name.localeCompare(b.name));
      const perCity = new Map<string, number>();
      return deals.filter((d) => {
        const n = perCity.get(d.city) ?? 0;
        perCity.set(d.city, n + 1);
        return n < 2;
      });
    });
    return { checkin, checkout, nights: stay.nights, items: items.slice(0, q.limit), rule };
  }

  @Get("hotels/destinations")
  async destinations(): Promise<HotelDestinationsResponse> {
    return this.cached("destinations:v2", 10 * 60_000, async () => {
      const [rows, guides] = await Promise.all([
        this.prisma.hotel.findMany({ select: { city: true, country: true, cityId: true, source: true, rooms: { where: { maxOccupancy: { gte: 2 } }, select: { demoNightlyCents: true, ratePlans: true } } } }),
        this.prisma.travelGuide.findMany({ where: { status: "published" }, select: { slug: true, city: true, cityId: true, countryIso2: true } }),
      ]);
      const groups = new Map<string, { city: string; country: string; cityId: number | null; count: number; lowest: number | null; sources: Set<string> }>();
      for (const h of rows) {
        const key = `${h.country}:${fold(h.city)}`;
        const g = groups.get(key) ?? { city: h.city, country: h.country, cityId: h.cityId, count: 0, lowest: null, sources: new Set<string>() };
        g.count++;
        g.sources.add(h.source);
        for (const r of h.rooms) {
          const factor = Math.min(...parseRatePlans(r.ratePlans).map((p) => p.priceFactor), 1);
          const next30 = r.demoNightlyCents.slice(0, 30);
          if (next30.length) {
            const v = Math.round((Math.min(...next30) * factor) / 100) * 100;
            if (g.lowest === null || v < g.lowest) g.lowest = v;
          }
        }
        groups.set(key, g);
      }
      const items = [...groups.values()]
        .map((g) => {
          const guide = guides.find((x) => x.countryIso2 === g.country && ((g.cityId !== null && x.cityId === g.cityId) || fold(x.city) === fold(g.city) || fold(g.city).startsWith(fold(x.city))));
          return {
            city: g.city,
            countryIso2: g.country,
            cityId: g.cityId,
            guideSlug: guide?.slug ?? null,
            hotelCount: g.count,
            lowestNightlyCents: g.lowest,
            source: g.sources.size > 1 ? ("mixed" as const) : ([...g.sources][0] as HotelDestinationsResponse["items"][number]["source"]),
          };
        })
        .sort((a, b) => b.hotelCount - a.hotelCount || a.city.localeCompare(b.city));
      return { items };
    });
  }

  @Get("hotels/:id")
  async detail(@Param() params: unknown, @Query() query: unknown): Promise<HotelDetailResponse> {
    const { id } = input("travel.hotel", "params", params);
    const q = input("travel.hotel", "query", query);
    const defaultIn = isoDate(new Date(Date.now() + 14 * DAY_MS));
    const checkin = q.checkin ?? defaultIn;
    const checkout = q.checkout && q.checkout > checkin ? q.checkout : isoDate(new Date(Date.parse(checkin) + 2 * DAY_MS));
    const stay: Stay = { checkin, checkout, nights: nightsBetween(checkin, checkout), guests: q.guests ?? 2, rooms: q.rooms ?? 1 };
    const h = await this.prisma.hotel.findUnique({ where: { id }, include: this.stayInclude(stay) });
    if (!h) throw notFound("Hotel");

    const [centers, { statuses }] = await Promise.all([this.cityCenters([h.cityId]), this.providerSet()]);
    const c = this.candidate(h, stay, centers, null);
    const offers = this.offersFor(h, stay);
    const perRoom = Math.ceil(stay.guests / stay.rooms);
    const strip = ({ bedConfig: _b, roomSort: _s, ...rate }: PricedOffer): HotelRate => rate;

    const rooms: HotelRoomType[] = [];
    for (const room of h.rooms) {
      const plans: HotelRatePlan[] = parseRatePlans(room.ratePlans).map((p) => ({
        code: p.code,
        name: p.name,
        refundable: p.refundable,
        boardType: p.boardType,
        payLater: p.payLater,
        offers: offers.filter((o) => o.roomId === room.id && o.ratePlanName === p.name).map(strip),
      }));
      rooms.push({ id: room.id, name: room.name, bedConfig: room.bedConfig, sizeSqm: room.sizeSqm, maxOccupancy: room.maxOccupancy, amenities: room.amenities, fitsGuests: room.maxOccupancy >= perRoom, ratePlans: plans });
    }
    // Provider snapshots without a room-type record: group by room name, then by (board, refundable).
    const loose = offers.filter((o) => o.roomId === null);
    for (const name of [...new Set(loose.map((o) => o.roomName))]) {
      const inRoom = loose.filter((o) => o.roomName === name);
      const planKeys = [...new Set(inRoom.map((o) => `${o.boardType ?? ""}|${String(o.refundable)}`))];
      rooms.push({
        id: `snapshot:${name}`,
        name,
        bedConfig: null,
        sizeSqm: null,
        maxOccupancy: perRoom,
        amenities: [],
        fitsGuests: true,
        ratePlans: planKeys.map((k) => {
          const [board, refundable] = k.split("|");
          const ofPlan = inRoom.filter((o) => `${o.boardType ?? ""}|${String(o.refundable)}` === k);
          const byProvider = new Map<string, PricedOffer>();
          for (const o of ofPlan) if (!byProvider.has(o.provider.id)) byProvider.set(o.provider.id, o);
          return {
            code: k,
            name: refundable === "true" ? "Free cancellation" : refundable === "false" ? "Non-refundable" : "Provider rate",
            refundable: refundable === "true" ? true : refundable === "false" ? false : null,
            boardType: (board || null) as BoardType | null,
            payLater: null,
            offers: [...byProvider.values()].map(strip),
          };
        }),
      });
    }

    return {
      hotel: {
        ...c.summary,
        description: h.description,
        images: h.images.length ? h.images : h.imageUrl ? [h.imageUrl] : [],
        checkinTime: h.checkinTime,
        checkoutTime: h.checkoutTime,
        highlights: h.highlights,
        accessibility: h.accessibility,
        houseRules: houseRules(h.houseRules),
        faqs: faqs(h.faqs),
        cityId: h.cityId,
        guideSlug: await guideSlugForCity(this.prisma, h.cityId, h.city, h.country),
      },
      stay,
      rooms,
      rates: offers.map(strip),
      nearby: await this.nearby(h, centers),
      reviews: null,
      providers: statuses,
    };
  }

  /** Nearby places from the imported geo data: city center, airports with scheduled service, other towns. */
  private async nearby(h: Hotel, centers: Map<number, { lat: number; lng: number }>): Promise<HotelNearbyPlace[]> {
    if (h.lat === null || h.lon === null) return [];
    const lat = h.lat;
    const lon = h.lon;
    const out: HotelNearbyPlace[] = [];
    const center = h.cityId !== null ? centers.get(h.cityId) : undefined;
    if (center) out.push({ name: `${h.city} center`, kind: "center", distanceKm: Math.round(haversineKm(lat, lon, center.lat, center.lng) * 10) / 10, iata: null });
    const box = (km: number) => ({ lat: { gte: lat - km / 110.574, lte: lat + km / 110.574 }, lon: { gte: lon - km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))), lte: lon + km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))) } });
    const airports = await this.prisma.airport.findMany({ where: { scheduledService: true, ...box(60) }, select: { iata: true, name: true, lat: true, lon: true }, take: 40 });
    out.push(
      ...airports
        .flatMap((a) => (a.lat !== null && a.lon !== null ? [{ name: a.name, kind: "airport" as const, distanceKm: Math.round(haversineKm(lat, lon, a.lat, a.lon) * 10) / 10, iata: a.iata }] : []))
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 3),
    );
    const b = box(25);
    const towns = await this.prisma.city.findMany({
      where: { population: { gte: 20_000 }, lat: b.lat, lng: b.lon, ...(h.cityId !== null ? { geonameId: { not: h.cityId } } : {}) },
      select: { name: true, lat: true, lng: true },
      orderBy: { population: "desc" },
      take: 20,
    });
    out.push(
      ...towns
        .map((t) => ({ name: t.name, kind: "city" as const, distanceKm: Math.round(haversineKm(lat, lon, t.lat, t.lng) * 10) / 10, iata: null }))
        .filter((t) => fold(t.name) !== fold(h.city))
        .sort((a, b2) => a.distanceKm - b2.distanceKm)
        .slice(0, 4),
    );
    return out;
  }
}
