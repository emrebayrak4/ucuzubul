/**
 * US ZIP (ZCTA) import — US Census Bureau open data (public domain, 17 U.S.C. §105), downloaded at import time into
 * <repo>/.data/zip-cache (gitignored, never committed). See docs/DATA_SOURCES.md.
 *  - Gazetteer ZCTA file  → zip, internal point lat/lng, land area
 *  - ZCTA↔county 2020 relationship file → state + county (largest land overlap)
 *  - ZCTA↔place 2020 relationship file → place with largest land overlap; else nearest Gazetteer place in the same state
 *    (a Census place name — an approximation of the USPS city, not the official postal city)
 *  - 2020 Decennial DHC P1_001N via api.census.gov → population (only when CENSUS_API_KEY is set; otherwise left null)
 * Idempotent: upserts every ZCTA and removes rows that are no longer in the source.
 * Run: pnpm -C packages/database zip:import [--refresh]
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { createPrismaClient } from "../../src/index";

for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const REPO = path.basename(path.dirname(process.cwd())) === "packages" ? path.resolve(process.cwd(), "../..") : process.cwd();
const CACHE = path.join(REPO, ".data", "zip-cache");
const REFRESH = process.argv.includes("--refresh");
const MAX_AGE_MS = 30 * 86_400_000;
const UA = "WhichLessZipImport/1.0";
const GAZ_YEAR = process.env.CENSUS_GAZETTEER_YEAR ?? "2025";

const SOURCES = {
  zcta: `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${GAZ_YEAR}_Gazetteer/${GAZ_YEAR}_Gaz_zcta_national.zip`,
  places: `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${GAZ_YEAR}_Gazetteer/${GAZ_YEAR}_Gaz_place_national.zip`,
  zctaCounty: "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt",
  zctaPlace: "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_place20_natl.txt",
  population: "https://api.census.gov/data/2020/dec/dhc?get=P1_001N&for=zip%20code%20tabulation%20area:*",
};

async function download(url: string, name = path.basename(new URL(url).pathname)): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (!REFRESH && existsSync(file) && Date.now() - statSync(file).mtimeMs < MAX_AGE_MS) return readFile(file);
  console.log(`↓ ${new URL(url).origin}${new URL(url).pathname}`);
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(180_000), redirect: "manual" });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${new URL(url).pathname}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}

/** Extracts the first entry whose name ends with `suffix` from a ZIP archive (deflate/stored). */
function unzipFirst(zip: Buffer, suffix: string): Buffer {
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
    if (entryName.endsWith(suffix)) {
      const lNameLen = zip.readUInt16LE(localOffset + 26);
      const lExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: no *${suffix} entry`);
}

/** Delimited text with a header row → objects keyed by trimmed header names (separator auto-detected: Census moved tab → pipe in 2025). */
function parseDelimited(text: string): Record<string, string>[] {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).filter((l) => l.trim());
  const first = lines.shift() ?? "";
  const sep = first.includes("|") ? "|" : "\t";
  const header = first.split(sep).map((h) => h.trim());
  return lines.map((l) => {
    const cells = l.split(sep);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371.0088;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** "Springfield city" → "Springfield", "Bayamón zona urbana" → "Bayamón". */
const LSAD_SUFFIX = /\s+(city and borough|consolidated government(?: \(balance\))?|metropolitan government(?: \(balance\))?|unified government(?: \(balance\))?|urban county|city|town|village|borough|CDP|municipality|comunidad|zona urbana|plantation|corporation)$/i;
const cleanPlace = (n: string) => n.replace(/\s*\(balance\)$/i, "").replace(LSAD_SUFFIX, "").trim();

interface Place { state: string; name: string; lat: number; lng: number }

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const t0 = Date.now();
  const [zctaZip, placesZip, relTxt, relPlaceTxt] = await Promise.all([download(SOURCES.zcta), download(SOURCES.places), download(SOURCES.zctaCounty), download(SOURCES.zctaPlace)]);

  // ── Places → state FIPS→USPS map + spatial grid for nearest-place lookup ──
  const places = parseDelimited(unzipFirst(placesZip, ".txt").toString("utf8"));
  const fipsToUsps = new Map<string, string>();
  const grid = new Map<string, Place[]>();
  const cell = (lat: number, lng: number) => `${Math.floor(lat * 2)}:${Math.floor(lng * 2)}`; // 0.5° cells
  for (const p of places) {
    const usps = p["USPS"] ?? "";
    const geoid = p["GEOID"] ?? "";
    const lat = Number(p["INTPTLAT"]);
    const lng = Number(p["INTPTLONG"]);
    if (!/^[A-Z]{2}$/.test(usps) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    fipsToUsps.set(geoid.slice(0, 2), usps);
    const k = cell(lat, lng);
    const list = grid.get(k) ?? [];
    list.push({ state: usps, name: cleanPlace(p["NAME"] ?? ""), lat, lng });
    grid.set(k, list);
  }
  function nearestPlace(lat: number, lng: number, state: string | null): string | null {
    const cy = Math.floor(lat * 2);
    const cx = Math.floor(lng * 2);
    let best = null as { d: number; name: string } | null;
    for (let ring = 0; ring <= 6; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dy), Math.abs(dx)) !== ring) continue;
          for (const p of grid.get(`${cy + dy}:${cx + dx}`) ?? []) {
            if (state && p.state !== state) continue;
            const d = haversineKm(lat, lng, p.lat, p.lng);
            if (!best || d < best.d) best = { d, name: p.name };
          }
        }
      }
      // A found place is final once the next ring cannot be closer (~0.5° ≥ 27 km north-south).
      if (best && best.d < ring * 27) break;
    }
    return best && best.d <= 60 ? best.name : null;
  }

  // ── ZCTA → state/county by largest land overlap ──
  const rel = parseDelimited(relTxt.toString("utf8"));
  const county = new Map<string, { land: number; geoid: string; name: string }>();
  for (const r of rel) {
    const z = r["GEOID_ZCTA5_20"] ?? "";
    if (!/^\d{5}$/.test(z)) continue;
    const land = Number(r["AREALAND_PART"] ?? 0) + Number(r["AREAWATER_PART"] ?? 0) / 1000;
    const cur = county.get(z);
    if (!cur || land > cur.land) county.set(z, { land, geoid: r["GEOID_COUNTY_20"] ?? "", name: r["NAMELSAD_COUNTY_20"] ?? "" });
  }

  // ── ZCTA → place with the largest land overlap (fallback: nearest place internal point in the same state) ──
  const placeOverlap = new Map<string, { land: number; name: string }>();
  for (const r of parseDelimited(relPlaceTxt.toString("utf8"))) {
    const z = r["GEOID_ZCTA5_20"] ?? "";
    const land = Number(r["AREALAND_PART"] ?? 0);
    if (!/^\d{5}$/.test(z) || !(land > 0)) continue;
    const cur = placeOverlap.get(z);
    if (!cur || land > cur.land) placeOverlap.set(z, { land, name: cleanPlace(r["NAMELSAD_PLACE_20"] ?? "") });
  }

  // ── Population (optional; api.census.gov requires a key for unattended use) ──
  const population = new Map<string, number>();
  const key = process.env.CENSUS_API_KEY;
  if (key) {
    try {
      const raw = await download(`${SOURCES.population}&key=${encodeURIComponent(key)}`, "dhc_p1_zcta.json");
      const rows = JSON.parse(raw.toString("utf8")) as string[][];
      for (const [pop, zcta] of rows.slice(1)) if (zcta && pop) population.set(zcta, Number(pop));
    } catch (e) {
      console.warn(`population: skipped (${e instanceof Error ? e.message : String(e)})`);
    }
  } else {
    console.log("population: skipped — set CENSUS_API_KEY (free, api.census.gov/data/key_signup.html) to include 2020 counts");
  }

  // ── ZCTA centroids ──
  const zctas = parseDelimited(unzipFirst(zctaZip, ".txt").toString("utf8"));
  const rows: Array<{ zip: string; lat: number; lng: number; state: string | null; county: string | null; city: string | null; pop: number | null; area: number | null }> = [];
  for (const z of zctas) {
    const zip = z["GEOID"] ?? "";
    const lat = Number(z["INTPTLAT"]);
    const lng = Number(z["INTPTLONG"]);
    if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const c = county.get(zip);
    const state = c ? (fipsToUsps.get(c.geoid.slice(0, 2)) ?? null) : null;
    const aland = Number(z["ALAND"]);
    rows.push({
      zip,
      lat,
      lng,
      state,
      county: c?.name || null,
      city: placeOverlap.get(zip)?.name || nearestPlace(lat, lng, state),
      pop: population.get(zip) ?? null,
      area: Number.isFinite(aland) ? Math.round(aland / 1e4) / 100 : null,
    });
  }
  if (rows.length < 30_000) throw new Error(`Only ${rows.length} ZCTAs parsed — refusing to import a partial dataset`);

  const BATCH = 5000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const b = rows.slice(i, i + BATCH);
    await prisma.$executeRawUnsafe(
      `INSERT INTO zip_codes (zip, lat, lng, state, county, city, population, "landAreaKm2", "updatedAt")
       SELECT u.zip, u.lat, u.lng, NULLIF(u.state,''), NULLIF(u.county,''), NULLIF(u.city,''), u.pop, u.area, now()
       FROM unnest($1::text[], $2::float8[], $3::float8[], $4::text[], $5::text[], $6::text[], $7::int[], $8::float8[]) AS u(zip, lat, lng, state, county, city, pop, area)
       ON CONFLICT (zip) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, state = EXCLUDED.state, county = EXCLUDED.county,
         city = EXCLUDED.city, population = COALESCE(EXCLUDED.population, zip_codes.population), "landAreaKm2" = EXCLUDED."landAreaKm2", "updatedAt" = now()`,
      b.map((r) => r.zip),
      b.map((r) => r.lat),
      b.map((r) => r.lng),
      b.map((r) => r.state ?? ""),
      b.map((r) => r.county ?? ""),
      b.map((r) => r.city ?? ""),
      b.map((r) => r.pop),
      b.map((r) => r.area),
    );
  }
  const removed = await prisma.$executeRawUnsafe(`DELETE FROM zip_codes WHERE NOT (zip = ANY($1::text[]))`, rows.map((r) => r.zip));
  const noState = rows.filter((r) => !r.state).length;
  console.log(`zip_codes: ${rows.length} upserted, ${removed} removed, ${noState} without state, ${population.size ? "with" : "no"} population — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
