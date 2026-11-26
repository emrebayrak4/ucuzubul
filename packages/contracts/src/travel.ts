import { z } from "zod";
import { Cents, DataSource, Id, IsoDate, IsoDateTime, ProviderStatus } from "./common";

export const IataAirport = z.string().length(3).regex(/^[A-Z]{3}$/, "Expected 3-letter IATA code");
export const IataAirline = z.string().regex(/^[A-Z0-9]{2}$/, "Expected 2-char IATA airline code");

export const Airport = z.object({
  iata: IataAirport,
  name: z.string(),
  city: z.string(),
  region: z.string().nullable(),
  country: z.string().length(2),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  timezone: z.string().nullable(),
});
export type Airport = z.infer<typeof Airport>;

export const AirportSearchQuery = z.object({ q: z.string().trim().min(1).max(60) });
export type AirportSearchQuery = z.infer<typeof AirportSearchQuery>;

export const AirportSearchResponse = z.object({ items: z.array(Airport) });
export type AirportSearchResponse = z.infer<typeof AirportSearchResponse>;

export const Airline = z.object({
  iata: IataAirline,
  name: z.string(),
  logoUrl: z.string().url().nullable(),
});
export type Airline = z.infer<typeof Airline>;

export const CabinClass = z.enum(["economy", "premium_economy", "business", "first"]);
export type CabinClass = z.infer<typeof CabinClass>;

export const FlightSearchQuery = z
  .object({
    from: z.string().toUpperCase().pipe(IataAirport),
    to: z.string().toUpperCase().pipe(IataAirport),
    depart: IsoDate,
    return: IsoDate.optional(),
    adults: z.coerce.number().int().min(1).max(9).default(1),
    children: z.coerce.number().int().min(0).max(8).default(0),
    infants: z.coerce.number().int().min(0).max(4).default(0),
    cabin: CabinClass.default("economy"),
    sort: z.enum(["best", "cheapest", "fastest"]).default("best"),
    maxStops: z.coerce.number().int().min(0).max(3).optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Origin and destination must differ", path: ["to"] })
  .refine((v) => !v.return || v.return >= v.depart, {
    message: "Return date must be on or after departure",
    path: ["return"],
  });
export type FlightSearchQuery = z.infer<typeof FlightSearchQuery>;
export type FlightSearchQueryInput = z.input<typeof FlightSearchQuery>;

export const FlightSegment = z.object({
  marketingCarrier: Airline,
  operatingCarrier: Airline.nullable(),
  flightNumber: z.string(),
  from: IataAirport,
  to: IataAirport,
  departAt: IsoDateTime,
  arriveAt: IsoDateTime,
  durationMinutes: z.number().int().positive(),
  aircraft: z.string().nullable(),
});
export type FlightSegment = z.infer<typeof FlightSegment>;

export const FlightSlice = z.object({
  from: IataAirport,
  to: IataAirport,
  departAt: IsoDateTime,
  arriveAt: IsoDateTime,
  durationMinutes: z.number().int().positive(),
  stops: z.number().int().nonnegative(),
  segments: z.array(FlightSegment).min(1),
});
export type FlightSlice = z.infer<typeof FlightSlice>;

export const FlightOffer = z.object({
  id: Id,
  provider: z.object({ id: z.string(), name: z.string() }),
  totalPriceCents: Cents,
  currency: z.string().length(3),
  /** Per adult, for display. */
  pricePerAdultCents: Cents,
  cabin: CabinClass,
  slices: z.array(FlightSlice).min(1).max(2),
  baggage: z.object({ carryOn: z.number().int().nullable(), checked: z.number().int().nullable() }).nullable(),
  refundable: z.boolean().nullable(),
  /** Relative path /v1/travel/go/flight/:id. */
  goUrl: z.string(),
  source: DataSource,
  expiresAt: IsoDateTime.nullable(),
  fetchedAt: IsoDateTime,
});
export type FlightOffer = z.infer<typeof FlightOffer>;

export const FlightSearchResponse = z.object({
  offers: z.array(FlightOffer),
  providers: z.array(ProviderStatus),
  /** Aggregate source: "demo" when all offers are demo, "mixed" when combined. */
  source: z.union([DataSource, z.literal("mixed"), z.literal("none")]),
  query: z.object({
    from: IataAirport,
    to: IataAirport,
    /** Airports the from/to codes expand to (metro/city codes like NYC → JFK, LGA, EWR). */
    fromAirports: z.array(IataAirport),
    toAirports: z.array(IataAirport),
    depart: IsoDate,
    return: IsoDate.nullable(),
    adults: z.number().int(),
    cabin: CabinClass,
  }),
  airlines: z.array(Airline),
  searchedAt: IsoDateTime,
});
export type FlightSearchResponse = z.infer<typeof FlightSearchResponse>;

/* Hotels */
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
    minStars: z.coerce.number().int().min(1).max(5).optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    amenities: z.string().optional(),
    sort: z.enum(["recommended", "price_asc", "price_desc", "stars_desc"]).default("recommended"),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine((v) => v.checkout > v.checkin, { message: "Checkout must be after check-in", path: ["checkout"] })
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
  boardType: z.enum(["room_only", "breakfast", "half_board", "full_board", "all_inclusive"]).nullable(),
  refundable: z.boolean().nullable(),
  nightlyPriceCents: Cents,
  totalPriceCents: Cents,
  taxesAndFeesCents: Cents.nullable(),
  currency: z.string().length(3),
  goUrl: z.string(),
  source: DataSource,
  fetchedAt: IsoDateTime,
});
export type HotelRate = z.infer<typeof HotelRate>;

export const HotelSummary = z.object({
  id: Id,
  name: z.string(),
  stars: z.number().min(0).max(5).nullable(),
  address: z.string().nullable(),
  city: z.string(),
  region: z.string().nullable(),
  country: z.string().length(2),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  imageUrl: z.string().url().nullable(),
  amenities: z.array(z.string()),
  lowestNightlyCents: Cents.nullable(),
  lowestTotalCents: Cents.nullable(),
  currency: z.string().length(3),
  source: DataSource,
});
export type HotelSummary = z.infer<typeof HotelSummary>;

export const HotelSearchResponse = z.object({
  items: z.array(HotelSummary),
  providers: z.array(ProviderStatus),
  source: z.union([DataSource, z.literal("mixed"), z.literal("none")]),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  nights: z.number().int().positive(),
  /** Published city travel guide for the searched city, if any (GET /v1/travel/guides/:slug). */
  guideSlug: z.string().nullable(),
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

export const HotelDetailResponse = z.object({
  hotel: HotelSummary.extend({
    description: z.string().nullable(),
    images: z.array(z.string().url()),
    checkinTime: z.string().nullable(),
    checkoutTime: z.string().nullable(),
  }),
  rates: z.array(HotelRate),
  providers: z.array(ProviderStatus),
});
export type HotelDetailResponse = z.infer<typeof HotelDetailResponse>;

export const TravelGoParams = z.object({ type: z.enum(["flight", "hotel"]), id: Id });
export type TravelGoParams = z.infer<typeof TravelGoParams>;

export const TravelAlertRequest = z.object({
  kind: z.enum(["flight", "hotel"]),
  from: IataAirport.optional(),
  to: IataAirport.optional(),
  city: z.string().optional(),
  depart: IsoDate.optional(),
  return: IsoDate.optional(),
  targetPriceCents: Cents.positive().optional(),
});
export type TravelAlertRequest = z.infer<typeof TravelAlertRequest>;

/* Places autocomplete (airports, cities, countries) */
export const PlaceType = z.enum(["airport", "city", "country"]);
export type PlaceType = z.infer<typeof PlaceType>;

export const PlacesQuery = z.object({
  q: z.string().trim().min(1).max(60),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : ["airport", "city", "country"]))
    .pipe(z.array(PlaceType).min(1)),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});
export type PlacesQuery = z.infer<typeof PlacesQuery>;

export const Place = z.object({
  /** "airport_JFK" | "city_745044" | "country_TR" */
  id: z.string(),
  type: PlaceType,
  /** Display name; multi-airport cities read "Istanbul (Any airport)", countries "Turkey — anywhere". */
  name: z.string(),
  /** Context line, e.g. "New York, United States" or "Istanbul, Turkey". */
  subtitle: z.string(),
  iata: z.string().nullable(),
  /** IATA city/metro code (NYC, LON, IST…) when applicable. */
  cityCode: z.string().nullable(),
  /** Airports this place expands to for flight search (empty for countries). */
  airports: z.array(z.string()),
  countryIso2: z.string().length(2),
  countryName: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});
export type Place = z.infer<typeof Place>;

export const PlacesResponse = z.object({ items: z.array(Place), degraded: z.boolean() });
export type PlacesResponse = z.infer<typeof PlacesResponse>;
