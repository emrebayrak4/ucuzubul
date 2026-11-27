import { Controller, Get, Inject, Logger, type OnApplicationBootstrap, Query } from "@nestjs/common";
import type { AirportSearchResponse, PlacesResponse } from "@pricora/contracts";
import type { Meilisearch } from "meilisearch";
import { MEILI, PRISMA, type PrismaClient } from "../common/infra";
import { expectedPlaceCount, groupCityAirports, PLACES_INDEX, reindexPlaces, searchPlacesPg, toPlace, type PlaceDoc } from "../core/places";
import { input } from "../common/validate";

@Controller("travel")
export class TravelController implements OnApplicationBootstrap {
  private readonly log = new Logger("Travel");
  private placesIndexing: Promise<void> | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(MEILI) private readonly meili: Meilisearch,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env["NODE_ENV"] === "test") return;
    void this.ensurePlacesIndex();
  }

  /** (Re)builds the Meilisearch places index when its size differs from the DB (e.g. after geo:import). */
  ensurePlacesIndex(force = false): Promise<void> {
    if (!this.placesIndexing) {
      this.placesIndexing = (async () => {
        try {
          const expected = await expectedPlaceCount(this.prisma);
          const index = this.meili.index(PLACES_INDEX);
          const stats = await index.getStats().catch(() => null);
          const settings = stats ? await index.getSettings().catch(() => null) : null;
          const current = Boolean(settings?.searchableAttributes?.includes("cityName"));
          if (!force && stats && stats.numberOfDocuments === expected && current) return;
          const n = await reindexPlaces(this.prisma, this.meili);
          this.log.log(`Indexed ${n} places into Meilisearch`);
        } catch (err) {
          this.log.warn(`Places indexing skipped: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          this.placesIndexing = null;
        }
      })();
    }
    return this.placesIndexing;
  }

  @Get("places")
  async places(@Query() query: unknown): Promise<PlacesResponse> {
    const q = input("travel.places", "query", query);
    try {
      const index = this.meili.index<PlaceDoc>(PLACES_INDEX);
      const stats = await index.getStats();
      if (stats.numberOfDocuments === 0) throw new Error("places index empty");
      const filter = q.types.length < 3 ? [`type IN [${q.types.map((t) => `"${t}"`).join(", ")}]`] : undefined;
      const res = await index.search(q.q, { limit: Math.min(60, q.limit * 3), ...(filter ? { filter } : {}) });
      const upper = q.q.trim().toUpperCase();
      // Exact IATA / city-code hits first (e.g. "ist", "JFK"), then each city followed by its airports.
      const exact = [...res.hits].sort((a, b) => Number(b.iata === upper || b.cityCode === upper) - Number(a.iata === upper || a.cityCode === upper));
      return { items: groupCityAirports(exact, q.limit).map(toPlace), degraded: false };
    } catch (err) {
      if (!(err instanceof Error && err.message === "places index empty")) this.log.warn(`places: Meilisearch unavailable, Postgres fallback (${err instanceof Error ? err.message : String(err)})`);
      else void this.ensurePlacesIndex();
      return { items: await searchPlacesPg(this.prisma, q.q, q.types, q.limit), degraded: true };
    }
  }

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
}
