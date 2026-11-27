/**
 * Flight fare source: live providers (Duffel / Travelpayouts / Amadeus) when configured, otherwise the labeled
 * demo engine. Demo is switched off automatically on every route as soon as any live flight provider is configured.
 * Shared by the API controller and the worker (fare alerts).
 */
import type {
  ExploreDestination,
  FlightCalendarQuery,
  FlightCalendarResponse,
  FlightExploreQuery,
  FlightExploreResponse,
  FlightOffer,
  FlightSearchQuery,
  FlightSearchResponse,
  ProviderStatus,
} from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";
import { createFlightProviders, type AdapterOptions, type FlightProvider } from "@pricora/retailer-adapters";
import { expandIataCode } from "../places";
import { cheapestByGroup, generateSlices, MAX_ADVANCE_DAYS, ROUND_TRIP_FACTOR, type DemoSlice, type EngineContext } from "./demo-engine";
import { addDays, daysBetween, loadAirportDirectory, todayUtc, type AirportDirectory, type AirportInfo } from "./geo";
import { airlineLookup, combineMultiCity, demoOffer, mapAdapterFare, pairRoundTrips, type AirlineLookup, type Party } from "./offers";
import { BEST_RULE, refine } from "./refine";
import { EXPLORE_DESTINATIONS } from "./routes";

type Env = NonNullable<AdapterOptions["env"]>;
type Source = FlightSearchResponse["source"];

function aggregateSource(sources: string[]): Source {
  const set = new Set(sources);
  if (set.size === 0) return "none";
  if (set.size > 1) return "mixed";
  return [...set][0] as Source;
}

export const DEMO_FARES_MESSAGE = "Demo fares — not bookable. Live flight providers aren't configured yet, so these itineraries and prices are generated samples.";

export class FlightFareService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly env: () => Promise<Env>,
    /** Adapter overrides (tests inject `fetch`). */
    private readonly adapterOptions: Omit<AdapterOptions, "env"> = {},
  ) {}

  private dir(): Promise<AirportDirectory> {
    return loadAirportDirectory(this.prisma);
  }

  async providers(): Promise<{ statuses: ProviderStatus[]; live: FlightProvider[] }> {
    const statuses: ProviderStatus[] = [];
    const live: FlightProvider[] = [];
    for (const p of createFlightProviders({ ...this.adapterOptions, env: await this.env() })) {
      const s = p.status();
      if (s === "live") live.push(p);
      else statuses.push({ id: p.id, name: p.name, status: s === "error" ? "error" : "pending_configuration", ...(s === "pending_configuration" ? { message: `Missing ${p.missingEnv().join(", ")}` } : {}) });
    }
    return { statuses, live };
  }

  /** Expands a city/metro code to airports known to the directory (max 3, busiest first). */
  private async expand(code: string, dir: AirportDirectory): Promise<{ codes: string[]; airports: AirportInfo[] }> {
    const codes = await expandIataCode(this.prisma, code);
    const airports = codes
      .map((c) => dir.get(c))
      .filter((a): a is AirportInfo => Boolean(a))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3);
    return { codes, airports };
  }

  private async airlines(): Promise<AirlineLookup> {
    return airlineLookup(await this.prisma.airline.findMany({ select: { iata: true, name: true, logoUrl: true } }));
  }

  private ctx(dir: AirportDirectory): EngineContext {
    return { dir, today: todayUtc() };
  }

  /** Demo slices for every from×to airport pair. */
  private slicesFor(from: AirportInfo[], to: AirportInfo[], date: string, cabin: FlightSearchQuery["cabin"], ctx: EngineContext): DemoSlice[] {
    return from.flatMap((a) => to.flatMap((b) => generateSlices(a, b, date, cabin, ctx)));
  }

  async search(q: FlightSearchQuery): Promise<FlightSearchResponse> {
    const dir = await this.dir();
    const legsIn = q.legs ?? [{ from: q.from!, to: q.to!, date: q.depart! }, ...(q.return ? [{ from: q.to!, to: q.from!, date: q.return }] : [])];
    const tripType: "oneway" | "round" | "multi" = q.legs ? "multi" : q.return ? "round" : "oneway";
    const first = legsIn[0]!;
    const expanded = await Promise.all(legsIn.map(async (l) => ({ ...l, f: await this.expand(l.from, dir), t: await this.expand(l.to, dir) })));
    const party: Party = { adults: q.adults, children: q.children, infants: q.infants };
    const airline = await this.airlines();
    const now = new Date().toISOString();
    const { statuses, live } = await this.providers();
    const providers: ProviderStatus[] = [...statuses];
    const offers: FlightOffer[] = [];

    if (live.length > 0) {
      for (const p of live) {
        if (tripType === "multi") {
          providers.push({ id: p.id, name: p.name, status: "live", message: "Multi-city isn't supported by this provider yet — search each flight one way." });
          continue;
        }
        try {
          const res = await p.searchFlights({
            origin: first.from,
            destination: first.to,
            departDate: first.date,
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
            const mapped = mapAdapterFare(o, q.cabin, q.adults, p.name, airline);
            if (mapped) offers.push(mapped);
          }
        } catch {
          providers.push({ id: p.id, name: p.name, status: "error", message: "Provider request failed" });
        }
      }
      // Stored real fare snapshots (never demo rows once a live provider exists).
      if (tripType !== "multi") {
        const dayStart = new Date(`${first.date}T00:00:00Z`);
        const fromCodes = expanded[0]!.f.codes;
        const toCodes = expanded[0]!.t.codes;
        const stored = await this.prisma.flightOffer.findMany({
          where: { fromIata: { in: fromCodes }, toIata: { in: toCodes }, departAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86_400_000) }, cabin: q.cabin, source: { not: "demo" } },
          take: 100,
        });
        for (const s of stored) {
          const slices = s.slices as unknown as FlightOffer["slices"];
          if (!Array.isArray(slices) || slices.length === 0) continue;
          offers.push({
            id: s.id,
            provider: { id: s.provider, name: s.provider },
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
            providerCount: 1,
            bookable: true,
          });
        }
      }
    } else {
      providers.push({ id: "demo", name: "Demo fares", status: "live", message: DEMO_FARES_MESSAGE });
      const ctx = this.ctx(dir);
      const perLeg = expanded.map((l) => this.slicesFor(l.f.airports, l.t.airports, l.date, q.cabin, ctx));
      let combos: DemoSlice[][];
      if (tripType === "oneway") combos = (perLeg[0] ?? []).map((s) => [s]);
      else if (tripType === "round") combos = pairRoundTrips(perLeg[0] ?? [], perLeg[1] ?? []);
      else combos = perLeg.some((l) => l.length === 0) ? [] : combineMultiCity(perLeg);
      const built: FlightOffer[] = [];
      for (const c of combos) {
        const o = demoOffer(c, tripType, q.cabin, party, airline, now);
        if (o) built.push(o);
      }
      // Metro-to-metro searches can produce hundreds of itineraries; keep the most sensible 180.
      const sensible = (o: FlightOffer) => o.pricePerAdultCents / 100 + o.slices.reduce((n, s) => n + s.durationMinutes, 0) * 0.9;
      if (built.length > 180) {
        const cheapest = [...built].sort((x, y) => x.pricePerAdultCents - y.pricePerAdultCents).slice(0, 30);
        const rest = built.filter((o) => !cheapest.includes(o)).sort((x, y) => sensible(x) - sensible(y)).slice(0, 150);
        offers.push(...cheapest, ...rest);
      } else offers.push(...built);
    }

    const filters = { ...q, stops: q.stops ?? (q.maxStops !== undefined ? [0, 1, 2].filter((n) => n <= q.maxStops!) : undefined) };
    const info = (code: string) => {
      const a = dir.get(code);
      return a ? { name: a.name, city: a.city } : undefined;
    };
    const r = refine(offers, filters, q.sort, q.limit, party, info);
    const codes = new Set(offers.flatMap((o) => o.slices.flatMap((s) => s.segments.flatMap((g) => [g.from, g.to]))));
    const airports: NonNullable<FlightSearchResponse["airports"]> = {};
    for (const c of codes) {
      const a = dir.get(c);
      if (a) airports[c] = { name: a.name, city: a.city, country: a.countryName };
    }
    return {
      offers: r.offers,
      providers,
      source: aggregateSource(r.offers.map((o) => o.source)),
      query: {
        from: first.from,
        to: tripType === "multi" ? legsIn[legsIn.length - 1]!.to : first.to,
        fromAirports: expanded[0]!.f.codes,
        toAirports: expanded[0]!.t.codes,
        depart: first.date,
        return: q.return ?? null,
        adults: q.adults,
        cabin: q.cabin,
        legs: legsIn,
        tripType,
      },
      airlines: r.facets.airlines.map((a) => airline(a.iata)),
      searchedAt: now,
      total: r.total,
      totalUnfiltered: offers.length,
      facets: r.facets,
      sortSummary: r.sortSummary,
      bestRule: BEST_RULE,
      airports,
    };
  }

  /** Cheapest per-adult demo price for a one-way or round trip (null = no itinerary). */
  private cheapest(from: AirportInfo[], to: AirportInfo[], depart: string, ret: string | null, cabin: FlightSearchQuery["cabin"], ctx: EngineContext): number | null {
    const out = cheapestByGroup(this.slicesFor(from, to, depart, cabin, ctx));
    if (!ret) return out.size ? Math.min(...out.values()) : null;
    if (ret < depart) return null;
    const back = cheapestByGroup(this.slicesFor(to, from, ret, cabin, ctx));
    let best: number | null = null;
    for (const [g, p] of out) {
      const r = back.get(g);
      if (r === undefined) continue;
      const v = Math.round(((p + r) * ROUND_TRIP_FACTOR) / 100) * 100;
      if (best === null || v < best) best = v;
    }
    return best;
  }

  async calendar(q: FlightCalendarQuery): Promise<FlightCalendarResponse> {
    const tripType: FlightCalendarResponse["tripType"] = q.return ? "round" : "oneway";
    const { live } = await this.providers();
    if (live.length > 0) {
      return { tripType, source: "none", message: "Flexible-date prices aren't available from the connected providers yet.", currency: "USD", trend: [], ...(q.return ? { grid: [] } : { days: [] }) };
    }
    const dir = await this.dir();
    const ctx = this.ctx(dir);
    const [f, t] = await Promise.all([this.expand(q.from, dir), this.expand(q.to, dir)]);
    const len = q.return ? daysBetween(q.depart, q.return) : 0;
    const price = (d: string, r: string | null) => this.cheapest(f.airports, t.airports, d, r, q.cabin, ctx);
    const trend = Array.from({ length: 43 }, (_, i) => {
      const d = addDays(q.depart, i - 21);
      return { date: d, minPriceCents: price(d, q.return ? addDays(d, len) : null) };
    });
    const base = { tripType, source: "demo" as const, message: "Demo fares — prices are generated samples, not live quotes.", currency: "USD", trend };
    if (q.return) {
      const grid: NonNullable<FlightCalendarResponse["grid"]> = [];
      for (let i = -3; i <= 3; i++)
        for (let j = -3; j <= 3; j++) {
          const d = addDays(q.depart, i);
          const r = addDays(q.return, j);
          grid.push({ depart: d, return: r, minPriceCents: r >= d ? price(d, r) : null });
        }
      return { ...base, grid };
    }
    const month = q.month ?? q.depart.slice(0, 7);
    const startDate = `${month}-01`;
    const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const d = addDays(startDate, i);
      return { date: d, minPriceCents: price(d, null) };
    });
    return { ...base, days };
  }

  async explore(q: FlightExploreQuery): Promise<FlightExploreResponse> {
    const dir = await this.dir();
    const ctx = this.ctx(dir);
    const today = ctx.today;
    const depart = q.depart ?? (() => {
      // ~5 weeks out, on a Tuesday (typically cheap).
      let d = addDays(today, 35);
      while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
      return d;
    })();
    const ret = q.tripLength > 0 ? addDays(depart, q.tripLength) : null;
    const f = await this.expand(q.from, dir);
    const origin = f.airports[0];
    const originOut = { code: q.from, city: origin?.city ?? q.from, countryIso2: origin?.country ?? "US" };
    const { live } = await this.providers();
    if (live.length > 0 || !origin) {
      return {
        origin: originOut,
        source: "none",
        message: !origin ? "Unknown origin airport." : "Explore isn't available from the connected providers yet — search a specific route instead.",
        depart,
        return: ret,
        destinations: [],
        countries: [],
      };
    }
    const fromAirports = f.airports.slice(0, 2);
    const seenMetro = new Set<string>();
    const destinations: ExploreDestination[] = [];
    for (const code of EXPLORE_DESTINATIONS) {
      const dest = dir.get(code);
      if (!dest || fromAirports.some((a) => a.iata === dest.iata || (a.metro && a.metro === dest.metro))) continue;
      if (q.country && dest.country !== q.country) continue;
      const metroKey = dest.metro ?? dest.iata;
      if (seenMetro.has(metroKey)) continue;
      const slices = fromAirports.flatMap((a) => generateSlices(a, dest, depart, "economy", ctx));
      const pool = q.direct ? slices.filter((s) => s.segments.length === 1) : slices;
      if (pool.length === 0) continue;
      const price = this.cheapest(fromAirports, [dest], depart, ret, "economy", ctx);
      if (price === null) continue;
      if (q.direct && ret && generateSlices(dest, fromAirports[0]!, ret, "economy", ctx).every((s) => s.segments.length > 1)) continue;
      if (q.maxPrice !== undefined && price > q.maxPrice * 100) continue;
      seenMetro.add(metroKey);
      const fastest = pool.reduce((m, s) => (s.durationMinutes < m.durationMinutes ? s : m));
      destinations.push({
        code: dest.metro && dir.metroSiblings(dest.iata).length > 1 ? dest.metro : dest.iata,
        airport: dest.iata,
        city: dest.city,
        countryIso2: dest.country,
        countryName: dest.countryName,
        lat: dest.lat,
        lng: dest.lon,
        minPriceCents: price,
        direct: slices.some((s) => s.segments.length === 1),
        durationMinutes: fastest.durationMinutes,
        depart,
        return: ret,
        source: "demo",
      });
    }
    destinations.sort((a, b) => a.minPriceCents - b.minPriceCents);
    const countries = new Map<string, { iso2: string; name: string; minPriceCents: number; count: number }>();
    for (const d of destinations) {
      const c = countries.get(d.countryIso2) ?? { iso2: d.countryIso2, name: d.countryName, minPriceCents: d.minPriceCents, count: 0 };
      c.count++;
      c.minPriceCents = Math.min(c.minPriceCents, d.minPriceCents);
      countries.set(d.countryIso2, c);
    }
    return {
      origin: originOut,
      source: destinations.length ? "demo" : "none",
      message: "Demo fares — prices are generated samples, not live quotes.",
      depart,
      return: ret,
      destinations: destinations.slice(0, q.limit),
      countries: [...countries.values()].sort((a, b) => a.minPriceCents - b.minPriceCents),
    };
  }

  /**
   * Current cheapest per-adult fare for an alert route, from the same fare source as search
   * (live providers when configured, demo otherwise). Null when nothing is available.
   */
  async cheapestForAlert(from: string, to: string, depart: string, ret: string | null): Promise<{ priceCents: number; source: "demo" | "live" } | null> {
    const today = todayUtc();
    if (depart < today || daysBetween(today, depart) > MAX_ADVANCE_DAYS) return null;
    const { live } = await this.providers();
    if (live.length > 0) {
      const res = await this.search({ from, to, depart, ...(ret ? { return: ret } : {}), adults: 1, children: 0, infants: 0, cabin: "economy", sort: "cheapest", limit: 1, hideSelfTransfer: false });
      const o = res.offers[0];
      return o && o.source !== "demo" ? { priceCents: o.pricePerAdultCents, source: "live" } : null;
    }
    const dir = await this.dir();
    const ctx = this.ctx(dir);
    const [f, t] = await Promise.all([this.expand(from, dir), this.expand(to, dir)]);
    const p = this.cheapest(f.airports, t.airports, depart, ret, "economy", ctx);
    return p === null ? null : { priceCents: p, source: "demo" };
  }
}
