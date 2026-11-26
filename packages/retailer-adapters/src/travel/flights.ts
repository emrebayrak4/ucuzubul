/**
 * Flight providers: Duffel (bookable, test mode), Amadeus (Self-Service decommissioned 2026-07-17;
 * Enterprise only), Travelpayouts / Aviasales Data API (cached affiliate prices).
 */
import { AdapterCore, type AdapterOptions } from "../base";
import { ProviderDiscontinuedError, ResponseShapeError } from "../errors";
import { TokenCache } from "../oauth";
import type { CabinClass, FetchResult, FlightOffer, FlightProvider, FlightSearchParams, FlightSegment, FlightSlice } from "../types";
import { arr, assertDate, assertIata, get, isObject, isoDurationToMinutes, str, toCents } from "../util";

function validate(params: FlightSearchParams): { origin: string; destination: string } {
  const origin = assertIata(params.origin, "origin");
  const destination = assertIata(params.destination, "destination");
  assertDate(params.departDate, "departDate");
  if (params.returnDate) assertDate(params.returnDate, "returnDate");
  if (!Number.isInteger(params.adults) || params.adults < 1 || params.adults > 9) throw new RangeError("adults must be 1-9");
  return { origin, destination };
}

function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.round((tb - ta) / 60_000) : null;
}

// =================================================================== Duffel

/**
 * Duffel — https://duffel.com/docs/api/v2/offer-requests/create-offer-request
 * POST https://api.duffel.com/air/offer_requests?return_offers=true
 * Headers: Authorization: Bearer <token>, Duffel-Version: v2. Test tokens start with "duffel_test_".
 */
export class DuffelFlightProvider extends AdapterCore implements FlightProvider {
  readonly id = "duffel";
  readonly name = "Duffel";
  readonly kind = "flight" as const;
  readonly dataAccess = "official_api" as const;
  readonly requiredEnv = ["DUFFEL_ACCESS_TOKEN"] as const;
  protected override ttlSeconds = 900;
  protected override defaultRateLimit = { capacity: 5, refillPerSecond: 2 };

  /** True when configured with a test-mode token (results are Duffel test data, not real fares). */
  isTestMode(): boolean {
    return (this.envValue("DUFFEL_ACCESS_TOKEN") ?? "").startsWith("duffel_test_");
  }

  async searchFlights(params: FlightSearchParams): Promise<FetchResult<FlightOffer[]>> {
    const env = this.requireEnv();
    const { origin, destination } = validate(params);
    const slices = [{ origin, destination, departure_date: params.departDate }];
    if (params.returnDate) slices.push({ origin: destination, destination: origin, departure_date: params.returnDate });
    const passengers = [
      ...Array.from({ length: params.adults }, () => ({ type: "adult" })),
      ...Array.from({ length: params.children ?? 0 }, () => ({ type: "child" })),
      ...Array.from({ length: params.infants ?? 0 }, () => ({ type: "infant_without_seat" })),
    ];
    const body: Record<string, unknown> = { slices, passengers, cabin_class: params.cabin ?? "economy" };
    if (params.maxConnections !== undefined) body.max_connections = params.maxConnections;
    const res = await this.guard(() =>
      this.http.json({
        url: "https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000",
        method: "POST",
        retries: 1,
        headers: {
          Authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`,
          "Duffel-Version": "v2",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: body }),
      }),
    );
    const offers = arr(get(res, "data.offers"))
      .map((o) => this.mapOffer(o))
      .filter((o): o is FlightOffer => o !== null)
      .filter((o) => !params.currency || o.currency === params.currency);
    const warnings = this.isTestMode() ? ["Duffel test mode: offers are sandbox data, not bookable real fares"] : [];
    return this.result(offers, "api", warnings);
  }

  mapOffer(raw: unknown): FlightOffer | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const total = toCents(raw.total_amount);
    const currency = str(raw.total_currency);
    if (!id || total === null || !currency) return null;
    const slices: FlightSlice[] = arr(raw.slices).map((s) => {
      const segments: FlightSegment[] = arr(get(s, "segments")).map((seg) => ({
        origin: str(get(seg, "origin.iata_code")) ?? "",
        destination: str(get(seg, "destination.iata_code")) ?? "",
        departAt: str(get(seg, "departing_at")) ?? "",
        arriveAt: str(get(seg, "arriving_at")) ?? "",
        marketingCarrier: str(get(seg, "marketing_carrier.iata_code")),
        marketingFlightNumber: str(get(seg, "marketing_carrier_flight_number")),
        operatingCarrier: str(get(seg, "operating_carrier.iata_code")),
        // Duffel requires showing the operating carrier name prominently.
        operatingCarrierName: str(get(seg, "operating_carrier.name")),
        durationMinutes: isoDurationToMinutes(get(seg, "duration")),
      }));
      const first = segments[0];
      const last = segments[segments.length - 1];
      return {
        origin: str(get(s, "origin.iata_code")) ?? first?.origin ?? "",
        destination: str(get(s, "destination.iata_code")) ?? last?.destination ?? "",
        departAt: first?.departAt ?? "",
        arriveAt: last?.arriveAt ?? null,
        durationMinutes: isoDurationToMinutes(get(s, "duration")) ?? minutesBetween(first?.departAt ?? null, last?.arriveAt ?? null),
        stops: Math.max(0, segments.length - 1),
        segments,
      };
    });
    return {
      id,
      provider: this.id,
      totalCents: total,
      currency,
      baseCents: toCents(raw.base_amount),
      taxCents: toCents(raw.tax_amount),
      ownerCode: str(get(raw, "owner.iata_code")),
      ownerName: str(get(raw, "owner.name")),
      slices,
      bookable: !this.isTestMode(),
      deepLink: null,
      expiresAt: str(raw.expires_at),
      source: "api",
      cached: false,
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    await this.http.json({
      url: "https://api.duffel.com/air/airlines?limit=1",
      headers: { Authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`, "Duffel-Version": "v2" },
    });
  }
}

// =================================================================== Amadeus

const AMADEUS_CABIN: Record<CabinClass, string> = { economy: "ECONOMY", premium_economy: "PREMIUM_ECONOMY", business: "BUSINESS", first: "FIRST" };

/**
 * Amadeus — Self-Service portal was shut down on 2026-07-17 (keys disabled). Only Enterprise
 * access remains (contract). This adapter keeps the former Self-Service request/response mapping
 * for /v2/shopping/flight-offers and requires an explicit AMADEUS_BASE_URL issued with an
 * Enterprise contract; Enterprise endpoint parity is UNVERIFIED.
 */
export class AmadeusFlightProvider extends AdapterCore implements FlightProvider {
  readonly id = "amadeus";
  readonly name = "Amadeus (Enterprise)";
  readonly kind = "flight" as const;
  readonly dataAccess = "partner_only" as const;
  readonly requiredEnv = ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_BASE_URL"] as const;
  protected override ttlSeconds = 900;
  private readonly tokens: TokenCache;

  constructor(options: AdapterOptions = {}) {
    super(options);
    this.tokens = new TokenCache(this.clock);
  }

  private base(): string {
    const env = this.requireEnv();
    const b = (env.AMADEUS_BASE_URL as string).replace(/\/+$/, "");
    if (/^https:\/\/(test\.)?api\.amadeus\.com$/.test(b) && this.envValue("AMADEUS_ALLOW_SELF_SERVICE") !== "true") {
      throw new ProviderDiscontinuedError(this.id, "Amadeus Self-Service APIs were decommissioned on 2026-07-17; set AMADEUS_BASE_URL to your Enterprise endpoint");
    }
    return b;
  }

  private async token(): Promise<string> {
    const env = this.requireEnv();
    const base = this.base();
    return this.tokens.get(async () => {
      const res = await this.http.json<Record<string, unknown>>({
        url: `${base}/v1/security/oauth2/token`,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.AMADEUS_CLIENT_ID as string, client_secret: env.AMADEUS_CLIENT_SECRET as string }).toString(),
      });
      const accessToken = str(res.access_token);
      if (!accessToken) throw new ResponseShapeError(this.id, "token response without access_token");
      return { accessToken, expiresInSec: typeof res.expires_in === "number" ? res.expires_in : 1799 };
    });
  }

  async searchFlights(params: FlightSearchParams): Promise<FetchResult<FlightOffer[]>> {
    this.requireEnv();
    const { origin, destination } = validate(params);
    const base = this.base();
    const token = await this.token();
    const qs = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: params.departDate,
      adults: String(params.adults),
      travelClass: AMADEUS_CABIN[params.cabin ?? "economy"],
      currencyCode: params.currency ?? "USD",
      max: "50",
    });
    if (params.returnDate) qs.set("returnDate", params.returnDate);
    if (params.children) qs.set("children", String(params.children));
    if (params.infants) qs.set("infants", String(params.infants));
    if (params.maxConnections === 0) qs.set("nonStop", "true");
    const res = await this.guard(() => this.http.json({ url: `${base}/v2/shopping/flight-offers?${qs.toString()}`, headers: { Authorization: `Bearer ${token}` } }));
    const carriers = (get(res, "dictionaries.carriers") ?? {}) as Record<string, unknown>;
    const offers = arr(get(res, "data"))
      .map((o) => this.mapOffer(o, carriers))
      .filter((o): o is FlightOffer => o !== null);
    return this.result(offers, "api");
  }

  mapOffer(raw: unknown, carriers: Record<string, unknown> = {}): FlightOffer | null {
    if (!isObject(raw)) return null;
    const id = str(raw.id);
    const total = toCents(get(raw, "price.grandTotal") ?? get(raw, "price.total"));
    const currency = str(get(raw, "price.currency"));
    if (!id || total === null || !currency) return null;
    const slices: FlightSlice[] = arr(raw.itineraries).map((it) => {
      const segments: FlightSegment[] = arr(get(it, "segments")).map((seg) => {
        const op = str(get(seg, "operating.carrierCode"));
        return {
          origin: str(get(seg, "departure.iataCode")) ?? "",
          destination: str(get(seg, "arrival.iataCode")) ?? "",
          departAt: str(get(seg, "departure.at")) ?? "",
          arriveAt: str(get(seg, "arrival.at")) ?? "",
          marketingCarrier: str(get(seg, "carrierCode")),
          marketingFlightNumber: str(get(seg, "number")),
          operatingCarrier: op,
          operatingCarrierName: op ? str(carriers[op]) : null,
          durationMinutes: isoDurationToMinutes(get(seg, "duration")),
        };
      });
      const first = segments[0];
      const last = segments[segments.length - 1];
      return {
        origin: first?.origin ?? "",
        destination: last?.destination ?? "",
        departAt: first?.departAt ?? "",
        arriveAt: last?.arriveAt ?? null,
        durationMinutes: isoDurationToMinutes(get(it, "duration")),
        stops: Math.max(0, segments.length - 1),
        segments,
      };
    });
    const owner = str(get(raw, "validatingAirlineCodes.0"));
    return {
      id,
      provider: this.id,
      totalCents: total,
      currency,
      baseCents: toCents(get(raw, "price.base")),
      taxCents: null,
      ownerCode: owner,
      ownerName: owner ? str(carriers[owner]) : null,
      slices,
      bookable: false,
      deepLink: null,
      expiresAt: null,
      source: "api",
      cached: false,
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    await this.token();
  }
}

// =================================================================== Travelpayouts

/**
 * Travelpayouts — Aviasales Data API v3 `prices_for_dates`.
 * GET https://api.travelpayouts.com/aviasales/v3/prices_for_dates (X-Access-Token header)
 * Returns the cheapest fares Aviasales users found in the last ~48 hours: CACHED, not live,
 * and not bookable here — users are redirected to Aviasales with our `marker`.
 */
export class TravelpayoutsFlightProvider extends AdapterCore implements FlightProvider {
  readonly id = "travelpayouts";
  readonly name = "Travelpayouts (Aviasales)";
  readonly kind = "flight" as const;
  readonly dataAccess = "affiliate_feed" as const;
  readonly requiredEnv = ["TRAVELPAYOUTS_TOKEN", "TRAVELPAYOUTS_MARKER"] as const;
  protected override ttlSeconds = 6 * 3600;

  async searchFlights(params: FlightSearchParams): Promise<FetchResult<FlightOffer[]>> {
    const env = this.requireEnv();
    const { origin, destination } = validate(params);
    const currency = (params.currency ?? "USD").toLowerCase();
    const qs = new URLSearchParams({
      origin,
      destination,
      departure_at: params.departDate,
      currency,
      sorting: "price",
      limit: "30",
      page: "1",
      one_way: params.returnDate ? "false" : "true",
      market: "us",
    });
    if (params.returnDate) qs.set("return_at", params.returnDate);
    if (params.maxConnections === 0) qs.set("direct", "true");
    const res = await this.guard(() =>
      this.http.json({ url: `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${qs.toString()}`, headers: { "X-Access-Token": env.TRAVELPAYOUTS_TOKEN as string } }),
    );
    if (get(res, "success") === false) throw new ResponseShapeError(this.id, str(get(res, "error")) ?? "success=false");
    const respCurrency = (str(get(res, "currency")) ?? currency).toUpperCase();
    const offers = arr(get(res, "data"))
      .map((r, i) => this.mapTicket(r, respCurrency, env.TRAVELPAYOUTS_MARKER as string, i))
      .filter((o): o is FlightOffer => o !== null);
    return this.result(offers, "affiliate", ["Cached fares from Aviasales searches (up to 48h old); price confirmed on the partner site"], true);
  }

  mapTicket(raw: unknown, currency: string, marker: string, index = 0): FlightOffer | null {
    if (!isObject(raw)) return null;
    const total = toCents(raw.price);
    const origin = str(raw.origin_airport) ?? str(raw.origin);
    const destination = str(raw.destination_airport) ?? str(raw.destination);
    const departAt = str(raw.departure_at);
    if (total === null || !origin || !destination || !departAt) return null;
    const transfers = typeof raw.transfers === "number" ? raw.transfers : 0;
    const out: FlightSlice = {
      origin,
      destination,
      departAt,
      arriveAt: null,
      durationMinutes: typeof raw.duration_to === "number" ? raw.duration_to : typeof raw.duration === "number" && !raw.return_at ? raw.duration : null,
      stops: transfers,
      segments: [],
    };
    const slices: FlightSlice[] = [out];
    const returnAt = str(raw.return_at);
    if (returnAt) {
      slices.push({
        origin: destination,
        destination: origin,
        departAt: returnAt,
        arriveAt: null,
        durationMinutes: typeof raw.duration_back === "number" ? raw.duration_back : null,
        stops: typeof raw.return_transfers === "number" ? raw.return_transfers : 0,
        segments: [],
      });
    }
    const link = str(raw.link);
    let deepLink: string | null = null;
    if (link) {
      const u = new URL(link, "https://www.aviasales.com");
      u.searchParams.set("marker", marker);
      deepLink = u.toString();
    }
    const airline = str(raw.airline);
    return {
      id: `tp_${origin}_${destination}_${departAt}_${str(raw.flight_number) ?? index}`,
      provider: this.id,
      totalCents: total,
      currency,
      baseCents: null,
      taxCents: null,
      ownerCode: airline,
      ownerName: null,
      slices,
      bookable: false,
      deepLink,
      expiresAt: null,
      source: "affiliate",
      cached: true,
      fetchedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  protected async ping(): Promise<void> {
    const env = this.requireEnv();
    await this.http.json({
      url: "https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=NYC&destination=LAX&limit=1&currency=usd",
      headers: { "X-Access-Token": env.TRAVELPAYOUTS_TOKEN as string },
    });
  }
}
