import { z } from "zod";
import { Cents, DataSource, Id, IsoDate, IsoDateTime, ProviderStatus } from "./common";

/* ------------------------------------------------------------------ */
/* Flights — split out of travel.ts (re-exported from there).           */
/* ------------------------------------------------------------------ */

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

export const Alliance = z.enum(["star", "oneworld", "skyteam"]);
export type Alliance = z.infer<typeof Alliance>;
export const ALLIANCE_LABELS: Record<Alliance, string> = { star: "Star Alliance", oneworld: "oneworld", skyteam: "SkyTeam" };

export const Airline = z.object({
  iata: IataAirline,
  name: z.string(),
  logoUrl: z.string().url().nullable(),
  alliance: Alliance.nullable().optional(),
});
export type Airline = z.infer<typeof Airline>;

export const CabinClass = z.enum(["economy", "premium_economy", "business", "first"]);
export type CabinClass = z.infer<typeof CabinClass>;

export const FlightSort = z.enum(["best", "cheapest", "fastest"]);
export type FlightSort = z.infer<typeof FlightSort>;

export const FareBrand = z.enum(["basic", "main", "flex"]);
export type FareBrand = z.infer<typeof FareBrand>;
export const FARE_BRAND_LABELS: Record<FareBrand, string> = { basic: "Basic", main: "Main", flex: "Flex" };

/** Comma list in the URL → string[] (empty/absent → undefined). */
const csv = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .max(400)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(item).max(40).optional());

/** "360-1080" (minutes after local midnight) per leg, comma-separated; empty entries = any. */
const MinuteRange = z
  .string()
  .regex(/^\d{1,4}-\d{1,4}$/)
  .transform((v) => {
    const [a, b] = v.split("-").map(Number) as [number, number];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  });
const rangeList = z
  .string()
  .max(120)
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined))
  .pipe(z.array(z.union([z.literal(""), MinuteRange])).max(5).optional());

const boolish = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .optional()
  .transform((v) => v === true || v === "1" || v === "true");

/** One multi-city leg in the URL: "JFK:LHR:2026-12-10". */
const LegToken = z
  .string()
  .regex(/^[A-Za-z]{3}:[A-Za-z]{3}:\d{4}-\d{2}-\d{2}$/, "Expected FROM:TO:YYYY-MM-DD")
  .transform((v) => {
    const [from, to, date] = v.split(":") as [string, string, string];
    return { from: from.toUpperCase(), to: to.toUpperCase(), date };
  });
export type FlightLeg = { from: string; to: string; date: string };

export const FlightFilters = z.object({
  /** Stop buckets to keep: 0 = nonstop, 1 = one stop, 2 = two or more. */
  stops: csv(z.enum(["0", "1", "2"]).transform(Number)),
  /** Keep itineraries whose marketing carriers are all in this list. */
  airlines: csv(IataAirline),
  alliances: csv(Alliance),
  /** Keep itineraries whose connection airports are all in this list (nonstops always pass). */
  layovers: csv(IataAirport),
  /** Departure / arrival time windows per leg (local minutes). */
  dep: rangeList,
  arr: rangeList,
  /** Max duration of any single leg, minutes. */
  maxDuration: z.coerce.number().int().min(30).max(5000).optional(),
  /** Max single connection time, minutes. */
  maxLayover: z.coerce.number().int().min(20).max(2000).optional(),
  /** Required included bags. The cheapest fare option that includes them is shown. */
  bags: csv(z.enum(["carry_on", "checked"])),
  hideSelfTransfer: boolish,
});
export type FlightFilters = z.infer<typeof FlightFilters>;

export const FlightSearchQuery = z
  .object({
    from: z.string().toUpperCase().pipe(IataAirport).optional(),
    to: z.string().toUpperCase().pipe(IataAirport).optional(),
    depart: IsoDate.optional(),
    return: IsoDate.optional(),
    /** Multi-city (2–5 legs): "JFK:LHR:2026-12-10,LHR:CDG:2026-12-15". Overrides from/to/depart/return. */
    legs: z
      .string()
      .max(200)
      .optional()
      .transform((v) => (v ? v.split(",").filter(Boolean) : undefined))
      .pipe(z.array(LegToken).min(2).max(5).optional()),
    adults: z.coerce.number().int().min(1).max(9).default(1),
    children: z.coerce.number().int().min(0).max(8).default(0),
    infants: z.coerce.number().int().min(0).max(4).default(0),
    cabin: CabinClass.default("economy"),
    sort: FlightSort.default("best"),
    /** Legacy "direct only" switch; prefer `stops`. */
    maxStops: z.coerce.number().int().min(0).max(3).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(40),
  })
  .merge(FlightFilters)
  .refine((v) => Boolean(v.legs) || Boolean(v.from && v.to && v.depart), { message: "Choose origin, destination and departure date", path: ["from"] })
  .refine((v) => Boolean(v.legs) || v.from !== v.to, { message: "Origin and destination must differ", path: ["to"] })
  .refine((v) => !v.return || !v.depart || v.return >= v.depart, { message: "Return date must be on or after departure", path: ["return"] })
  .refine((v) => !v.legs || v.legs.every((l) => l.from !== l.to), { message: "Each flight needs different origin and destination", path: ["legs"] })
  .refine((v) => !v.legs || v.legs.every((l, i, a) => i === 0 || l.date >= a[i - 1]!.date), { message: "Multi-city dates must be in order", path: ["legs"] })
  .refine((v) => v.infants <= v.adults, { message: "Each infant needs an adult on the booking", path: ["infants"] });
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

export const FlightLayover = z.object({
  /** Airport where the connection starts (arrival airport of the previous segment). */
  airport: IataAirport,
  /** Departure airport of the next segment — differs from `airport` on an airport change. */
  nextAirport: IataAirport,
  durationMinutes: z.number().int(),
  /** Connection spans local midnight. */
  overnight: z.boolean(),
  changeAirport: z.boolean(),
  /** Separate tickets — bags must be re-checked and missed connections aren't protected. */
  selfTransfer: z.boolean(),
});
export type FlightLayover = z.infer<typeof FlightLayover>;

export const FlightSlice = z.object({
  from: IataAirport,
  to: IataAirport,
  departAt: IsoDateTime,
  arriveAt: IsoDateTime,
  durationMinutes: z.number().int().positive(),
  stops: z.number().int().nonnegative(),
  segments: z.array(FlightSegment).min(1),
  layovers: z.array(FlightLayover).optional(),
});
export type FlightSlice = z.infer<typeof FlightSlice>;

export const FlightBaggage = z.object({
  /** Included cabin bags (0 = personal item only), null = unknown. */
  carryOn: z.number().int().nullable(),
  /** Included checked bags, null = unknown. */
  checked: z.number().int().nullable(),
  /** Estimated fee for the first checked bag when not included (per person, per direction). */
  checkedBagFeeCents: Cents.nullable().optional(),
  carryOnFeeCents: Cents.nullable().optional(),
});
export type FlightBaggage = z.infer<typeof FlightBaggage>;

export const FareOption = z.object({
  brand: FareBrand,
  pricePerAdultCents: Cents,
  totalPriceCents: Cents,
  baggage: FlightBaggage,
  refundable: z.boolean(),
  changeable: z.boolean(),
  seatSelection: z.enum(["fee", "included"]),
});
export type FareOption = z.infer<typeof FareOption>;

export const FlightOffer = z.object({
  id: Id,
  provider: z.object({ id: z.string(), name: z.string() }),
  totalPriceCents: Cents,
  currency: z.string().length(3),
  /** Per adult, for display. */
  pricePerAdultCents: Cents,
  cabin: CabinClass,
  slices: z.array(FlightSlice).min(1).max(5),
  baggage: FlightBaggage.nullable(),
  refundable: z.boolean().nullable(),
  /** Relative path /v1/travel/go/flight/:id. Empty for demo fares (not bookable). */
  goUrl: z.string(),
  source: DataSource,
  expiresAt: IsoDateTime.nullable(),
  fetchedAt: IsoDateTime,
  /** Fare brand currently shown (cheapest that satisfies the bag filter). */
  fareBrand: FareBrand.nullable().optional(),
  /** All fare brands for this itinerary, cheapest first (demo engine; live providers when known). */
  fareOptions: z.array(FareOption).optional(),
  selfTransfer: z.boolean().optional(),
  /** Number of booking sites quoting this itinerary. */
  providerCount: z.number().int().min(1).optional(),
  /** Lower is better; see FlightSearchResponse.bestRule. */
  bestScore: z.number().optional(),
  bookable: z.boolean().optional(),
});
export type FlightOffer = z.infer<typeof FlightOffer>;

const FacetValue = z.object({ count: z.number().int().nonnegative(), minPriceCents: Cents.nullable() });

export const FlightFacets = z.object({
  stops: z.array(FacetValue.extend({ value: z.number().int().min(0).max(2) })),
  airlines: z.array(FacetValue.extend({ iata: IataAirline, name: z.string(), alliance: Alliance.nullable() })),
  alliances: z.array(FacetValue.extend({ value: Alliance })),
  layoverAirports: z.array(FacetValue.extend({ iata: IataAirport, name: z.string(), city: z.string() })),
  bags: z.object({ carryOn: FacetValue, checked: FacetValue }),
  selfTransfer: FacetValue,
  /** Bounds over the unfiltered result set, per leg. */
  legTimes: z.array(z.object({ from: IataAirport, to: IataAirport, depMin: z.number().int(), depMax: z.number().int(), arrMin: z.number().int(), arrMax: z.number().int() })),
  duration: z.object({ min: z.number().int(), max: z.number().int() }),
  layover: z.object({ min: z.number().int(), max: z.number().int() }),
});
export type FlightFacets = z.infer<typeof FlightFacets>;

const SortSummaryItem = z.object({ pricePerAdultCents: Cents, durationMinutes: z.number().int(), offerId: Id }).nullable();

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
    legs: z.array(z.object({ from: IataAirport, to: IataAirport, date: IsoDate })).optional(),
    tripType: z.enum(["oneway", "round", "multi"]).optional(),
  }),
  airlines: z.array(Airline),
  searchedAt: IsoDateTime,
  /** Matching offers after filters (offers[] is capped by `limit`). */
  total: z.number().int().nonnegative().optional(),
  /** Offers before filters. */
  totalUnfiltered: z.number().int().nonnegative().optional(),
  facets: FlightFacets.optional(),
  sortSummary: z.object({ best: SortSummaryItem, cheapest: SortSummaryItem, fastest: SortSummaryItem }).optional(),
  /** Human-readable explanation of how "Best" is computed. */
  bestRule: z.string().optional(),
  /** Short airport info (name, city) for codes appearing in offers. */
  airports: z.record(z.string(), z.object({ name: z.string(), city: z.string(), country: z.string() })).optional(),
});
export type FlightSearchResponse = z.infer<typeof FlightSearchResponse>;

/* ---------------------------------------------------- Price calendar */

export const FlightCalendarQuery = z
  .object({
    from: z.string().toUpperCase().pipe(IataAirport),
    to: z.string().toUpperCase().pipe(IataAirport),
    depart: IsoDate,
    return: IsoDate.optional(),
    cabin: CabinClass.default("economy"),
    /** One-way month grid: "YYYY-MM" (defaults to the departure month). */
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Origin and destination must differ", path: ["to"] })
  .refine((v) => !v.return || v.return >= v.depart, { message: "Return date must be on or after departure", path: ["return"] });
export type FlightCalendarQuery = z.infer<typeof FlightCalendarQuery>;
export type FlightCalendarQueryInput = z.input<typeof FlightCalendarQuery>;

export const FlightCalendarResponse = z.object({
  tripType: z.enum(["oneway", "round"]),
  /** "demo" when computed from labeled demo fares; "none" when no calendar source is available (live providers don't expose one). */
  source: z.union([DataSource, z.literal("none")]),
  message: z.string().nullable(),
  currency: z.string().length(3),
  /** Round trip: ±3 days grid. */
  grid: z.array(z.object({ depart: IsoDate, return: IsoDate, minPriceCents: Cents.nullable() })).optional(),
  /** One-way: every day of the month. */
  days: z.array(z.object({ date: IsoDate, minPriceCents: Cents.nullable() })).optional(),
  /** Cheapest fare per departure day around the chosen date (same trip length for round trips). */
  trend: z.array(z.object({ date: IsoDate, minPriceCents: Cents.nullable() })),
});
export type FlightCalendarResponse = z.infer<typeof FlightCalendarResponse>;

/* ------------------------------------------------ Explore everywhere */

export const FlightExploreQuery = z.object({
  from: z.string().toUpperCase().pipe(IataAirport),
  /** Departure date; defaults to ~5 weeks out. */
  depart: IsoDate.optional(),
  /** Trip length in nights (0 = one way). */
  tripLength: z.coerce.number().int().min(0).max(30).default(7),
  maxPrice: z.coerce.number().int().positive().optional(),
  direct: boolish,
  /** Restrict to a country (ISO2). */
  country: z.string().length(2).toUpperCase().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(120),
});
export type FlightExploreQuery = z.infer<typeof FlightExploreQuery>;
export type FlightExploreQueryInput = z.input<typeof FlightExploreQuery>;

export const ExploreDestination = z.object({
  /** Airport (or metro) code to search. */
  code: IataAirport,
  airport: IataAirport,
  city: z.string(),
  countryIso2: z.string().length(2),
  countryName: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  minPriceCents: Cents,
  direct: z.boolean(),
  durationMinutes: z.number().int(),
  depart: IsoDate,
  return: IsoDate.nullable(),
  source: DataSource,
});
export type ExploreDestination = z.infer<typeof ExploreDestination>;

export const FlightExploreResponse = z.object({
  origin: z.object({ code: IataAirport, city: z.string(), countryIso2: z.string() }),
  source: z.union([DataSource, z.literal("none")]),
  message: z.string().nullable(),
  depart: IsoDate,
  return: IsoDate.nullable(),
  destinations: z.array(ExploreDestination),
  countries: z.array(z.object({ iso2: z.string(), name: z.string(), minPriceCents: Cents, count: z.number().int() })),
});
export type FlightExploreResponse = z.infer<typeof FlightExploreResponse>;

/* ------------------------------------------------------- Fare alerts */

export const FlightAlertCreate = z
  .object({
    from: z.string().toUpperCase().pipe(IataAirport),
    to: z.string().toUpperCase().pipe(IataAirport),
    depart: IsoDate,
    return: IsoDate.optional(),
    /** Notify when the cheapest fare drops below this (defaults to the current cheapest fare). */
    targetPriceCents: Cents.positive().optional(),
  })
  .refine((v) => v.from !== v.to, { message: "Origin and destination must differ", path: ["to"] });
export type FlightAlertCreate = z.infer<typeof FlightAlertCreate>;

export const FlightAlert = z.object({
  id: Id,
  from: IataAirport,
  to: IataAirport,
  depart: IsoDate,
  return: IsoDate.nullable(),
  targetPriceCents: Cents.nullable(),
  active: z.boolean(),
  lastTriggeredAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type FlightAlert = z.infer<typeof FlightAlert>;

export const FlightAlertListQuery = z.object({
  from: z.string().toUpperCase().pipe(IataAirport).optional(),
  to: z.string().toUpperCase().pipe(IataAirport).optional(),
});
export type FlightAlertListQuery = z.infer<typeof FlightAlertListQuery>;

export const FlightAlertListResponse = z.object({ items: z.array(FlightAlert) });
export type FlightAlertListResponse = z.infer<typeof FlightAlertListResponse>;
