/**
 * Filters, disjunctive facet counts and Best/Cheapest/Fastest sorting over flight offers (live or demo alike).
 */
import type { Alliance, FlightFacets, FlightFilters, FlightOffer, FlightSearchResponse, FlightSort } from "@pricora/contracts";
import type { Party } from "./offers";
import { partyTotal } from "./demo-engine";
import { localMinutes } from "./geo";

export const BEST_RULE =
  "Best ranks every result by a transparent score: 60% price (vs. the cheapest result) + 30% total travel time (vs. the fastest), plus small penalties per stop (5%), for self-transfers (10%) and overnight layovers (5%). Sponsored placement never affects it.";

const totalDuration = (o: FlightOffer) => o.slices.reduce((n, s) => n + s.durationMinutes, 0);
const stopsOf = (o: FlightOffer) => Math.max(...o.slices.map((s) => s.stops));
const carriersOf = (o: FlightOffer) => [...new Set(o.slices.flatMap((s) => s.segments.map((g) => g.marketingCarrier.iata)))];
const layoversOf = (o: FlightOffer) => o.slices.flatMap((s) => s.layovers ?? []);
const layoverAirports = (o: FlightOffer) => [...new Set(layoversOf(o).map((l) => l.airport))];
const maxLayover = (o: FlightOffer) => Math.max(0, ...layoversOf(o).map((l) => l.durationMinutes));
const maxSlice = (o: FlightOffer) => Math.max(...o.slices.map((s) => s.durationMinutes));
const isSelfTransfer = (o: FlightOffer) => Boolean(o.selfTransfer) || layoversOf(o).some((l) => l.selfTransfer);

/**
 * Re-prices an offer for required bags: picks the cheapest fare brand that includes them.
 * Returns null when no fare option satisfies the requirement (or bags are unknown for a live fare).
 */
export function applyBags(o: FlightOffer, bags: Array<"carry_on" | "checked"> | undefined, party: Party): FlightOffer | null {
  if (!bags?.length) return o;
  const ok = (b: FlightOffer["baggage"]) => Boolean(b) && (!bags.includes("carry_on") || (b!.carryOn ?? 0) >= 1) && (!bags.includes("checked") || (b!.checked ?? 0) >= 1);
  if (o.fareOptions?.length) {
    const opt = o.fareOptions.find((f) => ok(f.baggage));
    if (!opt) return null;
    if (opt.brand === o.fareBrand) return o;
    return { ...o, fareBrand: opt.brand, pricePerAdultCents: opt.pricePerAdultCents, totalPriceCents: partyTotal(opt.pricePerAdultCents, party.adults, party.children, party.infants), baggage: opt.baggage, refundable: opt.refundable };
  }
  return ok(o.baggage) ? o : null;
}

type Key = "stops" | "airlines" | "alliances" | "layovers" | "times" | "duration" | "layover" | "bags" | "self";
type Pred = (o: FlightOffer) => boolean;

function predicates(f: FlightFilters): Record<Key, Pred> {
  const inRange = (iso: string, r: { min: number; max: number } | "" | undefined) => !r || (localMinutes(iso) >= r.min && localMinutes(iso) <= r.max);
  return {
    stops: (o) => !f.stops?.length || f.stops.includes(Math.min(2, stopsOf(o))),
    airlines: (o) => !f.airlines?.length || carriersOf(o).every((c) => f.airlines!.includes(c)),
    alliances: (o) => !f.alliances?.length || o.slices.every((s) => s.segments.every((g) => g.marketingCarrier.alliance && f.alliances!.includes(g.marketingCarrier.alliance))),
    layovers: (o) => !f.layovers?.length || layoverAirports(o).every((a) => f.layovers!.includes(a)),
    times: (o) => o.slices.every((s, i) => inRange(s.departAt, f.dep?.[i]) && inRange(s.arriveAt, f.arr?.[i])),
    duration: (o) => f.maxDuration === undefined || maxSlice(o) <= f.maxDuration,
    layover: (o) => f.maxLayover === undefined || maxLayover(o) <= f.maxLayover,
    bags: () => true, // handled by re-pricing (applyBags) before predicates
    self: (o) => !f.hideSelfTransfer || !isSelfTransfer(o),
  };
}

function bestScores(offers: FlightOffer[]): Map<string, number> {
  const m = new Map<string, number>();
  if (offers.length === 0) return m;
  const minP = Math.max(1, Math.min(...offers.map((o) => o.pricePerAdultCents)));
  const minD = Math.max(1, Math.min(...offers.map(totalDuration)));
  for (const o of offers) {
    const stops = o.slices.reduce((n, s) => n + s.stops, 0);
    const overnight = layoversOf(o).filter((l) => l.overnight).length;
    const score = 0.6 * (o.pricePerAdultCents / minP) + 0.3 * (totalDuration(o) / minD) + 0.05 * stops + (isSelfTransfer(o) ? 0.1 : 0) + 0.05 * overnight;
    m.set(o.id, Math.round(score * 1000) / 1000);
  }
  return m;
}

const SORTERS: Record<FlightSort, (a: FlightOffer, b: FlightOffer) => number> = {
  best: (a, b) => (a.bestScore ?? 0) - (b.bestScore ?? 0) || a.pricePerAdultCents - b.pricePerAdultCents,
  cheapest: (a, b) => a.pricePerAdultCents - b.pricePerAdultCents || totalDuration(a) - totalDuration(b),
  fastest: (a, b) => totalDuration(a) - totalDuration(b) || a.pricePerAdultCents - b.pricePerAdultCents,
};

export interface RefineResult {
  offers: FlightOffer[];
  total: number;
  facets: FlightFacets;
  sortSummary: NonNullable<FlightSearchResponse["sortSummary"]>;
}

export function refine(
  all: FlightOffer[],
  f: FlightFilters,
  sort: FlightSort,
  limit: number,
  party: Party,
  airportInfo: (code: string) => { name: string; city: string } | undefined,
): RefineResult {
  const priced = all.map((o) => applyBags(o, f.bags, party)).filter((o): o is FlightOffer => o !== null);
  const preds = predicates(f);
  const keys = Object.keys(preds) as Key[];
  const passAllBut = (o: FlightOffer, skip: Key | null) => keys.every((k) => k === skip || preds[k](o));
  const filtered = priced.filter((o) => passAllBut(o, null));

  const scores = bestScores(filtered);
  const scored = filtered.map((o) => ({ ...o, bestScore: scores.get(o.id) }));
  const top = (s: FlightSort) => {
    const x = [...scored].sort(SORTERS[s])[0];
    return x ? { pricePerAdultCents: x.pricePerAdultCents, durationMinutes: totalDuration(x), offerId: x.id } : null;
  };
  const sortSummary = { best: top("best"), cheapest: top("cheapest"), fastest: top("fastest") };
  scored.sort(SORTERS[sort]);

  // Facets (disjunctive: each facet counts offers passing every *other* filter).
  const acc = () => ({ count: 0, minPriceCents: null as number | null });
  const bump = (v: { count: number; minPriceCents: number | null }, o: FlightOffer) => {
    v.count++;
    if (v.minPriceCents === null || o.pricePerAdultCents < v.minPriceCents) v.minPriceCents = o.pricePerAdultCents;
  };
  const stops = [0, 1, 2].map((value) => ({ value, ...acc() }));
  for (const o of priced) if (passAllBut(o, "stops")) bump(stops[Math.min(2, stopsOf(o))]!, o);

  const airlines = new Map<string, { iata: string; name: string; alliance: Alliance | null; count: number; minPriceCents: number | null }>();
  for (const o of priced) {
    if (!passAllBut(o, "airlines")) continue;
    for (const s of o.slices)
      for (const g of s.segments) {
        const c = g.marketingCarrier;
        if (!airlines.has(c.iata)) airlines.set(c.iata, { iata: c.iata, name: c.name, alliance: c.alliance ?? null, ...acc() });
      }
    for (const c of carriersOf(o)) bump(airlines.get(c)!, o);
  }

  const alliances = new Map<Alliance, { value: Alliance; count: number; minPriceCents: number | null }>();
  for (const o of priced) {
    if (!passAllBut(o, "alliances")) continue;
    const set = new Set(o.slices.flatMap((s) => s.segments.map((g) => g.marketingCarrier.alliance ?? null)));
    if (set.size !== 1) continue;
    const a = [...set][0];
    if (!a) continue;
    if (!alliances.has(a)) alliances.set(a, { value: a, ...acc() });
    bump(alliances.get(a)!, o);
  }

  const lays = new Map<string, { iata: string; name: string; city: string; count: number; minPriceCents: number | null }>();
  for (const o of priced) {
    if (!passAllBut(o, "layovers")) continue;
    for (const code of layoverAirports(o)) {
      if (!lays.has(code)) {
        const info = airportInfo(code);
        lays.set(code, { iata: code, name: info?.name ?? code, city: info?.city ?? code, ...acc() });
      }
      bump(lays.get(code)!, o);
    }
  }

  const carryOn = acc();
  const checked = acc();
  for (const o of all) {
    if (!passAllBut(o, "bags")) continue;
    const c = applyBags(o, ["carry_on"], party);
    if (c) bump(carryOn, c);
    const k = applyBags(o, ["checked"], party);
    if (k) bump(checked, k);
  }
  const selfTransfer = acc();
  for (const o of priced) if (passAllBut(o, "self") && isSelfTransfer(o)) bump(selfTransfer, o);

  const legs = Math.max(0, ...priced.map((o) => o.slices.length));
  const legTimes = Array.from({ length: legs }, (_, i) => {
    const sl = priced.map((o) => o.slices[i]).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const dep = sl.map((s) => localMinutes(s.departAt));
    const arr = sl.map((s) => localMinutes(s.arriveAt));
    return { from: sl[0]?.from ?? "XXX", to: sl[0]?.to ?? "XXX", depMin: Math.min(...dep), depMax: Math.max(...dep), arrMin: Math.min(...arr), arrMax: Math.max(...arr) };
  });
  const durs = priced.map(maxSlice);
  const layMins = priced.filter((o) => stopsOf(o) > 0).map(maxLayover);

  return {
    offers: scored.slice(0, limit),
    total: scored.length,
    sortSummary,
    facets: {
      stops,
      airlines: [...airlines.values()].sort((a, b) => (a.minPriceCents ?? Infinity) - (b.minPriceCents ?? Infinity)),
      alliances: [...alliances.values()].sort((a, b) => b.count - a.count),
      layoverAirports: [...lays.values()].sort((a, b) => b.count - a.count),
      bags: { carryOn, checked },
      selfTransfer,
      legTimes,
      duration: { min: durs.length ? Math.min(...durs) : 0, max: durs.length ? Math.max(...durs) : 0 },
      layover: { min: layMins.length ? Math.min(...layMins) : 0, max: layMins.length ? Math.max(...layMins) : 0 },
    },
  };
}
