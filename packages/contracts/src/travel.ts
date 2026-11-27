import { z } from "zod";
import { Cents, Id, IsoDate } from "./common";
import { IataAirport } from "./travel-flights";

/* Flights: see ./travel-flights (re-exported so existing imports keep working). */
export * from "./travel-flights";

/* Hotels: see ./travel-hotels (re-exported so existing imports keep working). */
export * from "./travel-hotels";

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
