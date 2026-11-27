import { z } from "zod";
import { api } from "./api-browser";
import { PUBLIC_API_URL } from "./env";
import { storageAllowed } from "@/lib/privacy/consent";

/**
 * Worldwide places (countries, cities, airports) from GET /v1/travel/places?q=&types=.
 * Parsed leniently because A04 is still finalising the shape; falls back to /v1/travel/airports
 * while the places endpoint isn't deployed.
 */
export const PlaceType = z.enum(["city", "airport", "country"]);
export type PlaceType = z.infer<typeof PlaceType>;

const RawPlace = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    type: PlaceType,
    name: z.string(),
    iata: z.string().nullish(),
    code: z.string().nullish(),
    cityName: z.string().nullish(),
    city: z.string().nullish(),
    countryCode: z.string().nullish(),
    country: z.string().nullish(),
    countryName: z.string().nullish(),
    region: z.string().nullish(),
    label: z.string().nullish(),
    subtitle: z.string().nullish(),
    cityCode: z.string().nullish(),
    countryIso2: z.string().nullish(),
  })
  .passthrough();

export interface Place {
  id: string;
  type: PlaceType;
  name: string;
  /** IATA code (airport or metro/city code) usable in flight search; null for countries. */
  code: string | null;
  /** Secondary line, e.g. "New York, United States". */
  detail: string;
  /** Display label in the input, e.g. "Istanbul (Any airport)" or "JFK · New York". */
  label: string;
  /** City name used for hotel search. */
  city: string | null;
}

function normalize(p: z.infer<typeof RawPlace>): Place {
  const code = (p.iata ?? p.cityCode ?? p.code ?? null)?.toUpperCase() ?? null;
  const country = p.countryName ?? p.country ?? p.countryCode ?? "";
  const baseName = p.name.replace(/\s*\(Any airport\)\s*$/i, "");
  const city = p.type === "city" ? baseName : (p.cityName ?? p.city ?? (p.subtitle ? p.subtitle.split(",")[0]!.trim() : null));
  const label =
    p.label ??
    (p.type === "city" ? `${baseName} (Any airport)` : p.type === "airport" ? `${code ? code + " · " : ""}${city ?? p.name}` : p.name);
  const detail = p.subtitle ?? (p.type === "airport" ? [p.name, country].filter(Boolean).join(", ") : p.type === "city" ? [p.region, country].filter(Boolean).join(", ") : "Country");
  return { id: String(p.id ?? `${p.type}-${code ?? p.name}`), type: p.type, name: baseName, code: p.type === "country" ? null : code, detail, label, city };
}

let placesAvailable: boolean | null = null;

export async function searchPlaces(q: string, types: PlaceType[], signal?: AbortSignal): Promise<Place[]> {
  if (placesAvailable !== false) {
    const url = `${PUBLIC_API_URL}/v1/travel/places?q=${encodeURIComponent(q)}&types=${types.join(",")}`;
    const res = await fetch(url, { signal, credentials: "omit" }).catch(() => null);
    if (res && res.ok) {
      placesAvailable = true;
      const json: unknown = await res.json();
      const items = Array.isArray(json) ? json : (json as { items?: unknown[] })?.items ?? [];
      return items.flatMap((i) => {
        const r = RawPlace.safeParse(i);
        if (!r.success || !types.includes(r.data.type)) return [];
        const place = normalize(r.data);
        // For flight search, a city is only useful if it has airports (a metro/city code).
        if (types.includes("airport") && place.type === "city" && !place.code) return [];
        return [place];
      });
    }
    if (res && res.status === 404) placesAvailable = false;
  }
  // Fallback while /v1/travel/places isn't deployed: US airport data.
  if (!types.includes("airport") && !types.includes("city")) return [];
  const r = await api.travel.airports(q, { signal });
  if (types.includes("airport")) {
    return r.items.map((a) => ({ id: a.iata, type: "airport" as const, name: a.name, code: a.iata, detail: [a.city, a.region].filter(Boolean).join(", "), label: `${a.iata} · ${a.city}`, city: a.city }));
  }
  const seen = new Set<string>();
  return r.items.flatMap((a) => {
    if (seen.has(a.city)) return [];
    seen.add(a.city);
    return [{ id: `city-${a.city}`, type: "city" as const, name: a.city, code: null, detail: [a.region, a.country].filter(Boolean).join(", "), label: a.city, city: a.city }];
  });
}

const RECENT_KEY = (kind: string) => `pc_recent_places_${kind}`;

export function readRecentPlaces(kind: string): Place[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY(kind)) ?? "[]");
    return Array.isArray(v) ? (v as Place[]).filter((p) => p && typeof p.label === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function pushRecentPlace(kind: string, p: Place) {
  if (!storageAllowed(RECENT_KEY(kind))) return; // Functional consent required
  try {
    const next = [p, ...readRecentPlaces(kind).filter((x) => x.id !== p.id)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY(kind), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
