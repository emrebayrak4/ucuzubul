import { Controller, Get, Inject, Logger, Param, Query } from "@nestjs/common";
import type {
  Airline,
  AirportSearchResponse,
  FlightOffer,
  FlightSearchResponse,
  HotelDetailResponse,
  HotelRate,
  HotelSearchResponse,
  HotelSummary,
  ProviderStatus,
} from "@pricora/contracts";
import type { Hotel, HotelRate as HotelRateRow } from "@pricora/database";
import { createFlightProviders, createHotelProviders, type FlightOffer as AdapterFlightOffer } from "@pricora/retailer-adapters";
import { notFound } from "../common/errors";
import { INTEGRATIONS, PRISMA, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";
import { input } from "../common/validate";

const DAY_MS = 86_400_000;
const nightsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type Source = FlightSearchResponse["source"];
function aggregateSource(sources: string[]): Source {
  const set = new Set(sources);
  if (set.size === 0) return "none";
  if (set.size > 1) return "mixed";
  return [...set][0] as Source;
}

@Controller("travel")
export class TravelController {
  private readonly log = new Logger("Travel");

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  @Get("airports")
  async airports(@Query() query: unknown): Promise<AirportSearchResponse> {
    const { q } = input("travel.airports", "query", query);
    const term = q.trim();
    const rows = await this.prisma.airport.findMany({
      where: {
        OR: [
          { iata: { equals: term.toUpperCase() } },
          { city: { contains: term, mode: "insensitive" } },
          { name: { contains: term, mode: "insensitive" } },
          ...(term.length >= 2 ? [{ iata: { startsWith: term.toUpperCase() } }] : []),
        ],
      },
      orderBy: { searchRank: "desc" },
      take: 20,
    });
    const exact = term.toUpperCase();
    rows.sort((a, b) => Number(b.iata === exact) - Number(a.iata === exact) || b.searchRank - a.searchRank);
    return {
      items: rows.slice(0, 10).map((a) => ({
        iata: a.iata,
        name: a.name,
        city: a.city,
        region: a.region,
        country: a.country,
        lat: a.lat,
        lon: a.lon,
        timezone: a.timezone,
      })),
    };
  }

  @Get("flights/search")
  async flights(@Query() query: unknown): Promise<FlightSearchResponse> {
    const q = input("travel.flights", "query", query);
    const airlines = await this.prisma.airline.findMany();
    const airlineByCode = new Map(airlines.map((a) => [a.iata, a]));
    const toAirline = (code: string | null | undefined, name?: string | null): Airline => {
      const c = (code ?? "").toUpperCase();
      const a = airlineByCode.get(c);
      return { iata: /^[A-Z0-9]{2}$/.test(c) ? c : "XX", name: a?.name ?? name ?? c ?? "Unknown airline", logoUrl: a?.logoUrl ?? null };
    };

    const providers: ProviderStatus[] = [];
    const offers: FlightOffer[] = [];
    for (const p of createFlightProviders({ env: await this.integrations.env() })) {
      const status = p.status();
      if (status !== "live") {
        providers.push({ id: p.id, name: p.name, status: status === "error" ? "error" : "pending_configuration", message: status === "pending_configuration" ? `Missing ${p.missingEnv().join(", ")}` : undefined });
        continue;
      }
      try {
        const res = await p.searchFlights({
          origin: q.from,
          destination: q.to,
          departDate: q.depart,
          returnDate: q.return ?? null,
          adults: q.adults,
          children: q.children,
          infants: q.infants,
          cabin: q.cabin,
          currency: "USD",
          ...(q.maxStops !== undefined ? { maxConnections: q.maxStops } : {}),
        });
        providers.push({ id: p.id, name: p.name, status: "live" });
        for (const o of res.data) {
          const mapped = this.mapAdapterFare(o, q.cabin, q.adults, p.name, toAirline);
          if (mapped) offers.push(mapped);
        }
      } catch (err) {
        this.log.warn(`Flight provider ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`);
        providers.push({ id: p.id, name: p.name, status: "error", message: "Provider request failed" });
      }
    }

    // Stored fare snapshots (only real provider rows or explicitly seeded demo rows; never generated here).
    const dayStart = new Date(`${q.depart}T00:00:00Z`);
    const stored = await this.prisma.flightOffer.findMany({
      where: { fromIata: q.from, toIata: q.to, departAt: { gte: dayStart, lt: new Date(dayStart.getTime() + DAY_MS) }, cabin: q.cabin },
      take: 100,
    });
    for (const s of stored) {
      const slices = s.slices as unknown as FlightOffer["slices"];
      if (!Array.isArray(slices) || slices.length === 0) continue;
      offers.push({
        id: s.id,
        provider: { id: s.provider, name: s.provider === "demo" ? "Demo data" : s.provider },
        totalPriceCents: s.totalPriceCents,
        currency: s.currency,
        pricePerAdultCents: Math.round(s.totalPriceCents / Math.max(1, s.adults)),
        cabin: s.cabin,
        slices,
        baggage: null,
        refundable: null,
        goUrl: `/v1/travel/go/flight/${s.id}`,
        source: s.source,
        expiresAt: s.expiresAt?.toISOString() ?? null,
        fetchedAt: s.fetchedAt.toISOString(),
      });
    }

    const filtered = q.maxStops === undefined ? offers : offers.filter((o) => o.slices.every((s) => s.stops <= (q.maxStops ?? 9)));
    const duration = (o: FlightOffer) => o.slices.reduce((n, s) => n + s.durationMinutes, 0);
    const sorters = {
      cheapest: (a: FlightOffer, b: FlightOffer) => a.totalPriceCents - b.totalPriceCents,
      fastest: (a: FlightOffer, b: FlightOffer) => duration(a) - duration(b),
      best: (a: FlightOffer, b: FlightOffer) => a.totalPriceCents / 100 + duration(a) * 0.5 - (b.totalPriceCents / 100 + duration(b) * 0.5),
    };
    filtered.sort(sorters[q.sort]);
    const usedCodes = new Set(filtered.flatMap((o) => o.slices.flatMap((s) => s.segments.map((g) => g.marketingCarrier.iata))));
    return {
      offers: filtered,
      providers,
      source: aggregateSource(filtered.map((o) => o.source)),
      query: { from: q.from, to: q.to, depart: q.depart, return: q.return ?? null, adults: q.adults, cabin: q.cabin },
      airlines: [...usedCodes].map((c) => toAirline(c)),
      searchedAt: new Date().toISOString(),
    };
  }

  private mapAdapterFare(
    o: AdapterFlightOffer,
    cabin: FlightOffer["cabin"],
    adults: number,
    providerName: string,
    toAirline: (code: string | null | undefined, name?: string | null) => Airline,
  ): FlightOffer | null {
    const slices: FlightOffer["slices"] = [];
    for (const s of o.slices) {
      const segments = s.segments.map((g) => {
        const dur = g.durationMinutes ?? Math.max(1, Math.round((Date.parse(g.arriveAt) - Date.parse(g.departAt)) / 60_000));
        return {
          marketingCarrier: toAirline(g.marketingCarrier),
          operatingCarrier: g.operatingCarrier ? toAirline(g.operatingCarrier, g.operatingCarrierName) : null,
          flightNumber: `${g.marketingCarrier ?? ""}${g.marketingFlightNumber ?? ""}`,
          from: g.origin,
          to: g.destination,
          departAt: g.departAt,
          arriveAt: g.arriveAt,
          durationMinutes: dur,
          aircraft: null,
        };
      });
      if (segments.length === 0) return null;
      const arriveAt = s.arriveAt ?? segments[segments.length - 1]?.arriveAt ?? s.departAt;
      slices.push({
        from: s.origin,
        to: s.destination,
        departAt: s.departAt,
        arriveAt,
        durationMinutes: s.durationMinutes ?? Math.max(1, Math.round((Date.parse(arriveAt) - Date.parse(s.departAt)) / 60_000)),
        stops: s.stops,
        segments,
      });
    }
    if (slices.length === 0 || slices.length > 2) return null;
    return {
      id: o.id,
      provider: { id: o.provider, name: providerName },
      totalPriceCents: o.totalCents,
      currency: o.currency,
      pricePerAdultCents: Math.round(o.totalCents / Math.max(1, adults)),
      cabin,
      slices,
      baggage: null,
      refundable: null,
      goUrl: o.deepLink ?? "",
      source: o.source,
      expiresAt: o.expiresAt,
      fetchedAt: o.fetchedAt,
    };
  }

  private async hotelProviders(): Promise<ProviderStatus[]> {
    return createHotelProviders({ env: await this.integrations.env() }).map((p) => {
      const s = p.status();
      return {
        id: p.id,
        name: p.name,
        status: s === "live" ? "live" : s === "error" ? "error" : "pending_configuration",
        ...(s === "pending_configuration" ? { message: `Missing ${p.missingEnv().join(", ")}` } : {}),
      };
    });
  }

  /** Rates for the requested stay: exact stored rates if present, otherwise the hotel's stored demo room rates re-priced for the stay length (still source=demo). */
  private ratesFor(hotel: Hotel & { rates: HotelRateRow[] }, checkin: string, checkout: string, rooms: number): HotelRate[] {
    const nights = nightsBetween(checkin, checkout);
    const exact = hotel.rates.filter((r) => isoDate(r.checkin) === checkin && isoDate(r.checkout) === checkout);
    if (exact.length > 0) return exact.map((r) => this.toRate(r, r.nightlyPriceCents, r.totalPriceCents, r.taxesAndFeesCents));
    const byRoom = new Map<string, HotelRateRow>();
    for (const r of hotel.rates) {
      const cur = byRoom.get(r.roomName);
      if (!cur || r.nightlyPriceCents < cur.nightlyPriceCents) byRoom.set(r.roomName, r);
    }
    return [...byRoom.values()]
      .filter((r) => r.source === "demo")
      .map((r) => {
        const subtotal = r.nightlyPriceCents * nights * rooms;
        const taxes = Math.round(subtotal * 0.15);
        return this.toRate(r, r.nightlyPriceCents, subtotal + taxes, taxes, `${r.id}`);
      });
  }

  private toRate(r: HotelRateRow, nightly: number, total: number, taxes: number | null, id = r.id): HotelRate {
    return {
      id,
      provider: { id: r.provider, name: r.provider === "demo" ? "Demo data" : r.provider },
      roomName: r.roomName,
      boardType: r.boardType,
      refundable: r.refundable,
      nightlyPriceCents: nightly,
      totalPriceCents: total,
      taxesAndFeesCents: taxes,
      currency: r.currency,
      goUrl: `/v1/travel/go/hotel/${r.id}`,
      source: r.source,
      fetchedAt: r.fetchedAt.toISOString(),
    };
  }

  private toSummary(h: Hotel, rates: HotelRate[]): HotelSummary {
    const lowest = rates.reduce<HotelRate | null>((m, r) => (m === null || r.totalPriceCents < m.totalPriceCents ? r : m), null);
    return {
      id: h.id,
      name: h.name,
      stars: h.starRating,
      address: h.address,
      city: h.city,
      region: h.region,
      country: h.country,
      lat: h.lat,
      lon: h.lon,
      imageUrl: h.imageUrl,
      amenities: h.amenities,
      lowestNightlyCents: lowest?.nightlyPriceCents ?? null,
      lowestTotalCents: lowest?.totalPriceCents ?? null,
      currency: "USD",
      source: h.source,
    };
  }

  @Get("hotels/search")
  async hotels(@Query() query: unknown): Promise<HotelSearchResponse> {
    const q = input("travel.hotels", "query", query);
    const city = q.city.split(",")[0]?.trim() ?? q.city;
    const hotels = await this.prisma.hotel.findMany({
      where: { city: { contains: city, mode: "insensitive" }, ...(q.minStars ? { starRating: { gte: q.minStars } } : {}) },
      include: { rates: true },
    });
    const amenities = q.amenities ? q.amenities.split(",").map((a) => a.trim()).filter(Boolean) : [];
    let items = hotels
      .filter((h) => amenities.every((a) => h.amenities.includes(a)))
      .map((h) => this.toSummary(h, this.ratesFor(h, q.checkin, q.checkout, q.rooms)))
      .filter((h) => q.maxPrice === undefined || (h.lowestNightlyCents !== null && h.lowestNightlyCents <= q.maxPrice));
    const sorters = {
      recommended: (a: HotelSummary, b: HotelSummary) => (b.stars ?? 0) - (a.stars ?? 0) || (a.lowestTotalCents ?? 0) - (b.lowestTotalCents ?? 0),
      price_asc: (a: HotelSummary, b: HotelSummary) => (a.lowestTotalCents ?? Infinity) - (b.lowestTotalCents ?? Infinity),
      price_desc: (a: HotelSummary, b: HotelSummary) => (b.lowestTotalCents ?? 0) - (a.lowestTotalCents ?? 0),
      stars_desc: (a: HotelSummary, b: HotelSummary) => (b.stars ?? 0) - (a.stars ?? 0),
    };
    items.sort(sorters[q.sort]);
    const total = items.length;
    items = items.slice((q.page - 1) * 24, q.page * 24);
    return {
      items,
      providers: await this.hotelProviders(),
      source: aggregateSource(items.map((i) => i.source)),
      total,
      page: q.page,
      nights: nightsBetween(q.checkin, q.checkout),
      searchedAt: new Date().toISOString(),
    };
  }

  @Get("hotels/:id")
  async hotel(@Param() params: unknown, @Query() query: unknown): Promise<HotelDetailResponse> {
    const { id } = input("travel.hotel", "params", params);
    const q = input("travel.hotel", "query", query);
    const h = await this.prisma.hotel.findUnique({ where: { id }, include: { rates: true } });
    if (!h) throw notFound("Hotel");
    const checkin = q.checkin ?? isoDate(new Date(Date.now() + 14 * DAY_MS));
    const checkout = q.checkout ?? isoDate(new Date(Date.parse(checkin) + 2 * DAY_MS));
    const rates = this.ratesFor(h, checkin, checkout, q.rooms ?? 1).sort((a, b) => a.totalPriceCents - b.totalPriceCents);
    return {
      hotel: {
        ...this.toSummary(h, rates),
        description: h.description,
        images: h.imageUrl ? [h.imageUrl] : [],
        checkinTime: h.checkinTime,
        checkoutTime: h.checkoutTime,
      },
      rates,
      providers: await this.hotelProviders(),
    };
  }
}
