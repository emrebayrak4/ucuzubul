/**
 * Shared adapter core (env/status/health/freshness) + retailer base class.
 */
import { AdapterHttpError, PendingConfigurationError } from "./errors";
import { HttpClient, type Clock, type FetchLike, type HttpClientOptions, type RateLimitOptions } from "./http";
import type {
  AdapterStatus,
  AffiliateLinkOptions,
  AvailabilityResult,
  DataAccess,
  EnvLike,
  FetchResult,
  Freshness,
  HealthCheckResult,
  NormalizedListing,
  NormalizedOffer,
  OfferSource,
  ProductQuery,
  RetailerAdapter,
  ValidationIssue,
  ValidationResult,
} from "./types";
import { cleanGtin, defaultEnv, readEnv, toCents } from "./util";

export interface AdapterOptions {
  /** Environment to read credentials from. Defaults to process.env. */
  env?: EnvLike;
  fetch?: FetchLike;
  clock?: Clock;
  random?: () => number;
  /** Override HTTP settings (timeouts, retries, rate limit, circuit). */
  http?: Partial<Omit<HttpClientOptions, "adapterId" | "fetch" | "clock" | "random">>;
}

export abstract class AdapterCore {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly dataAccess: DataAccess;
  abstract readonly requiredEnv: readonly string[];
  /** Default cache TTL for results (seconds). */
  protected ttlSeconds = 3600;
  protected defaultRateLimit: RateLimitOptions = { capacity: 5, refillPerSecond: 1 };
  protected readonly env: EnvLike;
  protected readonly clock: Clock;
  private httpClient: HttpClient | null = null;
  private lastError: string | null = null;

  constructor(protected readonly options: AdapterOptions = {}) {
    this.env = options.env ?? defaultEnv();
    this.clock = options.clock ?? { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  }

  /** Lazily created so subclasses can set `defaultRateLimit` in field initializers. */
  protected get http(): HttpClient {
    if (!this.httpClient) {
      this.httpClient = new HttpClient({
        adapterId: this.id,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        clock: this.clock,
        ...(this.options.random ? { random: this.options.random } : {}),
        rateLimit: this.defaultRateLimit,
        ...this.options.http,
      });
    }
    return this.httpClient;
  }

  missingEnv(): string[] {
    return readEnv(this.env, this.requiredEnv).missing;
  }

  status(): AdapterStatus {
    if (this.missingEnv().length > 0) return "pending_configuration";
    return this.lastError ? "error" : "live";
  }

  /** Last error that put the adapter in "error" status (auth failures etc.). */
  statusDetail(): string | null {
    return this.lastError;
  }

  protected envValue(key: string): string | undefined {
    const v = this.env[key];
    return v && v.trim() !== "" ? v.trim() : undefined;
  }

  protected requireEnv(): Record<string, string> {
    // missingEnv() may be overridden (e.g. legal/feature flags that must equal "true").
    const missing = this.missingEnv();
    if (missing.length > 0) throw new PendingConfigurationError(this.id, missing);
    return readEnv(this.env, this.requiredEnv).values;
  }

  protected freshness(source: OfferSource, cached = false, ttlSeconds = this.ttlSeconds): Freshness {
    const now = this.clock.now();
    return {
      provider: this.id,
      source,
      fetchedAt: new Date(now).toISOString(),
      ttlSeconds,
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
      cached,
    };
  }

  protected result<T>(data: T, source: OfferSource, warnings: string[] = [], cached = false): FetchResult<T> {
    return { data, freshness: this.freshness(source, cached), warnings };
  }

  /** Wrap an upstream call: auth failures (401/403) flip status to "error". */
  protected async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const out = await fn();
      this.lastError = null;
      return out;
    } catch (err) {
      if (err instanceof AdapterHttpError && (err.status === 401 || err.status === 403)) {
        this.lastError = `Authentication failed (HTTP ${err.status})`;
      }
      throw err;
    }
  }

  /** Cheapest real upstream call proving credentials work. */
  protected abstract ping(): Promise<void>;

  async healthCheck(): Promise<HealthCheckResult> {
    const checkedAt = new Date(this.clock.now()).toISOString();
    const missing = this.missingEnv();
    if (missing.length > 0) {
      return { adapterId: this.id, status: "pending_configuration", ok: false, latencyMs: null, message: `Missing env: ${missing.join(", ")}`, checkedAt, missingEnv: missing };
    }
    const start = this.clock.now();
    try {
      await this.guard(() => this.ping());
      return { adapterId: this.id, status: "live", ok: true, latencyMs: this.clock.now() - start, message: "OK", checkedAt, missingEnv: [] };
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return { adapterId: this.id, status: "error", ok: false, latencyMs: this.clock.now() - start, message: this.lastError, checkedAt, missingEnv: [] };
    }
  }
}

export abstract class BaseRetailerAdapter extends AdapterCore implements RetailerAdapter {
  readonly kind = "retailer" as const;
  /** OfferSource stamped on results. */
  protected abstract readonly source: OfferSource;

  abstract fetchProducts(query: ProductQuery): Promise<FetchResult<NormalizedListing[]>>;
  abstract fetchProductDetails(retailerSku: string): Promise<FetchResult<NormalizedListing | null>>;
  abstract normalizeProduct(raw: unknown): NormalizedListing | null;

  async fetchOffers(query: ProductQuery): Promise<FetchResult<NormalizedOffer[]>> {
    const r = await this.fetchProducts(query);
    return { ...r, data: r.data.map((l) => l.offer).filter((o): o is NormalizedOffer => o !== null) };
  }

  async fetchAvailability(retailerSkus: readonly string[]): Promise<FetchResult<AvailabilityResult[]>> {
    this.requireEnv();
    const out: AvailabilityResult[] = [];
    const warnings: string[] = [];
    for (const sku of retailerSkus) {
      const r = await this.fetchProductDetails(sku);
      const offer = r.data?.offer ?? null;
      if (!r.data) warnings.push(`SKU ${sku} not found`);
      out.push({
        retailerSku: sku,
        availability: offer?.availability ?? "unknown",
        priceCents: offer?.priceCents ?? null,
        observedAt: r.freshness.fetchedAt,
      });
    }
    return this.result(out, this.source, warnings);
  }

  normalizePrice(raw: unknown): number | null {
    return toCents(raw);
  }

  validateData(listing: NormalizedListing): ValidationResult {
    return validateListing(listing);
  }

  generateAffiliateLink(_productUrl: string, _opts?: AffiliateLinkOptions): string | null {
    return null;
  }

  protected nowIso(): string {
    return new Date(this.clock.now()).toISOString();
  }
}

/** Common data-quality checks for any normalized listing. */
export function validateListing(listing: NormalizedListing): ValidationResult {
  const issues: ValidationIssue[] = [];
  const p = listing.product;
  if (!p.retailerSku) issues.push({ field: "product.retailerSku", message: "missing retailer SKU", severity: "error" });
  if (!p.title || p.title.trim().length < 3) issues.push({ field: "product.title", message: "missing or too short title", severity: "error" });
  if (p.gtin !== null && !cleanGtin(p.gtin)) issues.push({ field: "product.gtin", message: "invalid GTIN check digit", severity: "error" });
  if (p.gtin === null) issues.push({ field: "product.gtin", message: "no GTIN; matching will rely on brand/MPN/title", severity: "warning" });
  if (p.productUrl && !/^https:\/\//.test(p.productUrl)) issues.push({ field: "product.productUrl", message: "URL must be https", severity: "warning" });
  const o = listing.offer;
  if (!o) {
    issues.push({ field: "offer", message: "no valid price; listing cannot be shown as an offer", severity: "warning" });
  } else {
    if (!Number.isInteger(o.priceCents) || o.priceCents <= 0) issues.push({ field: "offer.priceCents", message: "price must be a positive integer (cents)", severity: "error" });
    if (!/^[A-Z]{3}$/.test(o.currency)) issues.push({ field: "offer.currency", message: "currency must be ISO 4217", severity: "error" });
    if (o.listPriceCents !== null && o.listPriceCents < o.priceCents) issues.push({ field: "offer.listPriceCents", message: "list price below current price", severity: "warning" });
    if (o.shippingCents !== null && (!Number.isInteger(o.shippingCents) || o.shippingCents < 0)) issues.push({ field: "offer.shippingCents", message: "shipping must be a non-negative integer", severity: "error" });
    if (o.priceCents > 10_000_000) issues.push({ field: "offer.priceCents", message: "price above $100,000 — verify", severity: "warning" });
  }
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
