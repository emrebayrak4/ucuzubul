/**
 * Airport directory (in-memory, from the imported places data), time zones and distance helpers for flights.
 */
import type { PrismaClient } from "@pricora/database";
import type { RegionId } from "./airlines";

export interface AirportInfo {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryName: string;
  region: RegionId;
  lat: number;
  lon: number;
  tz: string;
  /** 0–100 (OurAirports-derived; large ≥ 75, medium ≈ 50). */
  rank: number;
  metro: string | null;
}

export interface AirportDirectory {
  get(iata: string): AirportInfo | undefined;
  all(): AirportInfo[];
  /** Airports sharing a metro code (incl. itself). */
  metroSiblings(iata: string): AirportInfo[];
}

const ME = new Set(["AE", "QA", "SA", "BH", "KW", "OM", "JO", "IL", "LB", "IQ", "IR", "YE", "SY", "PS", "KZ", "UZ", "TM", "KG", "TJ"]);
const AS_E = new Set(["JP", "KR", "KP", "CN", "TW", "HK", "MO", "MN"]);
const AS_SE = new Set(["TH", "VN", "SG", "MY", "ID", "PH", "KH", "LA", "MM", "BN", "TL"]);
const AS_S = new Set(["IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF"]);
const EU_EXTRA = new Set(["TR", "CY", "GE", "AM", "AZ"]);
const NA_CORE = new Set(["US", "CA", "BM", "PM"]);

export function regionOf(country: string, continent: string | null): RegionId {
  if (NA_CORE.has(country)) return "NA";
  if (EU_EXTRA.has(country)) return "EU";
  if (ME.has(country)) return "ME";
  if (AS_E.has(country)) return "AS_E";
  if (AS_SE.has(country)) return "AS_SE";
  if (AS_S.has(country)) return "AS_S";
  switch (continent) {
    case "EU":
      return "EU";
    case "AF":
      return "AF";
    case "OC":
      return "OC";
    case "NA":
    case "SA":
      return "LATAM";
    default:
      return "AS_E";
  }
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

class MemoryDirectory implements AirportDirectory {
  private readonly byCode: Map<string, AirportInfo>;
  private readonly byMetro = new Map<string, AirportInfo[]>();
  constructor(private readonly list: AirportInfo[]) {
    this.byCode = new Map(list.map((a) => [a.iata, a]));
    for (const a of list) {
      if (!a.metro) continue;
      const arr = this.byMetro.get(a.metro) ?? [];
      arr.push(a);
      this.byMetro.set(a.metro, arr);
    }
  }
  get(iata: string) {
    return this.byCode.get(iata);
  }
  all() {
    return this.list;
  }
  metroSiblings(iata: string) {
    const a = this.byCode.get(iata);
    if (!a?.metro) return a ? [a] : [];
    return this.byMetro.get(a.metro) ?? [a];
  }
}

export function createDirectory(list: AirportInfo[]): AirportDirectory {
  return new MemoryDirectory(list);
}

let cached: { at: number; dir: Promise<AirportDirectory> } | null = null;
const TTL_MS = 6 * 3_600_000;

/** Loads scheduled-service airports with coordinates + time zone (≈3.2k rows), cached in memory for 6 h. */
export function loadAirportDirectory(prisma: PrismaClient): Promise<AirportDirectory> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.dir;
  const dir = (async () => {
    const [rows, countries] = await Promise.all([
      prisma.airport.findMany({
        where: { scheduledService: true, timezone: { not: null }, lat: { not: null }, lon: { not: null } },
        select: { iata: true, name: true, city: true, country: true, lat: true, lon: true, timezone: true, searchRank: true, metroCode: true, cityId: true },
      }),
      prisma.country.findMany({ select: { iso2: true, name: true, continent: true } }),
    ]);
    const cmap = new Map(countries.map((c) => [c.iso2, c]));
    // Prefer the served city's name (GeoNames) over the airport municipality ("İzmir" rather than "Gaziemir").
    const cityIds = [...new Set(rows.map((r) => r.cityId).filter((x): x is number => x !== null))];
    const cityNames = new Map((await prisma.city.findMany({ where: { geonameId: { in: cityIds } }, select: { geonameId: true, name: true } })).map((c) => [c.geonameId, c.name]));
    const metroCodes = [...new Set(rows.map((r) => r.metroCode).filter((x): x is string => Boolean(x)))];
    const metroNames = new Map((await prisma.city.findMany({ where: { iataCityCode: { in: metroCodes } }, select: { iataCityCode: true, name: true, population: true }, orderBy: { population: "desc" } })).reverse().map((c) => [c.iataCityCode, c.name]));
    const list: AirportInfo[] = [];
    for (const r of rows) {
      if (r.lat === null || r.lon === null || !r.timezone || !/^[A-Z]{3}$/.test(r.iata)) continue;
      const c = cmap.get(r.country);
      list.push({
        iata: r.iata,
        name: r.name,
        city: (r.metroCode ? metroNames.get(r.metroCode) : undefined) ?? (r.cityId !== null ? cityNames.get(r.cityId) : undefined) ?? r.city,
        country: r.country,
        countryName: c?.name ?? r.country,
        region: regionOf(r.country, c?.continent ?? null),
        lat: r.lat,
        lon: r.lon,
        tz: r.timezone,
        rank: r.searchRank,
        metro: r.metroCode,
      });
    }
    return createDirectory(list);
  })();
  cached = { at: Date.now(), dir };
  dir.catch(() => {
    cached = null;
  });
  return dir;
}

/* ------------------------------------------------------------------ time zones */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

/** UTC offset (minutes) of `tz` at the given instant. Cached per tz-hour. */
export function tzOffsetMinutes(tz: string, utcMs: number): number {
  const key = `${tz}|${Math.floor(utcMs / 3_600_000)}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  let off = 0;
  try {
    const p: Record<string, number> = {};
    for (const part of formatter(tz).formatToParts(new Date(utcMs))) if (part.type !== "literal") p[part.type] = Number(part.value);
    const asUtc = Date.UTC(p["year"] ?? 1970, (p["month"] ?? 1) - 1, p["day"] ?? 1, p["hour"] ?? 0, p["minute"] ?? 0);
    off = Math.round((asUtc - Math.floor(utcMs / 60_000) * 60_000) / 60_000);
  } catch {
    off = 0;
  }
  if (offsetCache.size > 50_000) offsetCache.clear();
  offsetCache.set(key, off);
  return off;
}

/** Local wall-clock (date + minutes after midnight) in `tz` → UTC epoch ms. */
export function localToUtc(date: string, minutes: number, tz: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
  const off1 = tzOffsetMinutes(tz, guess);
  let utc = guess - off1 * 60_000;
  const off2 = tzOffsetMinutes(tz, utc);
  if (off2 !== off1) utc = guess - off2 * 60_000;
  return utc;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC epoch ms → "YYYY-MM-DDTHH:mm:00±hh:mm" in the airport's local time. */
export function toLocalIso(utcMs: number, tz: string): string {
  const off = tzOffsetMinutes(tz, utcMs);
  const local = new Date(utcMs + off * 60_000).toISOString().slice(0, 16);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${local}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Minutes after local midnight from an ISO string with offset (no TZ conversion). */
export function localMinutes(iso: string): number {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const todayUtc = () => new Date().toISOString().slice(0, 10);
