/**
 * DEMO fare engine — deterministic, server-side, clearly labeled (source = "demo", not bookable).
 *
 * Itineraries are built from a network model (real airlines, alliances, hubs; curated nonstop carriers on ~190
 * popular routes, a generic hub model everywhere else). Durations come from great-circle distance with a wind
 * factor, schedules are stable per carrier/route (same flight numbers every day), prices vary with distance,
 * carrier, stops, cabin, day of week, season, advance purchase and a per-day demand factor.
 * Used only when no live flight provider is configured.
 */
import type { CabinClass, FareBrand, FareOption, FlightBaggage } from "@pricora/contracts";
import { AIRLINE_BY_CODE, AIRLINES, canInterline, NARROWBODY_FALLBACK, type AirlineInfo } from "./airlines";
import { addDays, daysBetween, distanceKm, localToUtc, tzOffsetMinutes, type AirportDirectory, type AirportInfo } from "./geo";
import { curatedCarriers } from "./routes";

/* ------------------------------------------------------------------ deterministic randomness */

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** Deterministic [0, 1) from a string. */
export const rand = (s: string) => {
  let t = (hash32(s) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* ------------------------------------------------------------------ types */

export interface DemoSegment {
  carrier: AirlineInfo;
  operator: { iata: string; name: string } | null;
  flightNumber: string;
  from: AirportInfo;
  to: AirportInfo;
  depUtc: number;
  arrUtc: number;
  durationMinutes: number;
  aircraft: string;
}

export interface DemoSlice {
  key: string;
  from: AirportInfo;
  to: AirportInfo;
  date: string;
  segments: DemoSegment[];
  selfTransfer: boolean;
  /** Ticketing group (alliance / carrier / "self") — round trips pair within a group. */
  group: string;
  durationMinutes: number;
  /** Per-adult price per fare brand (cabin applied), whole dollars in cents. */
  prices: Partial<Record<FareBrand, number>>;
  bags: Partial<Record<FareBrand, FlightBaggage>>;
  longHaul: boolean;
}

interface Service {
  carrier: AirlineInfo;
  from: AirportInfo;
  to: AirportInfo;
  distanceKm: number;
}

/* ------------------------------------------------------------------ network */

function servesFromHub(x: AirlineInfo, hub: AirportInfo, other: AirportInfo, d: number, dir: AirportDirectory): boolean {
  if (x.hubs.includes(other.iata)) return true;
  if (x.home.includes(other.country) && x.home.includes(hub.country)) {
    if (other.rank >= 50 && d < 5600) return true;
    if (x.regionalOperator && d < 900) return true;
  }
  if (x.regional.includes(other.region) && other.rank >= 75 && d < 5600) return true;
  const gateway = x.bags === "premium" ? 78 : 84;
  if (x.longHaul.includes(other.region) && d >= 2500 && d <= 14500 && other.rank >= gateway) return true;
  // Long-haul into an alliance partner's hub (e.g. UA EWR→MUC, DL JFK→AMS).
  if (x.alliance && d >= 2500 && d <= 13500 && x.longHaul.includes(other.region)) {
    for (const y of AIRLINES) if (y.alliance === x.alliance && y.iata !== x.iata && y.hubs.includes(other.iata)) return true;
  }
  void dir;
  return false;
}

const nonstopCache = new Map<string, AirlineInfo[]>();

/** Carriers flying A→B nonstop in the demo network. */
export function nonstopCarriers(a: AirportInfo, b: AirportInfo, dir: AirportDirectory): AirlineInfo[] {
  const k = `${a.iata}${b.iata}`;
  const hit = nonstopCache.get(k);
  if (hit) return hit;
  const out: AirlineInfo[] = [];
  const d = distanceKm(a, b);
  const curated = curatedCarriers(a.iata, b.iata);
  if (curated) {
    for (const c of curated) {
      const x = AIRLINE_BY_CODE.get(c);
      if (x) out.push(x);
    }
  } else if (d >= 140 && d <= 15600) {
    for (const x of AIRLINES) {
      const hubA = x.hubs.includes(a.iata);
      const hubB = x.hubs.includes(b.iata);
      if (hubA || hubB) {
        const ok = hubA ? servesFromHub(x, a, b, d, dir) : servesFromHub(x, b, a, d, dir);
        if (ok) out.push(x);
      } else if (x.lcc && d < 3200 && a.rank >= 75 && b.rank >= 75) {
        // Point-to-point low-cost flying between two large airports in its markets (about one pair in three).
        const inA = x.home.includes(a.country) || x.regional.includes(a.region);
        const inB = x.home.includes(b.country) || x.regional.includes(b.region);
        if (inA && inB && rand(`p2p|${x.iata}|${[a.iata, b.iata].sort().join("")}`) < 0.33) out.push(x);
      }
    }
  }
  if (nonstopCache.size > 200_000) nonstopCache.clear();
  nonstopCache.set(k, out);
  return out;
}

let hubCache: { dir: AirportDirectory; hubs: AirportInfo[] } | null = null;
function allHubs(dir: AirportDirectory): AirportInfo[] {
  if (hubCache?.dir === dir) return hubCache.hubs;
  const codes = new Set(AIRLINES.flatMap((a) => a.hubs));
  const hubs = [...codes].map((c) => dir.get(c)).filter((x): x is AirportInfo => Boolean(x));
  hubCache = { dir, hubs };
  return hubs;
}

/** Multi-airport cities where a self-transfer may involve an airport change. */
const METRO_PAIRS: Array<[string, string]> = [
  ["IST", "SAW"],
  ["LHR", "LGW"],
  ["LHR", "STN"],
  ["LGW", "STN"],
  ["CDG", "ORY"],
  ["JFK", "LGA"],
  ["JFK", "EWR"],
  ["FCO", "CIA"],
  ["HND", "NRT"],
  ["PEK", "PKX"],
  ["PVG", "SHA"],
];

interface Routing {
  services: Service[];
  selfTransfer: boolean;
  group: string;
}

function service(carrier: AirlineInfo, from: AirportInfo, to: AirportInfo): Service {
  return { carrier, from, to, distanceKm: distanceKm(from, to) };
}
function groupOf(cs: AirlineInfo[]): string {
  const first = cs[0]!;
  if (cs.every((c) => c.iata === first.iata)) return first.alliance ?? first.iata;
  return first.alliance ?? cs.find((c) => c.alliance)?.alliance ?? first.iata;
}
const sameMetro = (x: AirportInfo, y: AirportInfo) => x.iata === y.iata || (x.metro !== null && x.metro === y.metro);

/** Possible routings A→B: nonstops, one connection via hubs, two connections when little else exists. */
export function routings(a: AirportInfo, b: AirportInfo, dir: AirportDirectory): Routing[] {
  const out: Routing[] = [];
  const d = distanceKm(a, b);
  for (const c of nonstopCarriers(a, b, dir)) out.push({ services: [service(c, a, b)], selfTransfer: false, group: groupOf([c]) });

  const maxDetour = d < 1200 ? 1.75 : d < 4000 ? 1.4 : d < 9000 ? 1.28 : 1.22;
  const one: Array<Routing & { detour: number }> = [];
  for (const h of allHubs(dir)) {
    if (sameMetro(h, a) || sameMetro(h, b)) continue;
    const dah = distanceKm(a, h);
    const dhb = distanceKm(h, b);
    const detour = (dah + dhb) / Math.max(1, d);
    if (detour > maxDetour) continue;
    const c1 = nonstopCarriers(a, h, dir);
    if (c1.length === 0) continue;
    const c2 = nonstopCarriers(h, b, dir);
    let added = 0;
    for (const x of c1) {
      for (const y of c2) {
        if (added >= 3) break;
        if (!canInterline(x, y)) continue;
        one.push({ services: [service(x, a, h), service(y, h, b)], selfTransfer: false, group: groupOf([x, y]), detour: detour + (x.iata === y.iata ? 0 : 0.03) });
        added++;
      }
    }
    // Separate tickets between low-cost carriers (self-transfer), incl. an airport change in the same city.
    if (d < 4500) {
      const lccFirst = c1.find((x) => x.lcc);
      const lccSecond = c2.find((y) => y.lcc && (!lccFirst || !canInterline(lccFirst, y)));
      if (lccFirst && lccSecond && rand(`st|${a.iata}${b.iata}${h.iata}`) < 0.6) {
        one.push({ services: [service(lccFirst, a, h), service(lccSecond, h, b)], selfTransfer: true, group: "self", detour: detour + 0.05 });
      }
    }
    for (const [p, q] of METRO_PAIRS) {
      const otherCode = h.iata === p ? q : h.iata === q ? p : null;
      const h2 = otherCode ? dir.get(otherCode) : undefined;
      if (!h2 || sameMetro(h2, b) || sameMetro(h2, a)) continue;
      const c3 = nonstopCarriers(h2, b, dir).filter((y) => y.lcc);
      const x = c1.find((c) => !c.lcc) ?? c1[0];
      const y = c3[0];
      if (x && y && !canInterline(x, y) && rand(`ac|${a.iata}${b.iata}${h.iata}`) < 0.7) {
        one.push({ services: [service(x, a, h), service(y, h2, b)], selfTransfer: true, group: "self", detour: detour + 0.08 });
      }
    }
  }
  one.sort((p, q) => p.detour - q.detour || rand(`o|${p.services.map((s) => s.carrier.iata + s.to.iata).join()}`) - 0.5);
  out.push(...one.slice(0, 16));

  if (out.length < 5) {
    const two: Array<Routing & { detour: number }> = [];
    const hubs = allHubs(dir);
    const firsts = hubs.filter((h) => !sameMetro(h, a) && !sameMetro(h, b) && nonstopCarriers(a, h, dir).length > 0);
    const lasts = hubs.filter((h) => !sameMetro(h, a) && !sameMetro(h, b) && nonstopCarriers(h, b, dir).length > 0);
    for (const h1 of firsts) {
      for (const h2 of lasts) {
        if (sameMetro(h1, h2)) continue;
        const detour = (distanceKm(a, h1) + distanceKm(h1, h2) + distanceKm(h2, b)) / Math.max(1, d);
        if (detour > Math.max(1.5, maxDetour + 0.15)) continue;
        const mids = nonstopCarriers(h1, h2, dir);
        if (mids.length === 0) continue;
        for (const x of nonstopCarriers(a, h1, dir)) {
          const m = mids.find((y) => canInterline(x, y));
          const z = m ? nonstopCarriers(h2, b, dir).find((y) => canInterline(m, y) || canInterline(x, y)) : undefined;
          if (m && z) {
            two.push({ services: [service(x, a, h1), service(m, h1, h2), service(z, h2, b)], selfTransfer: false, group: groupOf([x, m, z]), detour });
            break;
          }
        }
      }
    }
    two.sort((p, q) => p.detour - q.detour);
    out.push(...two.slice(0, 6));
  }
  return out;
}

/* ------------------------------------------------------------------ schedules */

interface Departure {
  depLocalMin: number;
  flightNumber: string;
  operator: { iata: string; name: string } | null;
  aircraft: string;
  durationMinutes: number;
}

function blockMinutes(s: Service): number {
  let dLon = s.to.lon - s.from.lon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  const wind = 1 - 0.065 * clamp(dLon / 50, -1, 1);
  return Math.max(50, round5(45 + (s.distanceKm / 13.6) * wind));
}

function window(s: Service): [number, number][] {
  const long = s.distanceKm > 4500;
  const fr = s.from.region;
  const to = s.to.region;
  if (long && fr === "NA" && (to === "EU" || to === "AF" || to === "ME")) return [[16 * 60 + 30, 22 * 60 + 30]];
  if (long && (fr === "EU" || fr === "AF") && (to === "NA" || to === "LATAM")) return [[8 * 60, 16 * 60]];
  if (long && fr === "ME") return [[60, 9 * 60], [20 * 60, 23 * 60 + 30]];
  if (long && fr === "NA" && (to === "AS_E" || to === "AS_SE" || to === "OC" || to === "AS_S")) return [[10 * 60, 16 * 60], [21 * 60 + 30, 23 * 60 + 50]];
  if (long && (fr === "AS_E" || fr === "AS_SE" || fr === "OC") && to === "NA") return [[15 * 60 + 30, 21 * 60 + 30]];
  if (long && fr === "NA" && to === "LATAM") return [[7 * 60, 23 * 60]];
  return [[6 * 60, 21 * 60 + 45]];
}

function aircraftFor(s: Service, h: number, regional: boolean): string {
  const c = s.carrier;
  if (regional) return h % 2 ? "Embraer E175" : "Bombardier CRJ900";
  if (s.distanceKm <= 4800 && c.narrowbody.length) return c.narrowbody[h % c.narrowbody.length]!;
  if (c.widebody.length && s.distanceKm > 3000) return c.widebody[h % c.widebody.length]!;
  if (c.narrowbody.length) return s.distanceKm > 4800 ? "Airbus A321LR" : c.narrowbody[h % c.narrowbody.length]!;
  if (c.widebody.length) return c.widebody[h % c.widebody.length]!;
  return NARROWBODY_FALLBACK[h % NARROWBODY_FALLBACK.length]!;
}

const depCache = new Map<string, Departure[]>();

/** Daily departures of a carrier on A→B. Stable flight numbers/times; some frequencies skip some weekdays. */
function departures(s: Service, date: string): Departure[] {
  const k = `${s.carrier.iata}|${s.from.iata}|${s.to.iata}|${date}`;
  const hit = depCache.get(k);
  if (hit) return hit;
  const base = `${s.carrier.iata}|${s.from.iata}|${s.to.iata}`;
  const h = hash32(base);
  const d = s.distanceKm;
  const minRank = Math.min(s.from.rank, s.to.rank);
  let f = d < 3000 ? 3 : d < 6500 ? 2 : 1;
  if (minRank >= 90 && d < 4500) f += 2;
  else if (minRank >= 82) f += 1;
  if (minRank < 75) f = Math.min(f, 2);
  if (s.carrier.lcc) f = Math.max(1, f - 1);
  f = clamp(f + (h % 2), 1, 6);
  const windows = window(s);
  const dur = blockMinutes(s);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const out: Departure[] = [];
  for (let i = 0; i < f; i++) {
    // Extra frequencies don't operate every day.
    if (i >= 2 && rand(`${base}|f${i}|dow${dow}`) < 0.25) continue;
    const [lo, hi] = windows[i % windows.length]!;
    const slots = Math.ceil(f / windows.length);
    const idx = Math.floor(i / windows.length);
    const span = hi - lo;
    const jitter = (rand(`${base}|j${i}`) - 0.5) * (span / slots) * 0.6;
    const depLocalMin = clamp(round5(lo + ((idx + 0.5) * span) / slots + jitter), 0, 23 * 60 + 55);
    const regional = Boolean(s.carrier.regionalOperator) && d < 1100 && (minRank < 75 || (h + i) % 3 === 0);
    let num: number;
    if (d > 4000) num = 1 + ((h + i * 13) % 299);
    else if (s.carrier.lcc) num = 100 + ((h + i * 811) % 8900);
    else if (regional) num = 3000 + ((h + i * 97) % 2999);
    else num = 300 + ((h + i * 53) % 2600);
    out.push({
      depLocalMin,
      flightNumber: `${s.carrier.iata}${num}`,
      operator: regional ? (s.carrier.regionalOperator ?? null) : null,
      aircraft: aircraftFor(s, h + i, regional),
      durationMinutes: dur + (i % 2) * 5,
    });
  }
  out.sort((p, q) => p.depLocalMin - q.depLocalMin);
  if (depCache.size > 100_000) depCache.clear();
  depCache.set(k, out);
  return out;
}

function segmentFrom(s: Service, date: string, dep: Departure): DemoSegment {
  const depUtc = localToUtc(date, dep.depLocalMin, s.from.tz);
  return {
    carrier: s.carrier,
    operator: dep.operator,
    flightNumber: dep.flightNumber,
    from: s.from,
    to: s.to,
    depUtc,
    arrUtc: depUtc + dep.durationMinutes * 60_000,
    durationMinutes: dep.durationMinutes,
    aircraft: dep.aircraft,
  };
}

/** Local calendar date at an airport for a UTC instant. */
function localDate(utcMs: number, tz: string): string {
  return new Date(utcMs + tzOffsetMinutes(tz, utcMs) * 60_000).toISOString().slice(0, 10);
}

/** Next segments on `s` departing ≥ minUtc (same or next local day), up to `n`. */
function nextConnections(s: Service, minUtc: number, maxUtc: number, n: number): DemoSegment[] {
  const out: DemoSegment[] = [];
  const day0 = localDate(minUtc, s.from.tz);
  for (const date of [day0, addDays(day0, 1)]) {
    for (const dep of departures(s, date)) {
      const seg = segmentFrom(s, date, dep);
      if (seg.depUtc >= minUtc && seg.depUtc <= maxUtc) out.push(seg);
      if (out.length >= n) return out;
    }
  }
  return out;
}

function mct(prev: Service, next: Service, selfTransfer: boolean): number {
  if (selfTransfer) return prev.to.iata !== next.from.iata ? 240 : 150;
  return prev.from.country === next.to.country && prev.to.country === prev.from.country ? 45 : 70;
}

/* ------------------------------------------------------------------ pricing */

/** Typical one-way main-cabin economy fare (USD) for a great-circle distance. */
export function baseFareUsd(d: number): number {
  if (d <= 2000) return 62 + 0.105 * d;
  return 272 + 0.046 * (d - 2000);
}

function seasonFactor(date: string, s: { from: AirportInfo; to: AirportInfo }): number {
  const md = date.slice(5);
  const transatlantic = (s.from.region === "NA" && s.to.region === "EU") || (s.from.region === "EU" && s.to.region === "NA");
  const europe = s.from.region === "EU" || s.to.region === "EU";
  if (md >= "12-17" || md <= "01-04") return 1.3;
  if (md >= "11-21" && md <= "11-30" && s.from.country === "US") return 1.2;
  if (md >= "06-12" && md <= "08-22") return transatlantic ? 1.28 : europe ? 1.2 : 1.1;
  if (md >= "03-08" && md <= "04-10") return 1.08;
  if (md >= "01-08" && md <= "02-28") return 0.85;
  if (md >= "09-06" && md <= "11-15") return 0.92;
  return 1;
}

const DOW_FACTOR = [1.08, 1, 0.92, 0.9, 1.02, 1.1, 0.95]; // Sun..Sat

function advanceFactor(days: number): number {
  if (days <= 2) return 1.62;
  if (days <= 6) return 1.36;
  if (days <= 13) return 1.17;
  if (days <= 20) return 1.06;
  if (days <= 35) return 0.98;
  if (days <= 70) return 0.94;
  if (days <= 120) return 0.99;
  if (days <= 200) return 1.05;
  return 1.1;
}

function todFactor(localMin: number): number {
  if (localMin < 6 * 60) return 0.9;
  if (localMin < 8 * 60) return 0.95;
  if (localMin >= 17 * 60 && localMin < 21 * 60) return 1.06;
  if (localMin >= 21 * 60 + 30) return 0.93;
  return 1;
}

function cabinFactor(cabin: CabinClass, d: number): number {
  switch (cabin) {
    case "premium_economy":
      return 1.8;
    case "business":
      return d > 3500 ? 5.4 : 2.4;
    case "first":
      return d > 3500 ? 8.8 : 3.4;
    default:
      return 1;
  }
}

const usd = (n: number) => Math.max(29, Math.round(n)) * 100;

export function bagsFor(c: AirlineInfo, brand: FareBrand, longHaul: boolean, cabin: CabinClass, region: string): FlightBaggage {
  if (cabin !== "economy") return { carryOn: 1, checked: cabin === "premium_economy" ? (brand === "flex" ? 2 : 1) : 2, checkedBagFeeCents: null, carryOnFeeCents: null };
  const eu = region === "EU";
  switch (c.bags) {
    case "ulcc":
      if (brand === "basic") return { carryOn: 0, checked: 0, carryOnFeeCents: eu ? 2500 : 5900, checkedBagFeeCents: eu ? 3500 : 5500 };
      if (brand === "main") return { carryOn: 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: eu ? 3500 : 5500 };
      return { carryOn: 1, checked: 1, carryOnFeeCents: null, checkedBagFeeCents: null };
    case "hybrid":
      if (brand === "basic") return { carryOn: c.iata === "B6" ? 0 : 1, checked: 0, carryOnFeeCents: c.iata === "B6" ? 3500 : null, checkedBagFeeCents: 3500 };
      if (brand === "main") return { carryOn: 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: 3500 };
      return { carryOn: 1, checked: 1, carryOnFeeCents: null, checkedBagFeeCents: null };
    case "us_legacy":
      if (longHaul) {
        if (brand === "basic") return { carryOn: 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: 7500 };
        return { carryOn: 1, checked: brand === "flex" ? 2 : 1, carryOnFeeCents: null, checkedBagFeeCents: null };
      }
      if (brand === "basic") return { carryOn: c.iata === "UA" ? 0 : 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: 4000 };
      if (brand === "main") return { carryOn: 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: 4000 };
      return { carryOn: 1, checked: 1, carryOnFeeCents: null, checkedBagFeeCents: null };
    case "full_service":
      if (brand === "basic") return { carryOn: 1, checked: 0, carryOnFeeCents: null, checkedBagFeeCents: longHaul ? 7500 : 3500 };
      return { carryOn: 1, checked: brand === "flex" && longHaul ? 2 : 1, carryOnFeeCents: null, checkedBagFeeCents: null };
    case "premium":
    default:
      return { carryOn: 1, checked: brand === "flex" ? 2 : 1, carryOnFeeCents: null, checkedBagFeeCents: null };
  }
}

/** Most restrictive of two allowances (self-transfer / round trip / multi-city). */
export function mergeBags(a: FlightBaggage, b: FlightBaggage): FlightBaggage {
  const min = (x: number | null, y: number | null) => (x === null || y === null ? null : Math.min(x, y));
  const fee = (x: number | null | undefined, y: number | null | undefined) => (x ?? 0) + (y ?? 0) || null;
  return {
    carryOn: min(a.carryOn, b.carryOn),
    checked: min(a.checked, b.checked),
    checkedBagFeeCents: fee(a.checkedBagFeeCents, b.checkedBagFeeCents),
    carryOnFeeCents: fee(a.carryOnFeeCents, b.carryOnFeeCents),
  };
}

export interface EngineContext {
  dir: AirportDirectory;
  /** "Today" (UTC date) — advance-purchase pricing depends on it. */
  today: string;
}

function priceSlice(
  segments: DemoSegment[],
  from: AirportInfo,
  to: AirportInfo,
  date: string,
  cabin: CabinClass,
  selfTransfer: boolean,
  nonstopCompetitors: number,
  ctx: EngineContext,
): Pick<DemoSlice, "prices" | "bags" | "longHaul"> {
  const d = distanceKm(from, to);
  const totalSegKm = segments.reduce((n, s) => n + distanceKm(s.from, s.to), 0);
  const carrierFactor = segments.reduce((n, s) => n + s.carrier.priceFactor * distanceKm(s.from, s.to), 0) / Math.max(1, totalSegKm);
  const stops = segments.length - 1;
  const stopsFactor = selfTransfer ? 0.84 : [1.12, 0.97, 0.9][Math.min(2, stops)]!;
  const first = segments[0]!;
  const depLocal = Math.round(((first.depUtc + tzOffsetMinutes(from.tz, first.depUtc) * 60_000) % 86_400_000) / 60_000);
  const routeKey = [from.metro ?? from.iata, to.metro ?? to.iata].join(">");
  const demand = 0.92 + 0.16 * rand(`demand|${routeKey}|${date}`);
  const itinKey = segments.map((s) => s.flightNumber).join("-");
  const noise = 0.93 + 0.14 * rand(`n|${itinKey}|${date}|${ctx.today}`);
  const comp = nonstopCompetitors >= 3 ? 0.94 : nonstopCompetitors === 0 ? 1.06 : 1;
  const dow = DOW_FACTOR[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
  const main =
    baseFareUsd(d) * carrierFactor * stopsFactor * dow * advanceFactor(daysBetween(ctx.today, date)) * seasonFactor(date, { from, to }) * todFactor(depLocal) * demand * noise * comp * cabinFactor(cabin, d);
  const longHaul = d > 4000 || from.region !== to.region;
  const lead = first.carrier;
  const prices: DemoSlice["prices"] = {};
  const bags: DemoSlice["bags"] = {};
  const brands: FareBrand[] = cabin === "economy" ? ["basic", "main", "flex"] : ["main", "flex"];
  for (const brand of brands) {
    const mult = brand === "basic" ? (lead.lcc ? 0.78 : 0.84) : brand === "flex" ? (cabin === "economy" ? 1.45 : 1.25) : 1;
    prices[brand] = usd(main * mult);
    let b = bagsFor(lead, brand, longHaul, cabin, from.region);
    if (selfTransfer) for (const s of segments.slice(1)) b = mergeBags(b, bagsFor(s.carrier, brand, longHaul, cabin, s.from.region));
    bags[brand] = b;
  }
  return { prices, bags, longHaul };
}

/* ------------------------------------------------------------------ generation */

const sliceCache = new Map<string, DemoSlice[]>();
export const MAX_ADVANCE_DAYS = 331;

/**
 * All demo itineraries for one direction A→B on `date` (local departure date at A).
 * Returns [] for past dates or beyond the airlines' booking horizon (331 days).
 */
export function generateSlices(a: AirportInfo, b: AirportInfo, date: string, cabin: CabinClass, ctx: EngineContext): DemoSlice[] {
  const ahead = daysBetween(ctx.today, date);
  if (ahead < 0 || ahead > MAX_ADVANCE_DAYS || sameMetro(a, b)) return [];
  const ck = `${a.iata}|${b.iata}|${date}|${cabin}|${ctx.today}`;
  const hit = sliceCache.get(ck);
  if (hit) return hit;

  const out: DemoSlice[] = [];
  const nonstops = nonstopCarriers(a, b, ctx.dir).length;
  const direct = distanceKm(a, b);
  const nonstopEstimate = blockMinutes({ carrier: AIRLINES[0]!, from: a, to: b, distanceKm: direct });
  const maxTotal = Math.max(nonstopEstimate * 2.2, nonstopEstimate + 600);

  const push = (segs: DemoSegment[], r: Routing) => {
    const last = segs[segs.length - 1]!;
    const durationMinutes = Math.round((last.arrUtc - segs[0]!.depUtc) / 60_000);
    if (segs.length > 1 && durationMinutes > maxTotal) return;
    const key = segs.map((s) => s.flightNumber + s.from.iata).join("-");
    if (out.some((o) => o.key === key)) return;
    out.push({ key, from: a, to: b, date, segments: segs, selfTransfer: r.selfTransfer, group: r.group, durationMinutes, ...priceSlice(segs, a, b, date, cabin, r.selfTransfer, nonstops, ctx) });
  };

  for (const r of routings(a, b, ctx.dir)) {
    const [s1, ...rest] = r.services;
    if (!s1) continue;
    const firsts = departures(s1, date);
    if (rest.length === 0) {
      for (const dep of firsts) push([segmentFrom(s1, date, dep)], r);
      continue;
    }
    // Connections: up to three first-leg departures, each with the first viable onward flight (plus a longer alternative).
    const picks = firsts.length <= 3 ? firsts : [firsts[0]!, firsts[Math.floor(firsts.length / 2)]!, firsts[firsts.length - 1]!];
    for (const dep of picks) {
      const chains: DemoSegment[][] = [[segmentFrom(s1, date, dep)]];
      let prev = s1;
      for (const next of rest) {
        const grown: DemoSegment[][] = [];
        for (const chain of chains) {
          const lastSeg = chain[chain.length - 1]!;
          const min = lastSeg.arrUtc + mct(prev, next, r.selfTransfer) * 60_000;
          let cands = nextConnections(next, min, lastSeg.arrUtc + 8 * 3_600_000, 2);
          if (cands.length === 0) cands = nextConnections(next, min, lastSeg.arrUtc + 20 * 3_600_000, 1);
          for (const c of cands.slice(0, rest.length > 1 ? 1 : 2)) grown.push([...chain, c]);
        }
        chains.splice(0, chains.length, ...grown);
        prev = next;
      }
      for (const chain of chains) push(chain, r);
    }
  }

  // Keep every nonstop, then the most sensible connections.
  const score = (s: DemoSlice) => (s.prices.basic ?? s.prices.main ?? 0) / 100 + s.durationMinutes * 0.9;
  const ns = out.filter((s) => s.segments.length === 1);
  const conn = out.filter((s) => s.segments.length > 1).sort((p, q) => score(p) - score(q)).slice(0, Math.max(18, 60 - ns.length));
  const result = [...ns, ...conn];
  if (sliceCache.size > 4000) sliceCache.clear();
  sliceCache.set(ck, result);
  return result;
}

/** Cheapest per-adult price (any brand) per ticketing group — used by calendar/explore/alerts. */
export function cheapestByGroup(slices: DemoSlice[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slices) {
    const p = Math.min(...Object.values(s.prices));
    const cur = m.get(s.group);
    if (cur === undefined || p < cur) m.set(s.group, p);
  }
  return m;
}

/** Round-trip discount applied to the sum of both directions (same ticketing group). */
export const ROUND_TRIP_FACTOR = 0.9;
export const MULTI_CITY_FACTOR = 0.97;

export function combinePrices(slices: DemoSlice[], factor: number): FareOption[] {
  const brands: FareBrand[] = ["basic", "main", "flex"];
  const out: FareOption[] = [];
  for (const brand of brands) {
    if (!slices.every((s) => s.prices[brand] !== undefined)) continue;
    const sum = slices.reduce((n, s) => n + (s.prices[brand] ?? 0), 0);
    const price = slices.length > 1 ? Math.round((sum * factor) / 100) * 100 : sum;
    const bags = slices.map((s) => s.bags[brand]!).reduce((x, y) => mergeBags(x, y));
    out.push({ brand, pricePerAdultCents: price, totalPriceCents: price, baggage: bags, refundable: brand === "flex", changeable: brand !== "basic", seatSelection: brand === "flex" ? "included" : "fee" });
  }
  return out.sort((p, q) => p.pricePerAdultCents - q.pricePerAdultCents);
}

/** Total for a party: children 75 %, lap infants 10 % of the adult fare. */
export function partyTotal(perAdult: number, adults: number, children: number, infants: number): number {
  return perAdult * adults + Math.round((perAdult * 0.75) / 100) * 100 * children + Math.round((perAdult * 0.1) / 100) * 100 * infants;
}
