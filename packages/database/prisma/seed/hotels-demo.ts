/**
 * Demo hotel inventory for every published city guide (≈8–15 fictional "Demo …" properties per city).
 *
 * - Deterministic: same guide slug + index → same hotel, rooms and price curve (prices are anchored to the run date).
 * - Everything is `source = "demo"`; names start with "Demo", descriptions say "not a real property".
 * - Only touches demo hotels (source = demo). Live/provider hotels and all other tables are left alone.
 * - No reviews, ratings or review counts are generated.
 *
 *   pnpm -C packages/database seed:hotels
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createPrismaClient, type Prisma, type PrismaClient } from "../../src/index";

export const DEMO_RATE_DAYS = 180;
const DAY_MS = 86_400_000;

/* ---------------- deterministic helpers ---------------- */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rngFor(seed: string): () => number {
  let a = hashStr(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)] as T;
const chance = (r: Rng, p: number) => r() < p;
function weighted<T extends string>(r: Rng, w: Partial<Record<T, number>>): T {
  const entries = Object.entries(w) as Array<[T, number]>;
  const total = entries.reduce((n, [, v]) => n + v, 0);
  let x = r() * total;
  for (const [k, v] of entries) {
    x -= v;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}
/** Offset a point by km at a bearing (degrees). */
function offset(lat: number, lng: number, km: number, bearingDeg: number): { lat: number; lng: number } {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (km * Math.cos(b)) / 110.574;
  const dLng = (km * Math.sin(b)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat: +(lat + dLat).toFixed(6), lng: +(lng + dLng).toFixed(6) };
}

/* ---------------- city tuning ---------------- */
/** Guide city → GeoNames lookup name when they differ (guide links can point at an airport suburb). */
const CITY_LOOKUP: Record<string, string[]> = {
  "new-york": ["New York City", "New York"],
  "washington-dc": ["Washington"],
  bali: ["Denpasar"],
  cancun: ["Cancún"],
  marrakech: ["Marrakesh"],
  montreal: ["Montréal"],
  reykjavik: ["Reykjavík"],
  "hong-kong": ["Hong Kong"],
};
/** Price level vs. a mid-priced US city (1.0). */
const COST: Record<string, number> = {
  "new-york": 1.65, london: 1.55, paris: 1.45, "san-francisco": 1.45, honolulu: 1.5, boston: 1.4, venice: 1.45, dubai: 1.3, singapore: 1.35,
  "los-angeles": 1.3, miami: 1.3, "washington-dc": 1.3, seattle: 1.2, sydney: 1.2, "hong-kong": 1.25, amsterdam: 1.35, reykjavik: 1.35, tokyo: 1.1,
  "san-diego": 1.15, chicago: 1.1, vancouver: 1.15, toronto: 1.05, dublin: 1.25, edinburgh: 1.15, florence: 1.15, rome: 1.15, barcelona: 1.1,
  kyoto: 1.05, nashville: 1.15, austin: 1.1, denver: 1.0, "new-orleans": 1.0, philadelphia: 1.0, atlanta: 0.95, orlando: 0.9, "las-vegas": 0.75,
  madrid: 0.95, lisbon: 0.9, melbourne: 1.0, montreal: 0.95, berlin: 0.9, vienna: 0.95, prague: 0.75, budapest: 0.65, athens: 0.8, seoul: 0.85,
  "san-juan": 1.0, "punta-cana": 1.0, cancun: 1.0, istanbul: 0.7, marrakech: 0.6, "cape-town": 0.65, "rio-de-janeiro": 0.65, "buenos-aires": 0.55,
  "mexico-city": 0.65, cartagena: 0.6, lima: 0.55, cusco: 0.5, bangkok: 0.5, bali: 0.55,
};
const BEACH = new Set(["cancun", "punta-cana", "bali", "honolulu", "miami", "san-juan", "cartagena", "rio-de-janeiro", "san-diego", "cape-town", "dubai", "sydney", "barcelona", "los-angeles"]);
/** Map anchor when the GeoNames point sits at the water's edge (keeps fictional pins on land more often). */
const CENTER_OVERRIDE: Record<string, { lat: number; lng: number }> = {
  "new-york": { lat: 40.7549, lng: -73.984 },
  "san-francisco": { lat: 37.7793, lng: -122.4193 },
  chicago: { lat: 41.8919, lng: -87.6411 },
  miami: { lat: 25.7743, lng: -80.2102 },
  istanbul: { lat: 41.0256, lng: 28.9744 },
  sydney: { lat: -33.8732, lng: 151.2066 },
  "hong-kong": { lat: 22.3027, lng: 114.1772 },
  "rio-de-janeiro": { lat: -22.9519, lng: -43.1907 },
};
/** Long-axis bearing (degrees) for narrow cities. */
const AXIS: Record<string, number> = { "new-york": 29, venice: 90, "san-juan": 90, "hong-kong": 90 };
const SOUTHERN = new Set(["sydney", "melbourne", "cape-town", "buenos-aires", "rio-de-janeiro", "lima", "cusco", "bali"]);

const CHAINS = ["Demo Northstar Collection", "Demo Harborline Hotels", "Demo Urbanist Stays", "Demo Coral Coast Resorts", "Demo Lantern Inns", "Demo Meridian Lane"] as const;

type PType = "hotel" | "apartment" | "resort" | "villa" | "hostel" | "guest_house" | "bed_and_breakfast" | "motel" | "boutique";
const NAME_NOUNS: Record<PType, string[]> = {
  hotel: ["Hotel", "Plaza Hotel", "Grand Hotel", "Central Hotel", "Park Hotel", "Hotel & Suites", "Gate Hotel", "Square Hotel"],
  boutique: ["Atelier Hotel", "House", "Loft Hotel", "Townhouse", "Maison"],
  apartment: ["Apartments", "Residences", "City Flats", "Serviced Apartments"],
  resort: ["Resort & Spa", "Beach Resort", "Bay Resort", "Resort"],
  villa: ["Villas", "Villa Retreat", "Private Villas"],
  hostel: ["Hostel", "Backpackers", "Social Hostel"],
  guest_house: ["Guest House", "Pension", "Rooms"],
  bed_and_breakfast: ["Bed & Breakfast", "B&B", "Inn"],
  motel: ["Motor Inn", "Motel"],
};

type RoomTpl = { code: string; name: string; bed: string; sqm: number; occ: number; mult: number; amenities: string[] };
const ROOMS: Record<PType, RoomTpl[]> = {
  hotel: [
    { code: "std_queen", name: "Standard Queen Room", bed: "1 queen bed", sqm: 22, occ: 2, mult: 1, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv"] },
    { code: "std_two_double", name: "Standard Room, 2 Double Beds", bed: "2 double beds", sqm: 27, occ: 4, mult: 1.12, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv"] },
    { code: "deluxe_king", name: "Deluxe King Room", bed: "1 king bed", sqm: 30, occ: 2, mult: 1.25, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv", "coffee_maker", "desk"] },
    { code: "junior_suite", name: "Junior Suite", bed: "1 king bed and 1 sofa bed", sqm: 44, occ: 3, mult: 1.6, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv", "coffee_maker", "seating_area"] },
    { code: "family", name: "Family Room", bed: "2 queen beds", sqm: 36, occ: 4, mult: 1.4, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv"] },
    { code: "exec_suite", name: "Executive Suite", bed: "1 king bed", sqm: 60, occ: 3, mult: 2.2, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv", "coffee_maker", "separate_living_room", "bathtub"] },
  ],
  boutique: [
    { code: "cozy_double", name: "Cozy Double Room", bed: "1 double bed", sqm: 18, occ: 2, mult: 0.9, amenities: ["air_conditioning", "wifi", "private_bathroom"] },
    { code: "superior_king", name: "Superior King Room", bed: "1 king bed", sqm: 26, occ: 2, mult: 1.15, amenities: ["air_conditioning", "wifi", "private_bathroom", "coffee_maker"] },
    { code: "balcony_king", name: "King Room with Balcony", bed: "1 king bed", sqm: 28, occ: 2, mult: 1.35, amenities: ["air_conditioning", "wifi", "private_bathroom", "balcony"] },
    { code: "loft_suite", name: "Loft Suite", bed: "1 king bed and 1 sofa bed", sqm: 48, occ: 3, mult: 1.9, amenities: ["air_conditioning", "wifi", "private_bathroom", "seating_area", "bathtub"] },
  ],
  apartment: [
    { code: "studio", name: "Studio Apartment", bed: "1 double bed and 1 sofa bed", sqm: 30, occ: 3, mult: 0.9, amenities: ["kitchenette", "wifi", "washer", "private_bathroom"] },
    { code: "one_bed", name: "One-Bedroom Apartment", bed: "1 queen bed and 1 sofa bed", sqm: 50, occ: 4, mult: 1.2, amenities: ["kitchen", "wifi", "washer", "private_bathroom", "seating_area"] },
    { code: "two_bed", name: "Two-Bedroom Apartment", bed: "1 king bed and 2 single beds", sqm: 78, occ: 5, mult: 1.75, amenities: ["kitchen", "wifi", "washer", "private_bathroom", "seating_area", "balcony"] },
  ],
  resort: [
    { code: "garden_king", name: "Garden View King Room", bed: "1 king bed", sqm: 34, occ: 2, mult: 1, amenities: ["air_conditioning", "wifi", "private_bathroom", "balcony", "minibar"] },
    { code: "ocean_double", name: "Ocean View Room, 2 Double Beds", bed: "2 double beds", sqm: 38, occ: 4, mult: 1.3, amenities: ["air_conditioning", "wifi", "private_bathroom", "balcony", "minibar", "sea_view"] },
    { code: "beach_suite", name: "Beachfront Suite", bed: "1 king bed and 1 sofa bed", sqm: 62, occ: 3, mult: 1.95, amenities: ["air_conditioning", "wifi", "private_bathroom", "terrace", "minibar", "sea_view", "bathtub"] },
    { code: "family_suite", name: "Family Suite", bed: "1 king bed and 2 single beds", sqm: 70, occ: 5, mult: 1.8, amenities: ["air_conditioning", "wifi", "private_bathroom", "balcony", "minibar"] },
  ],
  villa: [
    { code: "villa_2br", name: "Two-Bedroom Villa with Private Pool", bed: "1 king bed and 2 single beds", sqm: 140, occ: 5, mult: 1, amenities: ["private_pool", "kitchen", "wifi", "air_conditioning", "garden", "washer"] },
    { code: "villa_3br", name: "Three-Bedroom Villa", bed: "2 king beds and 2 single beds", sqm: 210, occ: 8, mult: 1.45, amenities: ["private_pool", "kitchen", "wifi", "air_conditioning", "garden", "washer", "terrace"] },
  ],
  hostel: [
    { code: "dorm6", name: "Bed in 6-Bed Mixed Dormitory", bed: "1 bunk bed (single)", sqm: 4, occ: 1, mult: 0.35, amenities: ["locker", "wifi", "shared_bathroom"] },
    { code: "dorm4f", name: "Bed in 4-Bed Female Dormitory", bed: "1 bunk bed (single)", sqm: 5, occ: 1, mult: 0.42, amenities: ["locker", "wifi", "shared_bathroom"] },
    { code: "private_double", name: "Private Double Room", bed: "1 double bed", sqm: 14, occ: 2, mult: 1, amenities: ["wifi", "private_bathroom"] },
  ],
  guest_house: [
    { code: "double_shared", name: "Double Room with Shared Bathroom", bed: "1 double bed", sqm: 14, occ: 2, mult: 0.85, amenities: ["wifi", "shared_bathroom"] },
    { code: "double_ensuite", name: "Double Room with Private Bathroom", bed: "1 double bed", sqm: 17, occ: 2, mult: 1, amenities: ["wifi", "private_bathroom", "air_conditioning"] },
    { code: "twin", name: "Twin Room", bed: "2 single beds", sqm: 17, occ: 2, mult: 1, amenities: ["wifi", "private_bathroom"] },
  ],
  bed_and_breakfast: [
    { code: "classic_queen", name: "Classic Queen Room", bed: "1 queen bed", sqm: 18, occ: 2, mult: 1, amenities: ["wifi", "private_bathroom"] },
    { code: "garden_room", name: "Garden Room", bed: "1 king bed", sqm: 22, occ: 2, mult: 1.2, amenities: ["wifi", "private_bathroom", "garden_view"] },
    { code: "triple", name: "Triple Room", bed: "1 queen bed and 1 single bed", sqm: 24, occ: 3, mult: 1.3, amenities: ["wifi", "private_bathroom"] },
  ],
  motel: [
    { code: "queen", name: "Queen Room", bed: "1 queen bed", sqm: 20, occ: 2, mult: 1, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv"] },
    { code: "two_queen", name: "Room with 2 Queen Beds", bed: "2 queen beds", sqm: 26, occ: 4, mult: 1.15, amenities: ["air_conditioning", "wifi", "private_bathroom", "tv"] },
  ],
};

const BASE_BY_STARS: Record<number, number> = { 0: 95, 1: 55, 2: 90, 3: 135, 4: 205, 5: 390 };
const TYPE_MULT: Record<PType, number> = { hotel: 1, boutique: 1.15, apartment: 0.95, resort: 1.3, villa: 1.9, hostel: 0.45, guest_house: 0.75, bed_and_breakfast: 0.85, motel: 0.6 };

function starsFor(r: Rng, t: PType): number | null {
  switch (t) {
    case "hostel": return chance(r, 0.4) ? null : pick(r, [1, 2, 2]);
    case "guest_house": return pick(r, [2, 3, 3]);
    case "bed_and_breakfast": return pick(r, [3, 3, 4]);
    case "apartment": return chance(r, 0.5) ? null : pick(r, [3, 4]);
    case "villa": return chance(r, 0.3) ? null : pick(r, [4, 5]);
    case "motel": return 2;
    case "boutique": return pick(r, [4, 4, 5]);
    case "resort": return pick(r, [4, 4, 5, 5]);
    default: return pick(r, [2, 3, 3, 3, 4, 4, 4, 5]);
  }
}

function amenitiesFor(r: Rng, t: PType, stars: number, ctx: { beach: boolean; us: boolean; vegas: boolean }): string[] {
  const a = new Set<string>();
  const add = (code: string, p: number) => chance(r, p) && a.add(code);
  const lodging = t === "hotel" || t === "boutique" || t === "resort" || t === "motel";
  add("wifi", 0.97);
  add("air_conditioning", t === "hostel" ? 0.5 : 0.85);
  add("non_smoking", 0.92);
  if (lodging) add("front_desk_24h", t === "motel" ? 0.5 : 0.9);
  add("parking", t === "motel" || t === "villa" || t === "resort" ? 0.95 : ctx.us ? 0.6 : 0.35);
  add("pool", t === "resort" ? 1 : t === "villa" ? 0.8 : stars >= 4 ? 0.45 : t === "motel" ? 0.4 : 0.1);
  add("fitness_center", t === "resort" ? 0.9 : stars >= 4 ? 0.8 : lodging ? 0.3 : 0.05);
  add("spa", t === "resort" ? 0.8 : stars === 5 ? 0.7 : stars === 4 ? 0.25 : 0.02);
  add("pets", t === "motel" ? 0.6 : t === "hostel" ? 0.05 : 0.25);
  add("airport_shuttle", t === "resort" ? 0.6 : lodging ? 0.2 : 0.05);
  add("ev_charging", ctx.us ? 0.3 : 0.12);
  if (t === "apartment" || t === "villa") a.add("kitchen");
  else add("kitchen", t === "hostel" ? 0.6 : 0.04);
  add("restaurant", t === "resort" ? 1 : stars >= 4 && lodging ? 0.85 : lodging ? 0.4 : 0.05);
  add("bar", t === "resort" ? 1 : t === "hostel" ? 0.5 : stars >= 4 ? 0.8 : lodging ? 0.35 : 0.05);
  if (t === "bed_and_breakfast") a.add("breakfast");
  else add("breakfast", t === "resort" ? 0.95 : lodging ? 0.65 : t === "guest_house" ? 0.5 : t === "hostel" ? 0.35 : 0.1);
  add("beach_access", ctx.beach ? (t === "resort" || t === "villa" ? 0.9 : 0.25) : 0);
  add("casino", ctx.vegas && lodging ? 0.6 : 0);
  add("room_service", stars >= 4 && lodging ? 0.8 : 0.05);
  add("laundry", 0.5);
  add("family_rooms", t === "hostel" ? 0.05 : 0.5);
  add("business_center", stars >= 4 && lodging ? 0.5 : 0.05);
  add("balcony", t === "resort" || t === "villa" ? 0.9 : 0.2);
  if (t === "apartment") a.add("washer");
  add("garden", t === "villa" || t === "bed_and_breakfast" ? 0.7 : 0.1);
  add("kids_club", t === "resort" ? 0.55 : 0);
  return [...a];
}

function accessibilityFor(r: Rng, t: PType, stars: number): string[] {
  const out: string[] = [];
  const base = t === "villa" || t === "hostel" || t === "guest_house" ? 0.25 : stars >= 4 ? 0.85 : 0.55;
  if (chance(r, base)) {
    out.push("wheelchair_accessible");
    if (chance(r, 0.9)) out.push("elevator");
    if (chance(r, 0.65)) out.push("accessible_bathroom");
    if (chance(r, 0.35)) out.push("roll_in_shower");
    if (chance(r, 0.2)) out.push("visual_aids");
    if (chance(r, 0.25)) out.push("hearing_aids");
  } else if (chance(r, 0.4)) out.push("elevator");
  return out;
}

/** Month factor (Jan..Dec) for northern hemisphere; southern shifts by 6 months. Beach towns peak in winter. */
const SEASON_N = [0.82, 0.85, 0.95, 1.0, 1.08, 1.18, 1.25, 1.22, 1.08, 1.02, 0.9, 1.05];
const SEASON_BEACH = [1.25, 1.28, 1.25, 1.12, 0.95, 0.92, 1.02, 1.0, 0.85, 0.88, 1.0, 1.3];

type Plan = { code: string; name: string; refundable: boolean; boardType: "room_only" | "breakfast" | "half_board" | "all_inclusive"; payLater: boolean; priceFactor: number };

function plansFor(r: Rng, t: PType, amenities: string[], payAtProperty: boolean, flexible: boolean, beach: boolean): Plan[] {
  const breakfast = amenities.includes("breakfast");
  const base: "room_only" | "breakfast" = t === "bed_and_breakfast" ? "breakfast" : "room_only";
  const plans: Plan[] = [{ code: "nonref", name: "Non-refundable", refundable: false, boardType: base, payLater: false, priceFactor: 0.88 }];
  if (flexible) plans.push({ code: "flex", name: "Free cancellation", refundable: true, boardType: base, payLater: payAtProperty, priceFactor: 1 });
  if (breakfast && base === "room_only" && t !== "hostel") {
    plans.push(
      flexible
        ? { code: "flex_bb", name: "Free cancellation + breakfast", refundable: true, boardType: "breakfast", payLater: payAtProperty, priceFactor: 1.14 }
        : { code: "nonref_bb", name: "Non-refundable + breakfast", refundable: false, boardType: "breakfast", payLater: false, priceFactor: 1.02 },
    );
  }
  if (t === "resort" && beach) {
    if (chance(r, 0.5)) plans.push({ code: "ai", name: "All-inclusive", refundable: flexible, boardType: "all_inclusive", payLater: false, priceFactor: 1.7 });
    else plans.push({ code: "hb", name: "Breakfast & dinner", refundable: flexible, boardType: "half_board", payLater: false, priceFactor: 1.32 });
  }
  return plans;
}

export type GuideRow = { slug: string; city: string; countryIso2: string; neighborhoods: string[]; tags: string[]; cityId: number | null };

async function resolveCity(prisma: PrismaClient, g: GuideRow): Promise<{ geonameId: number; name: string; lat: number; lng: number; admin1Code: string | null; admin1Name: string | null } | null> {
  for (const name of [...(CITY_LOOKUP[g.slug] ?? []), g.city]) {
    const c = await prisma.city.findFirst({
      where: { countryIso2: g.countryIso2, OR: [{ name: { equals: name, mode: "insensitive" } }, { asciiName: { equals: name, mode: "insensitive" } }] },
      orderBy: { population: "desc" },
      select: { geonameId: true, name: true, lat: true, lng: true, admin1Code: true, admin1Name: true },
    });
    if (c) return c;
  }
  if (g.cityId) return prisma.city.findUnique({ where: { geonameId: g.cityId }, select: { geonameId: true, name: true, lat: true, lng: true, admin1Code: true, admin1Name: true } });
  return null;
}

export function buildDemoHotels(
  g: GuideRow,
  city: { geonameId: number; name: string; lat: number; lng: number; admin1Code: string | null; admin1Name: string | null },
  startUtc: number,
): { hotels: Prisma.HotelCreateManyInput[]; rooms: Prisma.HotelRoomCreateManyInput[] } {
  const r0 = rngFor(`hotels:${g.slug}`);
  const count = 8 + Math.floor(r0() * 8); // 8..15
  const beach = BEACH.has(g.slug) || g.tags.includes("beach");
  const us = g.countryIso2 === "US";
  const cost = COST[g.slug] ?? 1;
  const hoods = g.neighborhoods.length ? g.neighborhoods : ["City Center"];
  const anchors = hoods.map((n, i) => {
    const rr = rngFor(`hood:${g.slug}:${n}`);
    const km = i === 0 ? 0.3 + rr() * 0.6 : 0.8 + rr() * 2.4;
    const axis = AXIS[g.slug];
    // Narrow/coastal cities: spread anchors along the city's long axis so fictional pins stay on land more often.
    const bearing = axis === undefined ? rr() * 360 : axis + (rr() < 0.5 ? 0 : 180) + (rr() - 0.5) * 30;
    return { name: n, ...offset(city.lat, city.lng, axis === undefined ? km : km * 0.8, bearing) };
  });
  const hotels: Prisma.HotelCreateManyInput[] = [];
  const rooms: Prisma.HotelRoomCreateManyInput[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const r = rngFor(`hotel:${g.slug}:${i}`);
    const type = weighted<PType>(r, {
      hotel: 42, boutique: 10, apartment: 12, guest_house: 6, hostel: 6, bed_and_breakfast: 5,
      resort: beach ? 16 : 2, villa: beach ? 8 : 1, motel: us ? 4 : 0,
    });
    const stars = starsFor(r, type);
    const anchor = anchors[i % anchors.length]!;
    const pos = offset(anchor.lat, anchor.lng, r() * (AXIS[g.slug] === undefined ? 0.6 : 0.35), r() * 360);
    const amenities = amenitiesFor(r, type, stars ?? 0, { beach, us, vegas: g.slug === "las-vegas" });
    const payAtProperty = chance(r, type === "hostel" || type === "guest_house" ? 0.7 : 0.45);
    const flexible = chance(r, 0.78);
    const plans = plansFor(r, type, amenities, payAtProperty, flexible, beach);
    let name = "";
    for (let tries = 0; tries < 6 && (!name || usedNames.has(name)); tries++) {
      const prefix = chance(r, 0.6) ? anchor.name : pick(r, [city.name, "Old Town", "Riverside", "Skyline", "Garden", "Harbor", "Avenue", "Lantern", "Cedar", "Linden"]);
      name = `Demo ${prefix} ${pick(r, NAME_NOUNS[type])}`;
    }
    if (usedNames.has(name)) name = `${name} ${i + 1}`;
    usedNames.add(name);
    const chain = (type === "hotel" || type === "resort" || type === "apartment") && chance(r, 0.45) ? pick(r, type === "resort" ? ["Demo Coral Coast Resorts", "Demo Northstar Collection"] : CHAINS) : null;
    const id = `dh_${g.slug}_${String(i + 1).padStart(2, "0")}`;
    const checkin = pick(r, ["14:00", "15:00", "15:00", "16:00"]);
    const checkout = pick(r, ["10:00", "11:00", "11:00", "12:00"]);
    const pets = amenities.includes("pets") ? "Pets allowed on request; charges may apply." : "Pets are not allowed.";
    const typeLabel = type.replace(/_/g, " ").replace("bed and breakfast", "bed & breakfast");
    const starTxt = stars ? `${stars}-star ` : "";
    const base = BASE_BY_STARS[stars ?? 0]! * TYPE_MULT[type] * cost * (0.85 + r() * 0.35);
    const highlights = [
      `${typeLabel[0]!.toUpperCase()}${typeLabel.slice(1)} in ${anchor.name}`,
      flexible ? "Free cancellation on selected rates" : "Non-refundable rates only",
      payAtProperty ? "Pay at the property available" : null,
      amenities.includes("pool") ? "Swimming pool" : null,
      amenities.includes("breakfast") ? "Breakfast available" : null,
      amenities.includes("parking") ? "Parking on site" : null,
      amenities.includes("beach_access") ? "Beach access" : null,
    ].filter((x): x is string => Boolean(x)).slice(0, 5);

    hotels.push({
      id,
      slug: `demo-${g.slug}-${i + 1}`,
      name,
      starRating: stars,
      address: `${anchor.name}, ${city.name} (demo address)`,
      city: city.name,
      region: us ? city.admin1Code : city.admin1Name,
      country: g.countryIso2,
      lat: pos.lat,
      lon: pos.lng,
      cityId: city.geonameId,
      neighborhood: anchor.name,
      propertyType: type,
      chain,
      description:
        `Demo listing — not a real property. This fictional ${starTxt}${typeLabel} in ${anchor.name}, ${city.name} exists so you can try search filters, the map and room comparison. ` +
        `Rates are illustrative demo prices, not offers you can book.`,
      amenities,
      accessibility: accessibilityFor(r, type, stars ?? 0),
      highlights,
      images: [],
      imageUrl: null,
      checkinTime: checkin,
      checkoutTime: checkout,
      payAtProperty,
      houseRules: {
        checkinFrom: checkin,
        checkinUntil: pick(r, ["22:00", "23:00", "00:00", null]),
        checkoutUntil: checkout,
        pets,
        smoking: "Smoking is not allowed.",
        parties: type === "villa" ? "Events by prior arrangement only." : "Parties and events are not allowed.",
        minCheckinAge: us ? 21 : 18,
        quietHours: type === "hostel" || type === "apartment" || type === "villa" ? "22:00–08:00" : null,
      },
      faqs: [
        { q: "What are the check-in and check-out times?", a: `Check-in from ${checkin}, check-out until ${checkout}.` },
        { q: "Is breakfast available?", a: amenities.includes("breakfast") ? "Yes — choose a rate that includes breakfast, or add it at the property." : "Breakfast is not listed for this property." },
        { q: "Is there parking?", a: amenities.includes("parking") ? "Yes, parking is available on site (charges may apply)." : "No on-site parking is listed." },
        { q: "Are pets allowed?", a: pets },
        { q: "Can I cancel for free?", a: flexible ? "Rates marked “Free cancellation” can be cancelled under the provider's policy." : "Only non-refundable rates are listed for this property." },
      ],
      source: "demo",
    });

    const tpls = ROOMS[type];
    const nRooms = Math.min(tpls.length, Math.max(2, tpls.length - Math.floor(r() * 2)));
    tpls.slice(0, nRooms).forEach((tpl, idx) => {
      const series: number[] = [];
      for (let d = 0; d < DEMO_RATE_DAYS; d++) {
        const date = new Date(startUtc + d * DAY_MS);
        const m = date.getUTCMonth();
        let season = (beach ? SEASON_BEACH : SEASON_N)[SOUTHERN.has(g.slug) && !beach ? (m + 6) % 12 : m]!;
        // Pre-holiday lull (Dec 1–17) and holiday peak (Dec 18–Jan 2) on top of the month curve.
        const dom = date.getUTCDate();
        if (m === 11 && dom <= 17) season *= beach ? 0.82 : 0.84;
        else if ((m === 11 && dom >= 18) || (m === 0 && dom <= 2)) season *= 1.2;
        const dow = date.getUTCDay();
        const weekend = dow === 5 || dow === 6 ? (us || beach ? 1.18 : 1.1) : dow === 0 ? 0.95 : 1;
        const noise = 0.94 + rngFor(`${id}:${tpl.code}:${d}`)() * 0.12;
        series.push(Math.max(1500, Math.round(base * tpl.mult * season * weekend * noise) * 100));
      }
      rooms.push({
        id: `${id}_${tpl.code}`,
        hotelId: id,
        code: tpl.code,
        name: tpl.name,
        bedConfig: tpl.bed,
        sizeSqm: tpl.sqm,
        maxOccupancy: tpl.occ,
        amenities: tpl.amenities,
        ratePlans: plans,
        demoRatesFrom: new Date(startUtc),
        demoNightlyCents: series,
        sortOrder: idx,
        source: "demo",
      });
    });
  }
  return { hotels, rooms };
}

export async function seedDemoHotels(prisma: PrismaClient, now = new Date()): Promise<{ cities: number; hotels: number; rooms: number; skipped: string[] }> {
  const startUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const guides = await prisma.travelGuide.findMany({
    where: { status: "published" },
    select: { slug: true, city: true, countryIso2: true, neighborhoods: true, tags: true, cityId: true },
    orderBy: { slug: "asc" },
  });
  const allHotels: Prisma.HotelCreateManyInput[] = [];
  const allRooms: Prisma.HotelRoomCreateManyInput[] = [];
  const skipped: string[] = [];
  for (const g of guides) {
    const city = await resolveCity(prisma, g);
    if (!city) {
      skipped.push(g.slug);
      continue;
    }
    const c = CENTER_OVERRIDE[g.slug];
    const { hotels, rooms } = buildDemoHotels(g, c ? { ...city, ...c } : city, startUtc);
    allHotels.push(...hotels);
    allRooms.push(...rooms);
  }
  // Replace demo inventory only (rates/rooms cascade). Live/provider hotels are untouched.
  await prisma.$transaction(async (tx) => {
    await tx.hotel.deleteMany({ where: { source: "demo" } });
    for (let i = 0; i < allHotels.length; i += 500) await tx.hotel.createMany({ data: allHotels.slice(i, i + 500) });
    for (let i = 0; i < allRooms.length; i += 500) await tx.hotelRoom.createMany({ data: allRooms.slice(i, i + 500) });
  }, { timeout: 120_000 });
  return { cities: guides.length - skipped.length, hotels: allHotels.length, rooms: allRooms.length, skipped };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("prisma/seed/hotels-demo.ts");
if (isMain) {
  for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      break;
    }
  }
  if (process.env["NODE_ENV"] === "production") throw new Error("Refusing to seed demo hotels in production");
  const prisma = createPrismaClient();
  seedDemoHotels(prisma)
    .then((s) => console.log(`Demo hotels: ${s.hotels} hotels, ${s.rooms} room types in ${s.cities} cities${s.skipped.length ? ` (skipped: ${s.skipped.join(", ")})` : ""}`))
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
