/**
 * Pure hotel search logic: stay pricing from stored demo room series, filters, disjunctive facets, sort.
 * No I/O here — the controller loads rows and hands them in.
 */
import {
  BOARD_TYPE_LABELS,
  HOTEL_ACCESSIBILITY_LABELS,
  HOTEL_AMENITY_LABELS,
  HOTEL_PROPERTY_TYPE_LABELS,
  type BoardType,
  type HotelFacetBucket,
  type HotelFacets,
  type HotelMapPin,
  type HotelPropertyType,
  type HotelSearchQuery,
  type HotelSort,
  type HotelSummary,
} from "@pricora/contracts";

export const DAY_MS = 86_400_000;
export const nightsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS));

/** Estimated taxes & fees share by country (shown as "estimated" — providers' own figures replace it). */
const TAX_RATE: Record<string, number> = { US: 0.16, CA: 0.15, GB: 0.2, FR: 0.12, IT: 0.12, ES: 0.12, DE: 0.1, NL: 0.15, AE: 0.2, JP: 0.12, MX: 0.19, TH: 0.17 };
export const estimatedTaxRate = (country: string) => TAX_RATE[country] ?? 0.12;

export type RatePlanJson = { code: string; name: string; refundable: boolean; boardType: BoardType; payLater: boolean; priceFactor: number };

export function parseRatePlans(json: unknown): RatePlanJson[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((p): RatePlanJson[] => {
    if (typeof p !== "object" || p === null) return [];
    const o = p as Record<string, unknown>;
    if (typeof o["code"] !== "string" || typeof o["name"] !== "string" || typeof o["priceFactor"] !== "number") return [];
    const board = typeof o["boardType"] === "string" && o["boardType"] in BOARD_TYPE_LABELS ? (o["boardType"] as BoardType) : "room_only";
    return [{ code: o["code"], name: o["name"], refundable: o["refundable"] === true, boardType: board, payLater: o["payLater"] === true, priceFactor: o["priceFactor"] }];
  });
}

export type DemoRoomRow = {
  id: string;
  name: string;
  bedConfig: string;
  sizeSqm: number | null;
  maxOccupancy: number;
  amenities: string[];
  ratePlans: unknown;
  demoRatesFrom: Date | null;
  demoNightlyCents: number[];
  sortOrder: number;
};

export type StayPrice = { plan: RatePlanJson; nightlyCents: number; subtotalCents: number; taxesCents: number; totalCents: number };

/**
 * Prices every rate plan of a demo room for the stay from the stored daily series.
 * Returns null when any night falls outside the stored window (no availability — never extrapolated).
 */
export function priceDemoRoom(room: DemoRoomRow, checkin: string, checkout: string, rooms: number, country: string): StayPrice[] | null {
  if (!room.demoRatesFrom || room.demoNightlyCents.length === 0) return null;
  const start = Math.round((Date.parse(checkin) - room.demoRatesFrom.getTime()) / DAY_MS);
  const nights = nightsBetween(checkin, checkout);
  if (start < 0 || start + nights > room.demoNightlyCents.length) return null;
  let base = 0;
  for (let i = start; i < start + nights; i++) base += room.demoNightlyCents[i] ?? 0;
  const tax = estimatedTaxRate(country);
  return parseRatePlans(room.ratePlans).map((plan) => {
    const subtotal = Math.round((base * plan.priceFactor) / 100) * 100 * rooms;
    const taxes = Math.round(subtotal * tax);
    return { plan, nightlyCents: Math.round(subtotal / nights / rooms), subtotalCents: subtotal, taxesCents: taxes, totalCents: subtotal + taxes };
  });
}

/** Everything the filters/facets/sort need about one hotel for the requested stay. */
export type HotelCandidate = {
  summary: HotelSummary;
  accessibility: string[];
  meals: BoardType[];
};

/* ---------------- filters & facets ---------------- */

type Filters = Pick<
  HotelSearchQuery,
  "minPrice" | "maxPrice" | "minStars" | "stars" | "types" | "amenities" | "meals" | "freeCancellation" | "payAtProperty" | "maxDistanceKm" | "neighborhoods" | "accessibility" | "chains" | "bbox"
>;
type FacetKey = "price" | "stars" | "types" | "amenities" | "meals" | "freeCancellation" | "payAtProperty" | "distance" | "neighborhoods" | "accessibility" | "chains" | "bbox";

function predicates(f: Filters): Array<[FacetKey, (c: HotelCandidate) => boolean]> {
  const out: Array<[FacetKey, (c: HotelCandidate) => boolean]> = [];
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    out.push(["price", (c) => {
      const p = c.summary.lowestNightlyCents;
      return p !== null && (f.minPrice === undefined || p >= f.minPrice) && (f.maxPrice === undefined || p <= f.maxPrice);
    }]);
  }
  if (f.stars.length || f.minStars) {
    out.push(["stars", (c) => {
      const s = Math.round(c.summary.stars ?? 0);
      return (f.stars.length === 0 || f.stars.includes(s)) && (!f.minStars || s >= f.minStars);
    }]);
  }
  if (f.types.length) out.push(["types", (c) => f.types.includes(c.summary.propertyType)]);
  if (f.amenities.length) out.push(["amenities", (c) => f.amenities.every((a) => c.summary.amenities.includes(a))]);
  if (f.meals.length) out.push(["meals", (c) => f.meals.some((m) => c.meals.includes(m))]);
  if (f.freeCancellation) out.push(["freeCancellation", (c) => c.summary.freeCancellation]);
  if (f.payAtProperty) out.push(["payAtProperty", (c) => c.summary.payAtProperty]);
  if (f.maxDistanceKm !== undefined) out.push(["distance", (c) => c.summary.distanceKm !== null && c.summary.distanceKm <= (f.maxDistanceKm ?? 0)]);
  if (f.neighborhoods.length) out.push(["neighborhoods", (c) => c.summary.neighborhood !== null && f.neighborhoods.includes(c.summary.neighborhood)]);
  if (f.accessibility.length) out.push(["accessibility", (c) => f.accessibility.every((a) => c.accessibility.includes(a))]);
  if (f.chains.length) out.push(["chains", (c) => (c.summary.chain === null ? f.chains.includes("independent") : f.chains.includes(c.summary.chain))]);
  if (f.bbox) {
    const b = f.bbox;
    out.push(["bbox", (c) => c.summary.lat !== null && c.summary.lon !== null && c.summary.lat >= b.minLat && c.summary.lat <= b.maxLat && c.summary.lon >= b.minLng && c.summary.lon <= b.maxLng]);
  }
  return out;
}

export function applyFilters(items: HotelCandidate[], f: Filters, except?: FacetKey): HotelCandidate[] {
  const preds = predicates(f).filter(([k]) => k !== except);
  return items.filter((c) => preds.every(([, p]) => p(c)));
}

function bucketize(values: Iterable<string>, label: (v: string) => string, order?: (a: HotelFacetBucket, b: HotelFacetBucket) => number): HotelFacetBucket[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, count]) => ({ value, label: label(value), count })).sort(order ?? ((a, b) => b.count - a.count || a.label.localeCompare(b.label)));
}

export const DISTANCE_STEPS = [1, 3, 5, 10] as const;

/**
 * Facet counts. OR-facets (types, stars, meals, neighborhoods, chains, distance, price) are counted with every
 * other filter applied but not their own; AND-facets (amenities, accessibility) are counted on the filtered set.
 */
export function buildFacets(all: HotelCandidate[], f: Filters, selected: { amenities: string[]; accessibility: string[] }): HotelFacets {
  const filtered = applyFilters(all, f);
  const without = (k: FacetKey) => applyFilters(all, f, k);

  const priceBase = without("price").map((c) => c.summary.lowestNightlyCents).filter((p): p is number => p !== null);
  let price: HotelFacets["price"] = null;
  if (priceBase.length) {
    const min = Math.floor(Math.min(...priceBase) / 1000) * 1000;
    const max = Math.ceil((Math.max(...priceBase) + 1) / 1000) * 1000;
    const n = 24;
    const bucketCents = Math.max(500, Math.ceil((max - min) / n / 100) * 100);
    const buckets = Array.from({ length: Math.max(1, Math.ceil((max - min) / bucketCents)) }, () => 0);
    for (const p of priceBase) buckets[Math.min(buckets.length - 1, Math.floor((p - min) / bucketCents))]! += 1;
    price = { min, max: min + bucketCents * buckets.length, bucketCents, buckets };
  }

  const amenityCodes = new Set(filtered.flatMap((c) => c.summary.amenities));
  for (const a of selected.amenities) amenityCodes.add(a);
  const amenities = [...amenityCodes]
    .map((code) => ({ value: code, label: HOTEL_AMENITY_LABELS[code] ?? code.replace(/_/g, " "), count: filtered.filter((c) => c.summary.amenities.includes(code)).length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const accCodes = new Set([...filtered.flatMap((c) => c.accessibility), ...selected.accessibility]);
  const accessibility = [...accCodes]
    .map((code) => ({ value: code, label: HOTEL_ACCESSIBILITY_LABELS[code] ?? code.replace(/_/g, " "), count: filtered.filter((c) => c.accessibility.includes(code)).length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const dBase = without("distance");
  return {
    price,
    propertyTypes: bucketize(without("types").map((c) => c.summary.propertyType), (v) => HOTEL_PROPERTY_TYPE_LABELS[v as HotelPropertyType] ?? v),
    stars: bucketize(
      without("stars").map((c) => String(Math.round(c.summary.stars ?? 0))),
      (v) => (v === "0" ? "Unrated" : `${v} star${v === "1" ? "" : "s"}`),
      (a, b) => Number(b.value) - Number(a.value),
    ),
    amenities,
    meals: bucketize(without("meals").flatMap((c) => c.meals.filter((m) => m !== "room_only")), (v) => BOARD_TYPE_LABELS[v as BoardType] ?? v),
    freeCancellation: without("freeCancellation").filter((c) => c.summary.freeCancellation).length,
    payAtProperty: without("payAtProperty").filter((c) => c.summary.payAtProperty).length,
    distance: DISTANCE_STEPS.map((km) => ({ value: String(km), label: `Less than ${km} km`, count: dBase.filter((c) => c.summary.distanceKm !== null && c.summary.distanceKm <= km).length })).filter(
      (b) => b.count > 0,
    ),
    neighborhoods: bucketize(without("neighborhoods").flatMap((c) => (c.summary.neighborhood ? [c.summary.neighborhood] : [])), (v) => v),
    accessibility,
    chains: bucketize(without("chains").map((c) => c.summary.chain ?? "independent"), (v) => (v === "independent" ? "Independent / no chain" : v)),
  };
}

/* ---------------- sort ---------------- */

/** "Our top picks": value score — lower is better. Mirrors HOTEL_TOP_PICKS_RULE. Sponsored data never enters it. */
export function topPickScore(h: HotelSummary): number {
  if (h.lowestTotalCents === null) return Number.POSITIVE_INFINITY;
  const stars = h.stars && h.stars > 0 ? h.stars : 2.5;
  let score = h.lowestTotalCents / (1 + 0.3 * stars);
  if (h.freeCancellation) score *= 0.95;
  if (h.distanceKm !== null && h.distanceKm > 2) score *= 1 + Math.min(0.2, (h.distanceKm - 2) * 0.02);
  return score;
}

export function sortHotels(items: HotelCandidate[], sort: HotelSort): HotelCandidate[] {
  const nullLast = (v: number | null, fallback: number) => (v === null ? fallback : v);
  const cmp: Record<HotelSort, (a: HotelSummary, b: HotelSummary) => number> = {
    top_picks: (a, b) => topPickScore(a) - topPickScore(b),
    price_asc: (a, b) => nullLast(a.lowestNightlyCents, Infinity) - nullLast(b.lowestNightlyCents, Infinity),
    price_desc: (a, b) => nullLast(b.lowestNightlyCents, -Infinity) - nullLast(a.lowestNightlyCents, -Infinity),
    stars_desc: (a, b) => (b.stars ?? 0) - (a.stars ?? 0) || nullLast(a.lowestNightlyCents, Infinity) - nullLast(b.lowestNightlyCents, Infinity),
    distance_asc: (a, b) => nullLast(a.distanceKm, Infinity) - nullLast(b.distanceKm, Infinity),
  };
  // Hotels without availability for the stay always go last, then a stable tiebreak by name.
  return [...items].sort(
    (x, y) => Number(x.summary.lowestNightlyCents === null) - Number(y.summary.lowestNightlyCents === null) || cmp[sort](x.summary, y.summary) || x.summary.name.localeCompare(y.summary.name),
  );
}

export function toPins(items: HotelCandidate[], cap = 500): HotelMapPin[] {
  return items
    .filter((c) => c.summary.lat !== null && c.summary.lon !== null)
    .slice(0, cap)
    .map((c) => ({ id: c.summary.id, name: c.summary.name, lat: c.summary.lat ?? 0, lon: c.summary.lon ?? 0, lowestNightlyCents: c.summary.lowestNightlyCents, stars: c.summary.stars, source: c.summary.source }));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : Math.round(((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2);
}
