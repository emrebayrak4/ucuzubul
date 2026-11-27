import { z } from "zod";
import { Cents, DataSource, Id, IsoDate, IsoDateTime, ProviderStatus } from "./common";

/* ------------------------------------------------------------------ */
/* Hotels — split out of travel.ts (re-exported from there).            */
/* ------------------------------------------------------------------ */

export const HotelPropertyType = z.enum(["hotel", "apartment", "resort", "villa", "hostel", "guest_house", "bed_and_breakfast", "motel", "boutique"]);
export type HotelPropertyType = z.infer<typeof HotelPropertyType>;

export const HOTEL_PROPERTY_TYPE_LABELS: Record<HotelPropertyType, string> = {
  hotel: "Hotel",
  apartment: "Apartment",
  resort: "Resort",
  villa: "Villa",
  hostel: "Hostel",
  guest_house: "Guest house",
  bed_and_breakfast: "Bed & breakfast",
  motel: "Motel",
  boutique: "Boutique hotel",
};

/** Amenity codes (stable, lower_snake). Unknown codes from providers are passed through as-is. */
export const HOTEL_AMENITY_LABELS: Record<string, string> = {
  wifi: "Free WiFi",
  parking: "Parking",
  pool: "Swimming pool",
  fitness_center: "Fitness center",
  spa: "Spa",
  pets: "Pet-friendly",
  airport_shuttle: "Airport shuttle",
  ev_charging: "EV charging",
  kitchen: "Kitchen / kitchenette",
  restaurant: "Restaurant",
  bar: "Bar",
  breakfast: "Breakfast available",
  beach_access: "Beach access",
  casino: "Casino",
  air_conditioning: "Air conditioning",
  room_service: "Room service",
  laundry: "Laundry",
  family_rooms: "Family rooms",
  non_smoking: "Non-smoking rooms",
  front_desk_24h: "24-hour front desk",
  business_center: "Business center",
  balcony: "Balcony / terrace",
  washer: "Washing machine",
  garden: "Garden",
  kids_club: "Kids' club",
};

export const HOTEL_AMENITY_GROUPS: Array<{ group: string; codes: string[] }> = [
  { group: "Internet & work", codes: ["wifi", "business_center"] },
  { group: "Wellness & recreation", codes: ["pool", "fitness_center", "spa", "beach_access", "casino", "garden", "kids_club"] },
  { group: "Food & drink", codes: ["restaurant", "bar", "breakfast", "room_service", "kitchen"] },
  { group: "Getting around", codes: ["parking", "airport_shuttle", "ev_charging"] },
  { group: "Rooms & services", codes: ["air_conditioning", "family_rooms", "non_smoking", "front_desk_24h", "laundry", "washer", "balcony"] },
  { group: "Pets", codes: ["pets"] },
];

export const HOTEL_ACCESSIBILITY_LABELS: Record<string, string> = {
  wheelchair_accessible: "Wheelchair accessible",
  accessible_bathroom: "Accessible bathroom",
  roll_in_shower: "Roll-in shower",
  elevator: "Elevator to all floors",
  visual_aids: "Visual aids (Braille / tactile signs)",
  hearing_aids: "Hearing-accessible rooms",
};

export const BoardType = z.enum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"]);
export type BoardType = z.infer<typeof BoardType>;
export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  room_only: "Room only",
  breakfast: "Breakfast included",
  half_board: "Breakfast & dinner",
  full_board: "All meals",
  all_inclusive: "All-inclusive",
};

export const HotelSort = z.enum(["top_picks", "price_asc", "price_desc", "stars_desc", "distance_asc"]);
export type HotelSort = z.infer<typeof HotelSort>;
export const HOTEL_SORT_LABELS: Record<HotelSort, string> = {
  top_picks: "Our top picks",
  price_asc: "Lowest price first",
  price_desc: "Highest price first",
  stars_desc: "Star class",
  distance_asc: "Distance from center",
};
/** Transparent rule behind "Our top picks" — shown in the UI next to the sort control. */
export const HOTEL_TOP_PICKS_RULE =
  "Ranked by value: lowest total price relative to star class, plus small boosts for free cancellation and distance to the center. Sponsored placement never affects this order.";

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 40) : []));
const flag = z.preprocess((v) => (v === "1" || v === "true" || v === true ? true : v === "0" || v === "false" || v === false ? false : undefined), z.boolean().optional());

/** Bounding box "minLng,minLat,maxLng,maxLat" (map view). */
export const HotelBbox = z
  .string()
  .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "Expected minLng,minLat,maxLng,maxLat")
  .transform((v) => {
    const [minLng, minLat, maxLng, maxLat] = v.split(",").map(Number) as [number, number, number, number];
    return { minLng, minLat, maxLng, maxLat };
  });

export const HotelSearchQuery = z
  .object({
    /** Free-text city name (legacy). Prefer placeId from /v1/travel/places. */
    city: z.string().trim().min(2).max(80).optional(),
    /** Place id from /v1/travel/places, e.g. "city_745044", "airport_JFK", "country_TR". */
    placeId: z.string().regex(/^(city|airport|country)_[A-Za-z0-9]+$/).optional(),
    cityId: z.coerce.number().int().positive().optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(100).default(25),
    checkin: IsoDate,
    checkout: IsoDate,
    guests: z.coerce.number().int().min(1).max(16).default(2),
    rooms: z.coerce.number().int().min(1).max(8).default(1),
    /** Legacy: minimum star class. Prefer `stars`. */
    minStars: z.coerce.number().int().min(1).max(5).optional(),
    /** Nightly price bounds in cents (lowest available nightly rate). */
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    /** Star classes, CSV e.g. "3,4,5". "0" = unrated. */
    stars: csv.transform((a) => a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 5)),
    types: csv.pipe(z.array(HotelPropertyType)),
    amenities: csv,
    /** Meal plans, CSV: breakfast, half_board, full_board, all_inclusive. */
    meals: csv.pipe(z.array(BoardType)),
    freeCancellation: flag,
    payAtProperty: flag,
    maxDistanceKm: z.coerce.number().positive().max(100).optional(),
    neighborhoods: csv,
    accessibility: csv,
    chains: csv,
    bbox: HotelBbox.optional(),
    /** Legacy "recommended" is accepted and mapped to "top_picks". */
    sort: z
      .union([HotelSort, z.literal("recommended")])
      .default("top_picks")
      .transform((v): HotelSort => (v === "recommended" ? "top_picks" : v)),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => v.checkout > v.checkin, { message: "Checkout must be after check-in", path: ["checkout"] })
  .refine((v) => (Date.parse(v.checkout) - Date.parse(v.checkin)) / 86_400_000 <= 30, { message: "Stays are limited to 30 nights", path: ["checkout"] })
  .refine((v) => Boolean(v.city || v.placeId || v.cityId || (v.lat !== undefined && v.lng !== undefined)), {
    message: "Provide placeId, cityId, lat+lng or city",
    path: ["placeId"],
  });
export type HotelSearchQuery = z.infer<typeof HotelSearchQuery>;
export type HotelSearchQueryInput = z.input<typeof HotelSearchQuery>;

export const HotelRate = z.object({
  id: Id,
  provider: z.object({ id: z.string(), name: z.string() }),
  roomName: z.string(),
  /** Room type id (hotel_rooms.id) when known. */
  roomId: z.string().nullable(),
  ratePlanName: z.string().nullable(),
  boardType: BoardType.nullable(),
  refundable: z.boolean().nullable(),
  /** true = pay at the property; false = prepay; null = unknown. */
  payLater: z.boolean().nullable(),
  nightlyPriceCents: Cents,
  totalPriceCents: Cents,
  taxesAndFeesCents: Cents.nullable(),
  /** true when taxes/fees are our estimate, not the provider's figure. */
  taxesEstimated: z.boolean(),
  currency: z.string().length(3),
  /** Empty string when there is no bookable deep link (demo). */
  goUrl: z.string(),
  source: DataSource,
  fetchedAt: IsoDateTime,
});
export type HotelRate = z.infer<typeof HotelRate>;

export const HotelSummary = z.object({
  id: Id,
  name: z.string(),
  stars: z.number().min(0).max(5).nullable(),
  propertyType: HotelPropertyType,
  address: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  country: z.string().length(2),
  neighborhood: z.string().nullable(),
  chain: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  /** Straight-line km to the searched city center (null when unknown). */
  distanceKm: z.number().nullable(),
  imageUrl: z.string().url().nullable(),
  amenities: z.array(z.string()),
  /** e.g. "Standard King Room · 1 king bed" — cheapest room for the stay. */
  roomSummary: z.string().nullable(),
  freeCancellation: z.boolean(),
  payAtProperty: z.boolean(),
  breakfastAvailable: z.boolean(),
  lowestNightlyCents: Cents.nullable(),
  lowestTotalCents: Cents.nullable(),
  lowestTaxesCents: Cents.nullable(),
  taxesEstimated: z.boolean(),
  /** Number of distinct providers with a rate for the stay. */
  providerCount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  source: DataSource,
});
export type HotelSummary = z.infer<typeof HotelSummary>;

export const HotelFacetBucket = z.object({ value: z.string(), label: z.string(), count: z.number().int().nonnegative() });
export type HotelFacetBucket = z.infer<typeof HotelFacetBucket>;

export const HotelFacets = z.object({
  /** Histogram of lowest nightly price (cents) across results ignoring the price filter. */
  price: z.object({ min: Cents, max: Cents, bucketCents: Cents, buckets: z.array(z.number().int().nonnegative()) }).nullable(),
  propertyTypes: z.array(HotelFacetBucket),
  stars: z.array(HotelFacetBucket),
  amenities: z.array(HotelFacetBucket),
  meals: z.array(HotelFacetBucket),
  freeCancellation: z.number().int().nonnegative(),
  payAtProperty: z.number().int().nonnegative(),
  distance: z.array(HotelFacetBucket),
  neighborhoods: z.array(HotelFacetBucket),
  accessibility: z.array(HotelFacetBucket),
  chains: z.array(HotelFacetBucket),
});
export type HotelFacets = z.infer<typeof HotelFacets>;

export const HotelMapPin = z.object({
  id: Id,
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  lowestNightlyCents: Cents.nullable(),
  stars: z.number().nullable(),
  source: DataSource,
});
export type HotelMapPin = z.infer<typeof HotelMapPin>;

export const HotelSearchResponse = z.object({
  items: z.array(HotelSummary),
  /** Every filtered result with coordinates (not paginated, capped at 500) for the map view. */
  pins: z.array(HotelMapPin),
  facets: HotelFacets,
  providers: z.array(ProviderStatus),
  source: z.union([DataSource, z.literal("mixed"), z.literal("none")]),
  total: z.number().int().nonnegative(),
  /** Results before filters (for "x of y"). */
  unfilteredTotal: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  nights: z.number().int().positive(),
  location: z
    .object({ name: z.string(), countryIso2: z.string().nullable(), lat: z.number().nullable(), lng: z.number().nullable(), cityId: z.number().int().nullable() })
    .nullable(),
  /** Published city travel guide for the searched city, if any (GET /v1/travel/guides/:slug). */
  guideSlug: z.string().nullable(),
  topPicksRule: z.string(),
  searchedAt: IsoDateTime,
});
export type HotelSearchResponse = z.infer<typeof HotelSearchResponse>;

export const HotelDetailQuery = z.object({
  checkin: IsoDate.optional(),
  checkout: IsoDate.optional(),
  guests: z.coerce.number().int().min(1).max(16).optional(),
  rooms: z.coerce.number().int().min(1).max(8).optional(),
});
export type HotelDetailQuery = z.infer<typeof HotelDetailQuery>;

export const HotelRatePlan = z.object({
  code: z.string(),
  name: z.string(),
  refundable: z.boolean().nullable(),
  boardType: BoardType.nullable(),
  payLater: z.boolean().nullable(),
  /** One offer per provider, cheapest first. */
  offers: z.array(HotelRate),
});
export type HotelRatePlan = z.infer<typeof HotelRatePlan>;

export const HotelRoomType = z.object({
  id: z.string(),
  name: z.string(),
  bedConfig: z.string().nullable(),
  sizeSqm: z.number().int().nullable(),
  maxOccupancy: z.number().int().positive(),
  amenities: z.array(z.string()),
  /** false when the requested guests per room exceed maxOccupancy. */
  fitsGuests: z.boolean(),
  ratePlans: z.array(HotelRatePlan),
});
export type HotelRoomType = z.infer<typeof HotelRoomType>;

export const HotelHouseRules = z.object({
  checkinFrom: z.string().nullable(),
  checkinUntil: z.string().nullable(),
  checkoutUntil: z.string().nullable(),
  pets: z.string().nullable(),
  smoking: z.string().nullable(),
  parties: z.string().nullable(),
  minCheckinAge: z.number().int().nullable(),
  quietHours: z.string().nullable(),
});
export type HotelHouseRules = z.infer<typeof HotelHouseRules>;

export const HotelNearbyPlace = z.object({
  name: z.string(),
  kind: z.enum(["airport", "city", "neighborhood", "center"]),
  distanceKm: z.number(),
  iata: z.string().nullable(),
});
export type HotelNearbyPlace = z.infer<typeof HotelNearbyPlace>;

/** Review summary slot — only filled from a live provider that returns real review data. Never generated. */
export const HotelReviewSummary = z.object({
  provider: z.object({ id: z.string(), name: z.string() }),
  score: z.number(),
  scale: z.number(),
  count: z.number().int().nonnegative(),
  url: z.string().nullable(),
});
export type HotelReviewSummary = z.infer<typeof HotelReviewSummary>;

export const HotelDetailResponse = z.object({
  hotel: HotelSummary.extend({
    description: z.string().nullable(),
    images: z.array(z.string().url()),
    checkinTime: z.string().nullable(),
    checkoutTime: z.string().nullable(),
    highlights: z.array(z.string()),
    accessibility: z.array(z.string()),
    houseRules: HotelHouseRules.nullable(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })),
    cityId: z.number().int().nullable(),
    guideSlug: z.string().nullable(),
  }),
  stay: z.object({ checkin: IsoDate, checkout: IsoDate, nights: z.number().int().positive(), guests: z.number().int(), rooms: z.number().int() }),
  rooms: z.array(HotelRoomType),
  /** Flat list of all offers (cheapest first). */
  rates: z.array(HotelRate),
  nearby: z.array(HotelNearbyPlace),
  reviews: HotelReviewSummary.nullable(),
  providers: z.array(ProviderStatus),
});
export type HotelDetailResponse = z.infer<typeof HotelDetailResponse>;

/* Hotels home */
export const HotelDealsQuery = z.object({
  checkin: IsoDate.optional(),
  checkout: IsoDate.optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});
export type HotelDealsQuery = z.infer<typeof HotelDealsQuery>;

export const HotelDeal = HotelSummary.extend({
  /** This hotel's median nightly price over the next 180 days of stored rates; the deal is the stay price vs that median. */
  typicalNightlyCents: Cents,
  savingsPct: z.number().int(),
});
export type HotelDeal = z.infer<typeof HotelDeal>;

export const HotelDealsResponse = z.object({
  checkin: IsoDate,
  checkout: IsoDate,
  nights: z.number().int().positive(),
  items: z.array(HotelDeal),
  /** How "deal" is defined (shown in the UI). */
  rule: z.string(),
});
export type HotelDealsResponse = z.infer<typeof HotelDealsResponse>;

export const HotelDestination = z.object({
  city: z.string(),
  countryIso2: z.string().length(2),
  cityId: z.number().int().nullable(),
  guideSlug: z.string().nullable(),
  hotelCount: z.number().int().nonnegative(),
  lowestNightlyCents: Cents.nullable(),
  source: z.union([DataSource, z.literal("mixed")]),
});
export type HotelDestination = z.infer<typeof HotelDestination>;

export const HotelDestinationsResponse = z.object({ items: z.array(HotelDestination) });
export type HotelDestinationsResponse = z.infer<typeof HotelDestinationsResponse>;
