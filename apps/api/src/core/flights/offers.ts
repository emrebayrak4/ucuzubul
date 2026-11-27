/**
 * Builds contract FlightOffers from demo slices (one-way / round trip / multi-city) and from live adapter fares.
 */
import type { Airline, CabinClass, FlightLayover, FlightOffer, FlightSegment, FlightSlice } from "@pricora/contracts";
import type { FlightOffer as AdapterFlightOffer } from "@pricora/retailer-adapters";
import { AIRLINE_BY_CODE, OPERATOR_NAMES } from "./airlines";
import { combinePrices, hash32, MULTI_CITY_FACTOR, partyTotal, ROUND_TRIP_FACTOR, type DemoSlice } from "./demo-engine";
import { toLocalIso } from "./geo";

export type AirlineLookup = (code: string | null | undefined, name?: string | null) => Airline;

/** Airline lookup: DB rows (logo) merged with the demo network catalog (name, alliance). */
export function airlineLookup(rows: Array<{ iata: string; name: string; logoUrl: string | null }>): AirlineLookup {
  const byCode = new Map(rows.map((a) => [a.iata.trim(), a]));
  return (code, name) => {
    const c = (code ?? "").toUpperCase().trim();
    const row = byCode.get(c);
    const info = AIRLINE_BY_CODE.get(c);
    return {
      iata: /^[A-Z0-9]{2}$/.test(c) ? c : "XX",
      name: row?.name ?? info?.name ?? OPERATOR_NAMES[c] ?? name ?? (c || "Unknown airline"),
      logoUrl: row?.logoUrl ?? null,
      alliance: info?.alliance ?? null,
    };
  };
}

/** Connections between consecutive segments (works for demo and live slices). */
export function computeLayovers(segments: FlightSegment[], selfTransfer = false): FlightLayover[] {
  const out: FlightLayover[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i]!;
    const b = segments[i + 1]!;
    out.push({
      airport: a.to,
      nextAirport: b.from,
      durationMinutes: Math.round((Date.parse(b.departAt) - Date.parse(a.arriveAt)) / 60_000),
      overnight: a.arriveAt.slice(0, 10) !== b.departAt.slice(0, 10),
      changeAirport: a.to !== b.from,
      selfTransfer,
    });
  }
  return out;
}

function toSlice(s: DemoSlice, airline: AirlineLookup): FlightSlice {
  const segments: FlightSegment[] = s.segments.map((g) => ({
    marketingCarrier: airline(g.carrier.iata),
    operatingCarrier: g.operator ? { iata: g.operator.iata, name: g.operator.name, logoUrl: null, alliance: null } : null,
    flightNumber: g.flightNumber,
    from: g.from.iata,
    to: g.to.iata,
    departAt: toLocalIso(g.depUtc, g.from.tz),
    arriveAt: toLocalIso(g.arrUtc, g.to.tz),
    durationMinutes: g.durationMinutes,
    aircraft: g.aircraft,
  }));
  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  return {
    from: first.from,
    to: last.to,
    departAt: first.departAt,
    arriveAt: last.arriveAt,
    durationMinutes: s.durationMinutes,
    stops: segments.length - 1,
    segments,
    layovers: computeLayovers(segments, s.selfTransfer),
  };
}

export interface Party {
  adults: number;
  children: number;
  infants: number;
}

export function demoOffer(slices: DemoSlice[], trip: "oneway" | "round" | "multi", cabin: CabinClass, party: Party, airline: AirlineLookup, now: string): FlightOffer | null {
  const factor = trip === "round" ? ROUND_TRIP_FACTOR : trip === "multi" ? MULTI_CITY_FACTOR : 1;
  const options = combinePrices(slices, factor).map((o) => ({ ...o, totalPriceCents: partyTotal(o.pricePerAdultCents, party.adults, party.children, party.infants) }));
  const cheapest = options[0];
  if (!cheapest) return null;
  const id = `demo-${hash32(`${slices.map((s) => `${s.key}@${s.date}`).join("|")}|${cabin}`).toString(36)}${hash32(slices.map((s) => s.date).join()).toString(36)}`;
  return {
    id,
    provider: { id: "demo", name: "Demo fares" },
    totalPriceCents: cheapest.totalPriceCents,
    currency: "USD",
    pricePerAdultCents: cheapest.pricePerAdultCents,
    cabin,
    slices: slices.map((s) => toSlice(s, airline)),
    baggage: cheapest.baggage,
    refundable: cheapest.refundable,
    goUrl: "",
    source: "demo",
    expiresAt: null,
    fetchedAt: now,
    fareBrand: cheapest.brand,
    fareOptions: options,
    selfTransfer: slices.some((s) => s.selfTransfer),
    providerCount: 1,
    bookable: false,
  };
}

const minPrice = (s: DemoSlice) => Math.min(...Object.values(s.prices));
const quickScore = (s: DemoSlice) => minPrice(s) / 100 + s.durationMinutes * 0.9 + (s.selfTransfer ? 80 : 0);

/** Round trips pair within a ticketing group: each outbound with the cheapest, fastest and one more return. */
export function pairRoundTrips(out: DemoSlice[], back: DemoSlice[], max = 160): DemoSlice[][] {
  const byGroup = new Map<string, DemoSlice[]>();
  for (const b of back) byGroup.set(b.group, [...(byGroup.get(b.group) ?? []), b]);
  const cheapestOut = new Map<string, DemoSlice>();
  for (const o of out) {
    const cur = cheapestOut.get(o.group);
    if (!cur || minPrice(o) < minPrice(cur)) cheapestOut.set(o.group, o);
  }
  const ranked = [...out].sort((p, q) => quickScore(p) - quickScore(q));
  const chosen = [...new Set([...cheapestOut.values(), ...ranked.slice(0, 48)])];
  const pairs: DemoSlice[][] = [];
  const seen = new Set<string>();
  for (const o of chosen) {
    const rets = byGroup.get(o.group);
    if (!rets?.length) continue;
    const cheapest = rets.reduce((m, r) => (minPrice(r) < minPrice(m) ? r : m));
    const fastest = rets.reduce((m, r) => (r.durationMinutes < m.durationMinutes ? r : m));
    const sameCarrier = rets.find((r) => r.segments[0]!.carrier.iata === o.segments[0]!.carrier.iata && r !== cheapest);
    for (const r of [cheapest, fastest, sameCarrier]) {
      if (!r) continue;
      const k = `${o.key}|${r.key}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([o, r]);
    }
  }
  // Always keep each group’s cheapest pair (price calendar consistency), then the best-scored rest.
  const keep = pairs.filter((p) => cheapestOut.get(p[0]!.group) === p[0]);
  const rest = pairs.filter((p) => !keep.includes(p)).sort((p, q) => quickScore(p[0]!) + quickScore(p[1]!) - quickScore(q[0]!) - quickScore(q[1]!));
  return [...keep, ...rest].slice(0, Math.max(max, keep.length));
}

/** Multi-city: best few options per leg, combined (capped). */
export function combineMultiCity(legs: DemoSlice[][], max = 90): DemoSlice[][] {
  const per = legs.map((l) => [...l].sort((p, q) => quickScore(p) - quickScore(q)).slice(0, legs.length > 3 ? 3 : 5));
  let combos: DemoSlice[][] = [[]];
  for (const opts of per) {
    const next: DemoSlice[][] = [];
    for (const c of combos) for (const o of opts) next.push([...c, o]);
    combos = next.sort((p, q) => p.reduce((n, s) => n + quickScore(s), 0) - q.reduce((n, s) => n + quickScore(s), 0)).slice(0, max * 2);
  }
  // A leg can't depart before the previous one lands.
  return combos.filter((c) => c.every((s, i) => i === 0 || s.segments[0]!.depUtc > c[i - 1]!.segments[c[i - 1]!.segments.length - 1]!.arrUtc + 3_600_000)).slice(0, max);
}

/* ------------------------------------------------------------------ live adapter fares */

export function mapAdapterFare(o: AdapterFlightOffer, cabin: CabinClass, adults: number, providerName: string, airline: AirlineLookup): FlightOffer | null {
  const slices: FlightSlice[] = [];
  for (const s of o.slices) {
    const segments: FlightSegment[] = s.segments.map((g) => ({
      marketingCarrier: airline(g.marketingCarrier),
      operatingCarrier: g.operatingCarrier ? airline(g.operatingCarrier, g.operatingCarrierName) : null,
      flightNumber: `${g.marketingCarrier ?? ""}${g.marketingFlightNumber ?? ""}`,
      from: g.origin,
      to: g.destination,
      departAt: g.departAt,
      arriveAt: g.arriveAt,
      durationMinutes: g.durationMinutes ?? Math.max(1, Math.round((Date.parse(g.arriveAt) - Date.parse(g.departAt)) / 60_000)),
      aircraft: null,
    }));
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
      layovers: computeLayovers(segments),
    });
  }
  if (slices.length === 0 || slices.length > 5) return null;
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
    fareBrand: null,
    selfTransfer: false,
    providerCount: 1,
    bookable: Boolean(o.deepLink),
  };
}
