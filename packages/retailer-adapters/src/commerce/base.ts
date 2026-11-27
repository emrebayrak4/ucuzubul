/** Shared plumbing for commerce connectors: config/status, lazy HTTP client, error -> result mapping. */
import { AdapterError, AdapterHttpError } from "../errors";
import { HttpClient, systemClock, type Clock, type FetchLike, type HttpClientOptions } from "../http";
import { readEnv } from "../util";
import type {
  CommerceCondition,
  CommerceConfig,
  CommerceConnector,
  CommerceProvider,
  CommerceStock,
  CommerceSyncOptions,
  CommerceSyncResult,
} from "./types";

export interface CommerceConnectorOptions {
  fetch?: FetchLike;
  clock?: Clock;
  random?: () => number;
  http?: Partial<Omit<HttpClientOptions, "adapterId" | "fetch" | "clock" | "random">>;
}

/** Quantity -> stock bucket. null = unknown, <=0 out, 1–3 low, else in stock. */
export function stockFromQuantity(quantity: number | null): CommerceStock {
  if (quantity === null || !Number.isFinite(quantity)) return "unknown";
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= 3) return "low_stock";
  return "in_stock";
}

/**
 * Platforms without a per-product condition field (Shopify, WooCommerce, Square, Clover) use the
 * merchant-declared `defaultCondition` config value; otherwise "unknown" (never assumed new).
 */
export function declaredCondition(value: string | undefined): CommerceCondition {
  const v = value?.trim().toLowerCase();
  return v === "new" || v === "refurbished" || v === "used" ? v : "unknown";
}

/** Parse an integer-ish quantity ("5", 5, "2.000") -> number; null if absent/unparsable. */
export function parseQuantity(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Strip HTML tags/entities from a description; null when empty. */
export function plainText(html: unknown): string | null {
  if (typeof html !== "string") return null;
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return t === "" ? null : t;
}

/** Integer minor units passed through as-is (Square/Clover already send cents). */
export function integerCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

export abstract class BaseCommerceConnector implements CommerceConnector {
  abstract readonly provider: CommerceProvider;
  abstract readonly requiredConfig: string[];
  protected readonly clock: Clock;
  private httpClient: HttpClient | null = null;

  constructor(
    protected readonly config: CommerceConfig,
    protected readonly options: CommerceConnectorOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
  }

  protected get http(): HttpClient {
    if (!this.httpClient) {
      this.httpClient = new HttpClient({
        adapterId: `commerce:${this.provider}`,
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
        clock: this.clock,
        ...(this.options.random ? { random: this.options.random } : {}),
        rateLimit: { capacity: 4, refillPerSecond: 2 },
        ...this.options.http,
      });
    }
    return this.httpClient;
  }

  missingConfig(): string[] {
    return readEnv(this.config, this.requiredConfig).missing;
  }

  status(): "live" | "pending_configuration" {
    return this.missingConfig().length > 0 ? "pending_configuration" : "live";
  }

  protected cfg(key: string): string | undefined {
    const v = this.config[key];
    return v !== undefined && v.trim() !== "" ? v.trim() : undefined;
  }

  /** Value of a required field (only call after the pending check in sync()). */
  protected required(key: string): string {
    const v = this.cfg(key);
    if (v === undefined) throw new RangeError(`missing config field ${key}`);
    return v;
  }

  protected get defaultCondition(): CommerceCondition {
    return declaredCondition(this.cfg("defaultCondition"));
  }

  protected abstract fetchPage(opts: CommerceSyncOptions): Promise<Omit<CommerceSyncResult, "provider" | "status">>;

  async sync(opts: CommerceSyncOptions = {}): Promise<CommerceSyncResult> {
    const missing = this.missingConfig();
    if (missing.length > 0) {
      return { provider: this.provider, status: "pending_configuration", message: `Missing config: ${missing.join(", ")}`, products: [], locations: [] };
    }
    try {
      const page = await this.fetchPage(opts);
      return { provider: this.provider, status: "ok", ...page };
    } catch (err) {
      return { provider: this.provider, status: "error", message: describeError(err), products: [], locations: [] };
    }
  }
}

export function describeError(err: unknown): string {
  if (err instanceof AdapterHttpError) {
    if (err.status === 401 || err.status === 403) return `Authentication failed (HTTP ${err.status})`;
    return err.message;
  }
  if (err instanceof AdapterError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export function clampLimit(limit: number | undefined, def: number, max: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return def;
  return Math.min(max, Math.max(1, Math.floor(limit)));
}
