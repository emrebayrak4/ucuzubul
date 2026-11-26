/**
 * Hotel providers: Expedia Rapid, Booking.com Demand API, Hotelbeds APItude,
 * and Travelpayouts/Hotellook (discontinued 2025-10-20 — kept as an explicit "error" adapter).
 */
import { createHash } from "node:crypto";
import { AdapterCore } from "../base";
import { NotSupportedError, ProviderDiscontinuedError } from "../errors";
import type { FetchResult, HotelOffer, HotelProvider, HotelSearchParams } from "../types";
import { arr, assertDate, get, isObject, nightsBetween, str, toCents } from "../util";

function validate(p: HotelSearchParams): number {
  assertDate(p.checkin, "checkin");
  assertDate(p.checkout, "checkout");
  if (!Number.isInteger(p.adults) || p.adults < 1) throw new RangeError("adults must be >= 1");
  if (!Number.isInteger(p.rooms) || p.rooms < 1 || p.rooms > 8) throw new RangeError("rooms must be 1-8");
  if (p.adults < p.rooms) throw new RangeError("need at least one adult per room");
  return nightsBetween(p.checkin, p.checkout);
}

/** Split adults (and children) across rooms as evenly as possible. */
export function distributeOccupancy(adults: number, rooms: number, childrenAges: number[] = []): { adults: number; childrenAges: number[] }[] {
  const out = Array.from({ length: rooms }, (_, i) => ({ adults: Math.floor(adults / rooms) + (i < adults % rooms ? 1 : 0), childrenAges: [] as number[] }));
  childrenAges.forEach((age, i) => (out[i % rooms] as { childrenAges: number[] }).childrenAges.push(age));
  return out;
}

// =================================================================== Expedia Rapid

/** Rapid signature: sha512_hex(apiKey + secret + unixSeconds). Exported for tests. */
export function expediaAuthHeader(apiKey: string, secret: string, unixSeconds: number): string {
  const sig = createHash("sha512").update(`${apiKey}${secret}${unixSeconds}`).digest("hex");
  return `EAN APIKey=${apiKey},Signature=${sig},timestamp=${unixSeconds}`;
}

/**
 * Expedia Rapid — https://developers.expediagroup.com/rapid/lodging/shopping/about-shopping-api
 * GET {base}/v3/properties/availability (test.ean.com / api.ean.com). Searches by property_id only:
 * city -> property ids requires the Rapid geography/content APIs, so city search is NotSupported here.
 */
export class ExpediaRapidHotelProvider extends AdapterCore implements HotelProvider {
  readonly id = "expedia_rapid";
  readonly name = "Expedia Rapid";
  readonly kind = "hotel" as const;
  readonly dataAccess = "partner_only" as const;
  readonly requiredEnv = ["EXPEDIA_RAPID_API_KEY", "EXPEDIA_RAPID_SECRET"] as const;
  protected override ttlSeconds = 900;

  private get base(): string {
    return this.envValue("EXPEDIA_RAPID_ENVIRONMENT") === "production" ? "https://api.ean.com" : "https://test.ean.com";
  }

  async searchHotels(p: HotelSearchParams): Promise<FetchResult<HotelOffer[]>> {
    const env = this.requireEnv();
    validate(p);
    if (p.destination.type !== "hotel_ids") throw new NotSupportedError(this.id, `${p.destination.type} search`, "Rapid availability requires property_id values (map cities via the Rapid content/geography APIs first)");
    const qs = new URLSearchParams({
      checkin: p.checkin,
      checkout: p.checkout,
      currency: p.currency ?? "USD",
      country_code: p.bookerCountry ?? "US",
      language: "en-US",
      rate_plan_count: "1",
      sales_channel: "website",
      sales_environment: "hotel_only",
    });
    for (const o of distributeOccupancy(p.adults, p.rooms, p.childrenAges)) {
      qs.append("occupancy", o.childrenAges.length ? `${o.adults}-${o.childrenAges.join(",")}` : String(o.adults));
    }
    for (const id of p.destination.ids.slice(0, 250)) qs.append("property_id", id);
    const auth = expediaAuthHeader(env.EXPEDIA_RAPID_API_KEY as string, env.EXPEDIA_RAPID_SECRET as string, Math.floor(this.clock.now() / 1000));
    const res = await this.guard(() => this.http.json({ url: `${this.base}/v3/properties/availability?${qs.toString()}`, headers: { Authorization: auth, "Accept-Encoding": "gzip" } }));
    const offers = arr(res)
      .map((prop) => this.mapProperty(prop, p.currency ?? "USD"))
      .filter((o): o is HotelOffer => o !== null);
    return this.result(offers, "api");
  }

  mapProperty(raw: unknown, currency: string): HotelOffer | null {
    if (!isObject(raw)) return null;
    const propertyId = str(raw.property_id);
    if (!propertyId) return null;
    let best: { cents: number; currency: string; roomName: string | null; refundable: boolean | null; rateId: string | null } | null = null;
    for (const room of arr(raw.rooms)) {
      for (const rate of arr(get(room, "rates"))) {
        const pricing = get(rate, "occupancy_pricing");
        if (!isObject(pricing)) continue;
        let sum = 0;
        let cur: string | null = null;
        let ok = true;
        for (const occ of Object.values(pricing)) {
          const v = toCents(get(occ, "totals.inclusive.request_currency.value"));
          const c = str(get(occ, "totals.inclusive.request_currency.currency"));
          if (v === null) ok = false;
          else sum += v;
          cur = cur ?? c;
        }
        if (!ok || sum <= 0) continue;
        if (!best || sum < best.cents) {
          const refundable = get(rate, "refundable");
          best = { cents: sum, currency: cur ?? currency, roomName: str(get(room, "room_name")), refundable: typeof refundable === "boolean" ? refundable : null, rateId: str(get(rate, "id")) };
        }
      }
    }
    if (!best) return null;
    return {
      id: `expedia_${propertyId}_${best.rateId ?? "rate"}`,
      provider: this.id,
      hotelId: propertyId,
      name: null,
      starRating: null,
      totalCents: best.cents,
      currency: best.currency,
      priceBasis: "retail",
      roomName: best.roomName,
      boardName: null,
      refundable: best.refundable,
      deepLink: null,
      bookable: true,
      source: "api",
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    const auth = expediaAuthHeader(env.EXPEDIA_RAPID_API_KEY as string, env.EXPEDIA_RAPID_SECRET as string, Math.floor(this.clock.now() / 1000));
    await this.http.request({ url: `${this.base}/v3/regions?language=en-US&include=standard&limit=1`, headers: { Authorization: auth } });
  }
}

// =================================================================== Booking.com Demand

/**
 * Booking.com Demand API (Managed Affiliate Partners) — https://developers.booking.com/demand/docs
 * POST {base}/accommodations/search; headers Authorization: Bearer <key>, X-Affiliate-Id.
 * Base: https://demandapi.booking.com/3.1 (sandbox: https://demandapi-sandbox.booking.com/3.1).
 * City search expects a Booking.com city id (numeric).
 */
export class BookingDemandHotelProvider extends AdapterCore implements HotelProvider {
  readonly id = "booking";
  readonly name = "Booking.com Demand API";
  readonly kind = "hotel" as const;
  readonly dataAccess = "partner_only" as const;
  readonly requiredEnv = ["BOOKING_API_KEY", "BOOKING_AFFILIATE_ID"] as const;
  protected override ttlSeconds = 900;

  private get base(): string {
    return this.envValue("BOOKING_ENVIRONMENT") === "production" ? "https://demandapi.booking.com/3.1" : "https://demandapi-sandbox.booking.com/3.1";
  }

  private headers(env: Record<string, string>): Record<string, string> {
    return { Authorization: `Bearer ${env.BOOKING_API_KEY}`, "X-Affiliate-Id": env.BOOKING_AFFILIATE_ID as string, "Content-Type": "application/json" };
  }

  async searchHotels(p: HotelSearchParams): Promise<FetchResult<HotelOffer[]>> {
    const env = this.requireEnv();
    validate(p);
    const body: Record<string, unknown> = {
      booker: { country: (p.bookerCountry ?? "US").toLowerCase(), platform: "desktop" },
      checkin: p.checkin,
      checkout: p.checkout,
      guests: { number_of_adults: p.adults, number_of_rooms: p.rooms, ...(p.childrenAges?.length ? { children: p.childrenAges } : {}) },
      currency: p.currency ?? "USD",
      extras: ["extra_charges"],
      rows: 50,
    };
    const d = p.destination;
    if (d.type === "city") {
      if (!/^-?\d+$/.test(d.value)) throw new NotSupportedError(this.id, "city name search", "pass a Booking.com numeric city id");
      body.city = Number(d.value);
    } else if (d.type === "coordinates") body.coordinates = { latitude: d.latitude, longitude: d.longitude, radius: d.radiusKm ?? 5 };
    else body.accommodations = d.ids.slice(0, 100).map(Number);
    const res = await this.guard(() => this.http.json({ url: `${this.base}/accommodations/search`, method: "POST", headers: this.headers(env), body: JSON.stringify(body) }));
    const offers = arr(get(res, "data"))
      .map((a) => this.mapAccommodation(a, p.currency ?? "USD"))
      .filter((o): o is HotelOffer => o !== null);
    return this.result(offers, "affiliate");
  }

  mapAccommodation(raw: unknown, currency: string): HotelOffer | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    // v3.1: price.total includes extra charges; price.book is the amount charged at booking.
    const total = toCents(get(raw, "price.total")) ?? toCents(get(raw, "price.book"));
    if (!id || total === null || total <= 0) return null;
    return {
      id: `booking_${id}`,
      provider: this.id,
      hotelId: id,
      name: null,
      starRating: null,
      totalCents: total,
      currency: str(raw.currency) ?? currency,
      priceBasis: "retail",
      roomName: null,
      boardName: null,
      refundable: null,
      deepLink: str(raw.deep_link_url) ?? str(raw.url),
      bookable: false,
      source: "affiliate",
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    await this.http.request({ url: `${this.base}/common/locations/countries`, method: "POST", headers: this.headers(env), body: JSON.stringify({ languages: ["en-us"] }) });
  }
}

// =================================================================== Hotelbeds

/** Hotelbeds X-Signature: sha256_hex(apiKey + secret + unixSeconds). Exported for tests. */
export function hotelbedsSignature(apiKey: string, secret: string, unixSeconds: number): string {
  return createHash("sha256").update(`${apiKey}${secret}${unixSeconds}`).digest("hex");
}

/**
 * Hotelbeds APItude Booking API — https://developer.hotelbeds.com/documentation/hotels/booking-api/
 * POST {base}/hotel-api/1.0/hotels. Evaluation keys: 50 requests/day on api.test.hotelbeds.com.
 * Rates are NET (wholesale) unless `sellingRate` with `hotelMandatory=true` is present (minimum resale price).
 */
export class HotelbedsHotelProvider extends AdapterCore implements HotelProvider {
  readonly id = "hotelbeds";
  readonly name = "Hotelbeds APItude";
  readonly kind = "hotel" as const;
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["HOTELBEDS_API_KEY", "HOTELBEDS_SECRET"] as const;
  protected override ttlSeconds = 900;
  protected override defaultRateLimit = { capacity: 2, refillPerSecond: 1 };

  private get base(): string {
    return this.envValue("HOTELBEDS_ENVIRONMENT") === "production" ? "https://api.hotelbeds.com" : "https://api.test.hotelbeds.com";
  }

  private headers(env: Record<string, string>): Record<string, string> {
    return {
      "Api-key": env.HOTELBEDS_API_KEY as string,
      "X-Signature": hotelbedsSignature(env.HOTELBEDS_API_KEY as string, env.HOTELBEDS_SECRET as string, Math.floor(this.clock.now() / 1000)),
      "Content-Type": "application/json",
    };
  }

  async searchHotels(p: HotelSearchParams): Promise<FetchResult<HotelOffer[]>> {
    const env = this.requireEnv();
    validate(p);
    const occ = distributeOccupancy(p.adults, p.rooms, p.childrenAges);
    const body: Record<string, unknown> = {
      stay: { checkIn: p.checkin, checkOut: p.checkout },
      occupancies: occ.map((o) => ({
        rooms: 1,
        adults: o.adults,
        children: o.childrenAges.length,
        ...(o.childrenAges.length ? { paxes: o.childrenAges.map((age) => ({ type: "CH", age })) } : {}),
      })),
    };
    const d = p.destination;
    if (d.type === "city") body.destination = { code: d.value.toUpperCase() };
    else if (d.type === "coordinates") body.geolocation = { latitude: d.latitude, longitude: d.longitude, radius: d.radiusKm ?? 5, unit: "km" };
    else body.hotels = { hotel: d.ids.map(Number).filter(Number.isFinite) };
    const res = await this.guard(() => this.http.json({ url: `${this.base}/hotel-api/1.0/hotels`, method: "POST", retries: 1, headers: this.headers(env), body: JSON.stringify(body) }));
    const offers = arr(get(res, "hotels.hotels"))
      .map((h) => this.mapHotel(h))
      .filter((o): o is HotelOffer => o !== null)
      .filter((o) => !p.currency || o.currency === p.currency);
    return this.result(offers, "api");
  }

  mapHotel(raw: unknown): HotelOffer | null {
    if (!isObject(raw)) return null;
    const code = str(raw.code);
    const currency = str(raw.currency);
    if (!code || !currency) return null;
    let best: { cents: number; basis: "net" | "selling"; room: string | null; board: string | null; refundable: boolean | null; key: string | null } | null = null;
    for (const room of arr(raw.rooms)) {
      for (const rate of arr(get(room, "rates"))) {
        const mandatory = get(rate, "hotelMandatory") === true;
        const selling = toCents(get(rate, "sellingRate"));
        const net = toCents(get(rate, "net"));
        const cents = mandatory && selling !== null ? selling : net;
        if (cents === null || cents <= 0) continue;
        if (!best || cents < best.cents) {
          const policies = arr(get(rate, "cancellationPolicies"));
          best = {
            cents,
            basis: mandatory && selling !== null ? "selling" : "net",
            room: str(get(room, "name")),
            board: str(get(rate, "boardName")),
            refundable: get(rate, "rateClass") === "NRF" ? false : policies.length > 0 ? true : null,
            key: str(get(rate, "rateKey")),
          };
        }
      }
    }
    if (!best) {
      const min = toCents(raw.minRate);
      if (min === null || min <= 0) return null;
      best = { cents: min, basis: "net", room: null, board: null, refundable: null, key: null };
    }
    const stars = /(\d)\s*STAR/i.exec(str(raw.categoryName) ?? "");
    return {
      id: `hotelbeds_${code}_${best.key ?? "min"}`.slice(0, 200),
      provider: this.id,
      hotelId: code,
      name: str(raw.name),
      starRating: stars ? Number(stars[1]) : null,
      totalCents: best.cents,
      currency,
      priceBasis: best.basis,
      roomName: best.room,
      boardName: best.board,
      refundable: best.refundable,
      deepLink: null,
      bookable: true,
      source: "api",
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    await this.http.request({ url: `${this.base}/hotel-api/1.0/status`, headers: this.headers(env) });
  }
}

// =================================================================== Travelpayouts hotels (discontinued)

/** Hotellook (Travelpayouts hotels) closed on 2025-10-20; the API returns errors. No replacement API. */
export class TravelpayoutsHotelProvider extends AdapterCore implements HotelProvider {
  readonly id = "travelpayouts_hotels";
  readonly name = "Travelpayouts Hotels (Hotellook) — discontinued";
  readonly kind = "hotel" as const;
  readonly dataAccess = "affiliate_feed" as const;
  readonly requiredEnv = [] as const;

  override status(): "error" {
    return "error";
  }

  override statusDetail(): string {
    return "Hotellook was discontinued by Travelpayouts on 2025-10-20";
  }

  async searchHotels(_p: HotelSearchParams): Promise<FetchResult<HotelOffer[]>> {
    throw new ProviderDiscontinuedError(this.id, "Hotellook API closed on 2025-10-20 (no replacement hotel data API)");
  }

  protected async ping(): Promise<void> {
    throw new ProviderDiscontinuedError(this.id, "Hotellook API closed on 2025-10-20");
  }
}
