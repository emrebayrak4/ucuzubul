/**
 * Geo dataset import (open data, downloaded at import time into <repo>/.data/geo-cache — never committed):
 *  - OurAirports airports.csv / countries.csv / regions.csv — public domain (https://ourairports.com/data/)
 *  - GeoNames cities5000.zip / countryInfo.txt / admin1CodesASCII.txt — CC BY 4.0 (https://www.geonames.org/)
 * Idempotent upserts. Run: pnpm -C packages/database geo:import [--refresh]
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { createPrismaClient } from "../../src/index";
import { METRO_CODES } from "./metros";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const REPO = path.basename(path.dirname(process.cwd())) === "packages" ? path.resolve(process.cwd(), "../..") : process.cwd();
const CACHE = path.join(REPO, ".data", "geo-cache");
const REFRESH = process.argv.includes("--refresh");
const MAX_AGE_MS = 7 * 86_400_000;
const UA = "PricoraGeoImport/1.0 (+https://pricora.com)";

const SOURCES = {
  airports: "https://davidmegginson.github.io/ourairports-data/airports.csv",
  oaCountries: "https://davidmegginson.github.io/ourairports-data/countries.csv",
  oaRegions: "https://davidmegginson.github.io/ourairports-data/regions.csv",
  cities: "https://download.geonames.org/export/dump/cities5000.zip",
  countryInfo: "https://download.geonames.org/export/dump/countryInfo.txt",
  admin1: "https://download.geonames.org/export/dump/admin1CodesASCII.txt",
};

async function download(url: string): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, path.basename(new URL(url).pathname));
  if (!REFRESH && existsSync(file) && Date.now() - statSync(file).mtimeMs < MAX_AGE_MS) return readFile(file);
  console.log(`↓ ${url}`);
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

/** Extracts one entry from a ZIP archive using the central directory (deflate/stored). */
function unzipEntry(zip: Buffer, name: string): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("ZIP: end of central directory not found");
  let p = zip.readUInt32LE(eocd + 16);
  const entries = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < entries; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP: bad central directory");
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const entryName = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = zip.readUInt16LE(localOffset + 26);
      const lExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: ${name} not found`);
}

/** RFC 4180 CSV → array of objects keyed by header. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows;
  if (!header) return [];
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const tsv = (text: string) => text.split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const LATIN = /^[\p{Script=Latin}0-9 '.\-()]+$/u;

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const t0 = Date.now();
  const [airportsCsv, oaCountriesCsv, oaRegionsCsv, citiesZip, countryInfo, admin1Txt] = await Promise.all([
    download(SOURCES.airports),
    download(SOURCES.oaCountries),
    download(SOURCES.oaRegions),
    download(SOURCES.cities),
    download(SOURCES.countryInfo),
    download(SOURCES.admin1),
  ]);

  // ── Countries ──
  const info = new Map(tsv(countryInfo.toString("utf8")).map((c) => [c[0] ?? "", c]));
  const oaCountries = parseCsv(oaCountriesCsv.toString("utf8"));
  const countries = oaCountries
    .filter((c) => /^[A-Z]{2}$/.test(c["code"] ?? ""))
    .map((c) => {
      const gi = info.get(c["code"] ?? "");
      return {
        iso2: c["code"] ?? "",
        iso3: gi?.[1] && /^[A-Z]{3}$/.test(gi[1]) ? gi[1] : null,
        name: gi?.[4] || (c["name"] ?? ""),
        continent: (gi?.[8] || c["continent"] || null)?.slice(0, 2) ?? null,
        currency: gi?.[10] && /^[A-Z]{3}$/.test(gi[10]) ? gi[10] : null,
        capital: gi?.[5] || null,
        population: gi?.[7] ? Number(gi[7]) : null,
        geonameId: gi?.[16] ? Number(gi[16]) : null,
      };
    });
  // GeoNames countries missing from OurAirports.
  for (const [iso2, gi] of info) {
    if (/^[A-Z]{2}$/.test(iso2) && !countries.some((c) => c.iso2 === iso2)) {
      countries.push({ iso2, iso3: gi[1] || null, name: gi[4] ?? iso2, continent: gi[8] || null, currency: gi[10] || null, capital: gi[5] || null, population: gi[7] ? Number(gi[7]) : null, geonameId: gi[16] ? Number(gi[16]) : null });
    }
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO countries (iso2, iso3, name, continent, currency, capital, population, "geonameId", "updatedAt")
     SELECT u.iso2, NULLIF(u.iso3,''), u.name, NULLIF(u.continent,''), NULLIF(u.currency,''), NULLIF(u.capital,''), u.population, u.geoname, now()
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::bigint[], $8::int[]) AS u(iso2, iso3, name, continent, currency, capital, population, geoname)
     ON CONFLICT (iso2) DO UPDATE SET iso3 = EXCLUDED.iso3, name = EXCLUDED.name, continent = EXCLUDED.continent, currency = EXCLUDED.currency,
       capital = EXCLUDED.capital, population = EXCLUDED.population, "geonameId" = EXCLUDED."geonameId", "updatedAt" = now()`,
    countries.map((c) => c.iso2),
    countries.map((c) => c.iso3 ?? ""),
    countries.map((c) => c.name),
    countries.map((c) => c.continent ?? ""),
    countries.map((c) => c.currency ?? ""),
    countries.map((c) => c.capital ?? ""),
    countries.map((c) => (c.population === null ? null : BigInt(c.population))),
    countries.map((c) => c.geonameId),
  );
  const countrySet = new Set(countries.map((c) => c.iso2));
  console.log(`countries: ${countries.length}`);

  // ── Admin1 names ──
  const admin1 = new Map(tsv(admin1Txt.toString("utf8")).map((a) => [a[0] ?? "", a[1] ?? ""]));
  const regions = new Map(parseCsv(oaRegionsCsv.toString("utf8")).map((r) => [r["code"] ?? "", r["name"] ?? ""]));

  // ── Cities ──
  const citiesTxt = unzipEntry(citiesZip, "cities5000.txt").toString("utf8");
  interface CityRow { id: number; name: string; ascii: string; alt: string[]; cc: string; a1: string; a1n: string | null; lat: number; lng: number; pop: number; tz: string }
  const cities: CityRow[] = [];
  for (const c of tsv(citiesTxt)) {
    const cc = c[8] ?? "";
    if (!countrySet.has(cc)) continue;
    const name = c[1] ?? "";
    const ascii = c[2] || name;
    const seen = new Set([norm(name), norm(ascii)]);
    const alt: string[] = [];
    for (const a of (c[3] ?? "").split(",")) {
      const t = a.trim();
      if (t.length < 2 || t.length > 40 || !LATIN.test(t) || /^[A-Z]{3,4}$/.test(t)) continue;
      const k = norm(t);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      alt.push(t);
      if (alt.length >= 8) break;
    }
    const a1 = c[10] ?? "";
    cities.push({ id: Number(c[0]), name, ascii, alt, cc, a1, a1n: admin1.get(`${cc}.${a1}`) ?? null, lat: Number(c[4]), lng: Number(c[5]), pop: Number(c[14] || 0), tz: c[17] ?? "" });
  }
  const BATCH = 5000;
  for (let i = 0; i < cities.length; i += BATCH) {
    const b = cities.slice(i, i + BATCH);
    await prisma.$executeRawUnsafe(
      `INSERT INTO cities ("geonameId", name, "asciiName", "alternateNames", "countryIso2", "admin1Code", "admin1Name", lat, lng, population, timezone, "updatedAt")
       SELECT u.id, u.name, u.ascii, CASE WHEN u.alt = '' THEN ARRAY[]::text[] ELSE string_to_array(u.alt, '|') END, u.cc, NULLIF(u.a1,''), NULLIF(u.a1n,''), u.lat, u.lng, u.pop, NULLIF(u.tz,''), now()
       FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::float8[], $9::float8[], $10::int[], $11::text[]) AS u(id, name, ascii, alt, cc, a1, a1n, lat, lng, pop, tz)
       ON CONFLICT ("geonameId") DO UPDATE SET name = EXCLUDED.name, "asciiName" = EXCLUDED."asciiName", "alternateNames" = EXCLUDED."alternateNames",
         "countryIso2" = EXCLUDED."countryIso2", "admin1Code" = EXCLUDED."admin1Code", "admin1Name" = EXCLUDED."admin1Name", lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         population = EXCLUDED.population, timezone = EXCLUDED.timezone, "updatedAt" = now()`,
      b.map((c) => c.id),
      b.map((c) => c.name),
      b.map((c) => c.ascii),
      b.map((c) => c.alt.join("|")),
      b.map((c) => c.cc),
      b.map((c) => c.a1),
      b.map((c) => c.a1n ?? ""),
      b.map((c) => c.lat),
      b.map((c) => c.lng),
      b.map((c) => c.pop),
      b.map((c) => c.tz),
    );
  }
  console.log(`cities: ${cities.length}`);

  // ── Airports ──
  const byCountry = new Map<string, CityRow[]>();
  for (const c of cities) {
    let arr = byCountry.get(c.cc);
    if (!arr) byCountry.set(c.cc, (arr = []));
    arr.push(c);
  }
  const TYPES: Record<string, "large" | "medium" | "small"> = { large_airport: "large", medium_airport: "medium", small_airport: "small" };
  const picked = new Map<string, Record<string, string>>();
  const score = (r: Record<string, string>) => (r["scheduled_service"] === "yes" ? 10 : 0) + ({ large_airport: 3, medium_airport: 2, small_airport: 1 }[r["type"] ?? ""] ?? 0);
  for (const r of parseCsv(airportsCsv.toString("utf8"))) {
    const iata = (r["iata_code"] ?? "").trim().toUpperCase();
    const type = TYPES[r["type"] ?? ""];
    if (!/^[A-Z]{3}$/.test(iata) || !type || !countrySet.has(r["iso_country"] ?? "")) continue;
    if (r["scheduled_service"] !== "yes" && type === "small") continue;
    const prev = picked.get(iata);
    if (!prev || score(r) > score(prev)) picked.set(iata, r);
  }
  const existing = new Map((await prisma.airport.findMany({ select: { iata: true, searchRank: true } })).map((a) => [a.iata, a.searchRank]));
  const airports = [...picked.entries()].map(([iata, r]) => {
    const lat = Number(r["latitude_deg"]);
    const lng = Number(r["longitude_deg"]);
    const cc = r["iso_country"] ?? "";
    const muni = r["municipality"] ?? "";
    const list = byCountry.get(cc) ?? [];
    const m = norm(muni);
    let best: CityRow | null = null;
    let bestD = Infinity;
    if (m) {
      for (const c of list) {
        if (norm(c.ascii) !== m && norm(c.name) !== m && !c.alt.some((a) => norm(a) === m)) continue;
        const d = haversineKm(lat, lng, c.lat, c.lng);
        if (d < 80 && (d < bestD || (best && c.pop > best.pop * 5 && d < bestD + 20))) {
          best = c;
          bestD = d;
        }
      }
    }
    if (!best) {
      for (const c of list) {
        const d = haversineKm(lat, lng, c.lat, c.lng);
        if (d < 25 && d < bestD) {
          best = c;
          bestD = d;
        }
      }
    }
    const type = TYPES[r["type"] ?? ""] ?? "small";
    const sched = r["scheduled_service"] === "yes";
    const rank = Math.max(existing.get(iata) ?? 0, (type === "large" ? 70 : type === "medium" ? 45 : 20) + (sched ? 5 : 0));
    const icao = (r["icao_code"] || r["gps_code"] || "").toUpperCase();
    return {
      iata,
      icao: /^[A-Z0-9]{4}$/.test(icao) ? icao : "",
      name: r["name"] ?? iata,
      city: muni || best?.name || "",
      region: regions.get(r["iso_region"] ?? "") ?? "",
      country: cc,
      lat,
      lng,
      tz: best?.tz ?? "",
      rank,
      type,
      sched,
      cityId: best?.id ?? null,
      regionCode: r["iso_region"] ?? "",
      oaId: Number(r["id"]),
    };
  });
  for (let i = 0; i < airports.length; i += BATCH) {
    const b = airports.slice(i, i + BATCH);
    await prisma.$executeRawUnsafe(
      `INSERT INTO airports (iata, icao, name, city, region, country, lat, lon, timezone, "searchRank", type, "scheduledService", "cityId", "regionCode", "ourairportsId", "updatedAt")
       SELECT u.iata, NULLIF(u.icao,''), u.name, u.city, NULLIF(u.region,''), u.country, u.lat, u.lng, NULLIF(u.tz,''), u.rank, u.type::"AirportType", u.sched, u.city_id, NULLIF(u.region_code,''), u.oa_id, now()
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::float8[], $8::float8[], $9::text[], $10::int[], $11::text[], $12::bool[], $13::int[], $14::text[], $15::int[])
         AS u(iata, icao, name, city, region, country, lat, lng, tz, rank, type, sched, city_id, region_code, oa_id)
       ON CONFLICT (iata) DO UPDATE SET icao = COALESCE(EXCLUDED.icao, airports.icao), name = EXCLUDED.name, city = EXCLUDED.city, region = COALESCE(EXCLUDED.region, airports.region),
         country = EXCLUDED.country, lat = EXCLUDED.lat, lon = EXCLUDED.lon, timezone = COALESCE(EXCLUDED.timezone, airports.timezone),
         "searchRank" = GREATEST(airports."searchRank", EXCLUDED."searchRank"), type = EXCLUDED.type, "scheduledService" = EXCLUDED."scheduledService",
         "cityId" = EXCLUDED."cityId", "regionCode" = EXCLUDED."regionCode", "ourairportsId" = EXCLUDED."ourairportsId", "updatedAt" = now()`,
      b.map((a) => a.iata),
      b.map((a) => a.icao),
      b.map((a) => a.name),
      b.map((a) => a.city),
      b.map((a) => a.region),
      b.map((a) => a.country),
      b.map((a) => a.lat),
      b.map((a) => a.lng),
      b.map((a) => a.tz),
      b.map((a) => a.rank),
      b.map((a) => a.type),
      b.map((a) => a.sched),
      b.map((a) => a.cityId),
      b.map((a) => a.regionCode),
      b.map((a) => a.oaId),
    );
  }
  console.log(`airports: ${airports.length} (scheduled: ${airports.filter((a) => a.sched).length}, linked to a city: ${airports.filter((a) => a.cityId).length})`);

  // ── Metro (multi-airport) city codes ──
  await prisma.airport.updateMany({ where: { metroCode: { not: null } }, data: { metroCode: null } });
  await prisma.city.updateMany({ where: { iataCityCode: { not: null } }, data: { iataCityCode: null } });
  let metros = 0;
  for (const m of METRO_CODES) {
    const r = await prisma.airport.updateMany({ where: { iata: { in: m.airports } }, data: { metroCode: m.code } });
    const city = await prisma.city.findFirst({
      where: { countryIso2: m.country, OR: [{ asciiName: { equals: m.city, mode: "insensitive" } }, { name: { equals: m.city, mode: "insensitive" } }] },
      orderBy: { population: "desc" },
    });
    if (city) await prisma.city.update({ where: { geonameId: city.geonameId }, data: { iataCityCode: m.code } });
    if (r.count > 0) metros++;
    else console.warn(`metro ${m.code}: no airports found`);
  }
  console.log(`metro city codes: ${metros}/${METRO_CODES.length}`);
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
