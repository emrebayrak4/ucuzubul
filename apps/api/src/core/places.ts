/**
 * Places (airports, cities, countries) for travel autocomplete: Meilisearch index `places` with a Postgres
 * (pg_trgm + unaccent) fallback. Data: OurAirports (public domain) + GeoNames (CC BY 4.0).
 */
import type { Place, PlaceType } from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";
import type { Meilisearch } from "meilisearch";

export const PLACES_INDEX = "places";

export interface PlaceDoc extends Place {
  asciiName: string;
  /** For airports: the served city (and metro city) name, so "paris" finds CDG/ORY. */
  cityName: string | null;
  alternateNames: string[];
  admin1: string | null;
  rank: number;
}

const PLACE_SETTINGS = {
  searchableAttributes: ["iata", "cityCode", "name", "cityName", "asciiName", "alternateNames", "admin1", "countryName"],
  filterableAttributes: ["type", "countryIso2"],
  sortableAttributes: ["rank"],
  // rank before attribute: important places (metro cities, hub airports, big cities) outrank incidental name matches.
  rankingRules: ["words", "typo", "proximity", "rank:desc", "attribute", "exactness"],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 }, disableOnAttributes: ["iata", "cityCode"] },
};

const strip = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

const AIRPORT_RANK = { large: 900, medium: 700, small: 400 } as const;

/** Hub heuristic: type + scheduled service + curated searchRank + primary airport of a metro area. */
export function airportRank(a: { iata: string; type: "large" | "medium" | "small" | null; scheduledService: boolean; searchRank: number; metroCode: string | null }): number {
  const primaryMetro = a.metroCode !== null && METRO_PRIMARY.has(a.iata);
  return (a.type ? AIRPORT_RANK[a.type] : 400) + (a.scheduledService ? 100 : 0) + a.searchRank + (primaryMetro ? 60 : 0);
}

/** First-listed (main hub) airport of each metro area. */
const METRO_PRIMARY = new Set(["JFK", "ORD", "IAD", "DTW", "IAH", "DFW", "YYZ", "YUL", "LHR", "CDG", "MXP", "FCO", "SVO", "ARN", "OSL", "IST", "OTP", "KEF", "HND", "KIX", "ICN", "PEK", "PVG", "BKK", "CGK", "DXB", "GRU", "GIG", "EZE"]);

/**
 * Puts each city right before its airports (hub first): "paris" → Paris (Any airport) → CDG → ORY.
 * Airports whose city is not among the hits keep their position.
 */
export function groupCityAirports(hits: PlaceDoc[], limit: number): PlaceDoc[] {
  const out: PlaceDoc[] = [];
  const used = new Set<string>();
  const airportsOf = (city: PlaceDoc) =>
    hits.filter((h) => h.type === "airport" && h.iata && city.airports.includes(h.iata) && !used.has(h.id)).sort((a, b) => b.rank - a.rank);
  const parentOf = (ap: PlaceDoc) => hits.find((h) => h.type === "city" && ap.iata && h.airports.includes(ap.iata) && !used.has(h.id));
  const emitCity = (city: PlaceDoc) => {
    used.add(city.id);
    out.push(city);
    for (const ap of airportsOf(city)) {
      used.add(ap.id);
      out.push(ap);
    }
  };
  for (const h of hits) {
    if (used.has(h.id)) continue;
    if (h.type === "city") emitCity(h);
    else if (h.type === "airport") {
      const parent = parentOf(h);
      if (parent) emitCity(parent);
      else {
        used.add(h.id);
        out.push(h);
      }
    } else {
      used.add(h.id);
      out.push(h);
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Builds every place document from the DB (≈ 76k docs with cities5000). */
export async function buildPlaceDocs(prisma: PrismaClient): Promise<PlaceDoc[]> {
  const [countries, cities, airports] = await Promise.all([
    prisma.country.findMany(),
    prisma.city.findMany(),
    prisma.airport.findMany(),
  ]);
  const countryName = new Map(countries.map((c) => [c.iso2, c.name]));
  const airportsByCity = new Map<number, string[]>();
  const airportsByMetro = new Map<string, string[]>();
  const cityById = new Map(cities.map((c) => [c.geonameId, c]));
  const metroCityName = new Map(cities.filter((c) => c.iataCityCode).map((c) => [c.iataCityCode as string, c.name]));
  for (const a of airports) {
    if (a.cityId && a.scheduledService) {
      let arr = airportsByCity.get(a.cityId);
      if (!arr) airportsByCity.set(a.cityId, (arr = []));
      arr.push(a.iata);
    }
    if (a.metroCode) {
      let arr = airportsByMetro.get(a.metroCode);
      if (!arr) airportsByMetro.set(a.metroCode, (arr = []));
      arr.push(a.iata);
    }
  }
  const docs: PlaceDoc[] = [];
  for (const c of countries) {
    docs.push({
      id: `country_${c.iso2}`,
      type: "country",
      name: `${c.name} — anywhere`,
      subtitle: "Country",
      iata: null,
      cityCode: null,
      airports: [],
      countryIso2: c.iso2,
      countryName: c.name,
      lat: null,
      lng: null,
      asciiName: strip(c.name),
      cityName: null,
      alternateNames: c.iso3 ? [c.iso3] : [],
      admin1: null,
      rank: 800 + Math.round(Math.log10(Number(c.population ?? 1) + 1) * 10),
    });
  }
  for (const c of cities) {
    const metroAirports = c.iataCityCode ? (airportsByMetro.get(c.iataCityCode) ?? []) : [];
    const own = airportsByCity.get(c.geonameId) ?? [];
    const airportsFor = [...new Set([...metroAirports, ...own])];
    const country = countryName.get(c.countryIso2) ?? c.countryIso2;
    const isMetro = metroAirports.length > 1;
    docs.push({
      id: `city_${c.geonameId}`,
      type: "city",
      name: isMetro ? `${c.name} (Any airport)` : c.name,
      subtitle: [c.admin1Name && c.admin1Name !== c.name ? c.admin1Name : null, country].filter(Boolean).join(", "),
      iata: null,
      cityCode: c.iataCityCode,
      airports: airportsFor,
      countryIso2: c.countryIso2,
      countryName: country,
      lat: c.lat,
      lng: c.lng,
      asciiName: c.asciiName,
      cityName: null,
      alternateNames: c.alternateNames,
      admin1: c.admin1Name,
      rank: (isMetro ? 1500 : 200) + Math.round(Math.log10(c.population + 1) * 50) + (airportsFor.length ? 150 : 0),
    });
  }
  for (const a of airports) {
    const country = countryName.get(a.country) ?? a.country;
    docs.push({
      id: `airport_${a.iata}`,
      type: "airport",
      name: a.name,
      subtitle: [a.city || null, country].filter(Boolean).join(", "),
      iata: a.iata,
      cityCode: a.metroCode,
      airports: [a.iata],
      countryIso2: a.country,
      countryName: country,
      lat: a.lat,
      lng: a.lon,
      asciiName: strip(a.name),
      cityName: [...new Set([a.city, a.cityId ? cityById.get(a.cityId)?.name : undefined, a.metroCode ? metroCityName.get(a.metroCode) : undefined].filter((x): x is string => Boolean(x)))].join(" / ") || null,
      alternateNames: [a.icao ?? ""].filter(Boolean),
      admin1: a.region,
      rank: airportRank(a),
    });
  }
  return docs;
}

export async function reindexPlaces(prisma: PrismaClient, meili: Meilisearch): Promise<number> {
  const docs = await buildPlaceDocs(prisma);
  await meili.createIndex(PLACES_INDEX, { primaryKey: "id" }).waitTask().catch(() => undefined);
  const index = meili.index<PlaceDoc>(PLACES_INDEX);
  await index.updateSettings(PLACE_SETTINGS).waitTask();
  await index.deleteAllDocuments().waitTask();
  for (let i = 0; i < docs.length; i += 10_000) {
    await index.addDocuments(docs.slice(i, i + 10_000), { primaryKey: "id" }).waitTask({ timeout: 120_000 });
  }
  return docs.length;
}

export async function expectedPlaceCount(prisma: PrismaClient): Promise<number> {
  const [a, c, k] = await Promise.all([prisma.airport.count(), prisma.city.count(), prisma.country.count()]);
  return a + c + k;
}

export const toPlace = (d: PlaceDoc): Place => ({
  id: d.id,
  type: d.type,
  name: d.name,
  subtitle: d.subtitle,
  iata: d.iata,
  cityCode: d.cityCode,
  airports: d.airports,
  countryIso2: d.countryIso2,
  countryName: d.countryName,
  lat: d.lat,
  lng: d.lng,
});

/** Postgres fallback: IATA exact, accent-insensitive prefix/word matches and trigram similarity. */
export async function searchPlacesPg(prisma: PrismaClient, q: string, types: PlaceType[], limit: number): Promise<Place[]> {
  const term = q.trim();
  const like = term.replace(/[\\%_]/g, (c) => "\\" + c);
  const upper = term.toUpperCase();
  const out: { place: Place; score: number }[] = [];
  const countries = new Map((await prisma.country.findMany({ select: { iso2: true, name: true } })).map((c) => [c.iso2, c.name]));

  if (types.includes("airport")) {
    const rows = await prisma.$queryRaw<{ iata: string; name: string; city: string; country: string; lat: number | null; lon: number | null; metroCode: string | null; type: string | null; scheduledService: boolean; searchRank: number }[]>`
      SELECT iata, name, city, country, lat, lon, "metroCode", type::text AS type, "scheduledService", "searchRank" FROM airports
      WHERE iata = ${upper} OR "metroCode" = ${upper}
         OR unaccent(name) ILIKE unaccent(${like + "%"}) OR unaccent(name) ILIKE unaccent(${"% " + like + "%"})
         OR unaccent(city) ILIKE unaccent(${like + "%"})
      ORDER BY (iata = ${upper}) DESC, "scheduledService" DESC, "searchRank" DESC LIMIT 20`;
    for (const a of rows) {
      const country = countries.get(a.country) ?? a.country;
      out.push({
        score: (a.iata === upper ? 5000 : 0) + (a.type === "large" ? 900 : a.type === "medium" ? 700 : 400) + (a.scheduledService ? 100 : 0) + a.searchRank,
        place: { id: `airport_${a.iata}`, type: "airport", name: a.name, subtitle: [a.city || null, country].filter(Boolean).join(", "), iata: a.iata, cityCode: a.metroCode, airports: [a.iata], countryIso2: a.country, countryName: country, lat: a.lat, lng: a.lon },
      });
    }
  }
  if (types.includes("city")) {
    const rows = await prisma.$queryRaw<{ geonameId: number; name: string; admin1Name: string | null; countryIso2: string; lat: number; lng: number; population: number; iataCityCode: string | null }[]>`
      SELECT "geonameId", name, "admin1Name", "countryIso2", lat, lng, population, "iataCityCode" FROM cities
      WHERE "iataCityCode" = ${upper} OR "asciiName" ILIKE unaccent(${like + "%"}) OR unaccent(name) ILIKE unaccent(${like + "%"})
         OR (length(${term}) >= 4 AND similarity("asciiName", unaccent(${term})) > 0.45)
      ORDER BY ("iataCityCode" = ${upper}) DESC NULLS LAST, population DESC LIMIT 20`;
    const ids = rows.map((r) => r.geonameId);
    const ap = ids.length ? await prisma.airport.findMany({ where: { OR: [{ cityId: { in: ids }, scheduledService: true }, { metroCode: { in: rows.map((r) => r.iataCityCode).filter((x): x is string => Boolean(x)) } }] }, select: { iata: true, cityId: true, metroCode: true } }) : [];
    for (const c of rows) {
      const metro = c.iataCityCode ? ap.filter((a) => a.metroCode === c.iataCityCode).map((a) => a.iata) : [];
      const airports = [...new Set([...metro, ...ap.filter((a) => a.cityId === c.geonameId).map((a) => a.iata)])];
      const country = countries.get(c.countryIso2) ?? c.countryIso2;
      const isMetro = metro.length > 1;
      out.push({
        score: (c.iataCityCode === upper ? 5000 : 0) + (isMetro ? 1000 : 200) + Math.round(Math.log10(c.population + 1) * 50) + (airports.length ? 150 : 0),
        place: { id: `city_${c.geonameId}`, type: "city", name: isMetro ? `${c.name} (Any airport)` : c.name, subtitle: [c.admin1Name && c.admin1Name !== c.name ? c.admin1Name : null, country].filter(Boolean).join(", "), iata: null, cityCode: c.iataCityCode, airports, countryIso2: c.countryIso2, countryName: country, lat: c.lat, lng: c.lng },
      });
    }
  }
  if (types.includes("country")) {
    const rows = await prisma.$queryRaw<{ iso2: string; name: string; population: bigint | null }[]>`
      SELECT iso2, name, population FROM countries WHERE unaccent(name) ILIKE unaccent(${like + "%"}) OR iso2 = ${upper} OR iso3 = ${upper} ORDER BY population DESC NULLS LAST LIMIT 5`;
    for (const c of rows) {
      out.push({
        score: 800 + Math.round(Math.log10(Number(c.population ?? 1) + 1) * 10),
        place: { id: `country_${c.iso2}`, type: "country", name: `${c.name} — anywhere`, subtitle: "Country", iata: null, cityCode: null, airports: [], countryIso2: c.iso2, countryName: c.name, lat: null, lng: null },
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.place);
}

/** Expands an IATA airport or city/metro code to airport codes (NYC → JFK, LGA, EWR; IST → IST, SAW). */
export async function expandIataCode(prisma: PrismaClient, code: string): Promise<string[]> {
  const c = code.toUpperCase();
  const metro = await prisma.airport.findMany({ where: { metroCode: c }, select: { iata: true }, orderBy: { searchRank: "desc" } });
  if (metro.length) return [...new Set(metro.map((a) => a.iata))];
  const city = await prisma.city.findFirst({ where: { iataCityCode: c }, select: { geonameId: true } });
  if (city) {
    const own = await prisma.airport.findMany({ where: { cityId: city.geonameId, scheduledService: true }, select: { iata: true } });
    if (own.length) return own.map((a) => a.iata);
  }
  return [c];
}

/** Resolves a placeId to a point (and name) for hotel search. */
export async function resolvePlacePoint(prisma: PrismaClient, placeId: string): Promise<{ name: string; lat: number | null; lng: number | null; countryIso2: string; kind: "city" | "airport" | "country" } | null> {
  const [kind, raw] = placeId.split("_", 2) as [string, string];
  if (kind === "city") {
    const c = await prisma.city.findUnique({ where: { geonameId: Number(raw) } });
    return c ? { name: c.name, lat: c.lat, lng: c.lng, countryIso2: c.countryIso2, kind: "city" } : null;
  }
  if (kind === "airport") {
    const a = await prisma.airport.findUnique({ where: { iata: raw.toUpperCase() } });
    return a ? { name: a.city || a.name, lat: a.lat, lng: a.lon, countryIso2: a.country, kind: "airport" } : null;
  }
  if (kind === "country") {
    const c = await prisma.country.findUnique({ where: { iso2: raw.toUpperCase() } });
    return c ? { name: c.name, lat: null, lng: null, countryIso2: c.iso2, kind: "country" } : null;
  }
  return null;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
