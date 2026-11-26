/**
 * Shared HTTP layer for all adapters:
 *   - per-request timeout (AbortController)
 *   - retry with exponential backoff + full jitter (429 / 5xx / network / timeout), honoring Retry-After
 *   - per-adapter token-bucket rate limiter
 *   - circuit breaker (closed -> open after N consecutive failures -> half-open trial)
 * Clock, sleep, randomness and fetch are injectable for deterministic tests.
 */
import { AdapterHttpError, AdapterTimeoutError, CircuitOpenError } from "./errors";

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface FetchInitLike {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init: FetchInitLike) => Promise<FetchResponseLike>;

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// ------------------------------------------------------------------ token bucket

export interface RateLimitOptions {
  /** Max burst. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly opts: RateLimitOptions,
    private readonly clock: Clock = systemClock,
  ) {
    if (opts.capacity <= 0 || opts.refillPerSecond <= 0) throw new RangeError("capacity and refillPerSecond must be > 0");
    this.tokens = opts.capacity;
    this.last = clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = (now - this.last) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.opts.capacity, this.tokens + elapsed * this.opts.refillPerSecond);
      this.last = now;
    }
  }

  /** Take a token if available without waiting. */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Milliseconds until one token is available. */
  waitTimeMs(): number {
    this.refill();
    return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.opts.refillPerSecond) * 1000);
  }

  /** Wait (via clock.sleep) until a token is available, then take it. */
  async take(): Promise<void> {
    for (;;) {
      if (this.tryTake()) return;
      await this.clock.sleep(Math.max(1, this.waitTimeMs()));
    }
  }

  available(): number {
    this.refill();
    return this.tokens;
  }
}

// ------------------------------------------------------------------ circuit breaker

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;
  constructor(
    private readonly adapterId: string,
    private readonly opts: CircuitBreakerOptions,
    private readonly clock: Clock = systemClock,
  ) {}

  get state(): CircuitState {
    if (this.openedAt === null) return "closed";
    return this.clock.now() - this.openedAt >= this.opts.resetTimeoutMs ? "half_open" : "open";
  }

  /** Throws CircuitOpenError when calls are not allowed. */
  beforeCall(): void {
    const s = this.state;
    if (s === "open") throw new CircuitOpenError(this.adapterId, (this.openedAt as number) + this.opts.resetTimeoutMs);
    if (s === "half_open") {
      if (this.trialInFlight) throw new CircuitOpenError(this.adapterId, this.clock.now() + this.opts.resetTimeoutMs);
      this.trialInFlight = true;
    }
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  onFailure(): void {
    this.trialInFlight = false;
    if (this.openedAt !== null) {
      // failed half-open trial -> re-open
      this.openedAt = this.clock.now();
      return;
    }
    this.failures++;
    if (this.failures >= this.opts.failureThreshold) this.openedAt = this.clock.now();
  }
}

// ------------------------------------------------------------------ retry

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/** Full-jitter exponential backoff: random(0, min(max, base * 2^attempt)). */
export function backoffDelay(attempt: number, opts: RetryOptions, random: () => number = Math.random): number {
  const cap = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * cap);
}

/** Parse Retry-After (seconds or HTTP date) into ms; null if absent/invalid. */
export function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const t = Date.parse(value);
  return Number.isFinite(t) ? Math.max(0, t - nowMs) : null;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

// ------------------------------------------------------------------ client

export interface HttpClientOptions {
  adapterId: string;
  fetch?: FetchLike;
  clock?: Clock;
  random?: () => number;
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  rateLimit?: RateLimitOptions;
  circuit?: Partial<CircuitBreakerOptions>;
  userAgent?: string;
}

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  /** Override retries for non-idempotent calls. */
  retries?: number;
}

export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  text: string;
  attempts: number;
}

export class HttpClient {
  readonly adapterId: string;
  readonly bucket: TokenBucket;
  readonly breaker: CircuitBreaker;
  private readonly fetchImpl: FetchLike;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;
  private readonly userAgent: string;

  constructor(opts: HttpClientOptions) {
    this.adapterId = opts.adapterId;
    this.clock = opts.clock ?? systemClock;
    this.random = opts.random ?? Math.random;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.retry = { retries: 3, baseDelayMs: 250, maxDelayMs: 8_000, ...opts.retry };
    this.bucket = new TokenBucket(opts.rateLimit ?? { capacity: 5, refillPerSecond: 5 }, this.clock);
    this.breaker = new CircuitBreaker(opts.adapterId, { failureThreshold: 5, resetTimeoutMs: 30_000, ...opts.circuit }, this.clock);
    this.userAgent = opts.userAgent ?? "PricoraBot/0.1 (+price-comparison; adapters)";
    const f = opts.fetch ?? (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (!f) throw new Error("No fetch implementation available");
    this.fetchImpl = f;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const retries = req.retries ?? this.retry.retries;
    let attempt = 0;
    for (;;) {
      this.breaker.beforeCall();
      await this.bucket.take();
      try {
        const res = await this.once(req);
        if (res.status >= 200 && res.status < 300) {
          this.breaker.onSuccess();
          return { ...res, attempts: attempt + 1 };
        }
        const retryable = isRetryableStatus(res.status);
        if (!retryable || attempt >= retries) {
          // 4xx client errors are not the provider being down; don't trip the breaker on them
          if (retryable) this.breaker.onFailure();
          else this.breaker.onSuccess();
          throw new AdapterHttpError(this.adapterId, res.status, res.text, retryable);
        }
        this.breaker.onFailure();
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"), this.clock.now());
        const delay = retryAfter !== null ? Math.min(retryAfter, this.retry.maxDelayMs) : backoffDelay(attempt, this.retry, this.random);
        await this.clock.sleep(delay);
      } catch (err) {
        if (err instanceof AdapterHttpError) throw err;
        this.breaker.onFailure();
        if (attempt >= retries) throw err;
        await this.clock.sleep(backoffDelay(attempt, this.retry, this.random));
      }
      attempt++;
    }
  }

  async json<T = unknown>(req: HttpRequest): Promise<T> {
    const res = await this.request({ ...req, headers: { Accept: "application/json", ...req.headers } });
    try {
      return JSON.parse(res.text) as T;
    } catch {
      throw new AdapterHttpError(this.adapterId, res.status, `Invalid JSON: ${res.text.slice(0, 200)}`, false);
    }
  }

  private async once(req: HttpRequest): Promise<Omit<HttpResponse, "attempts">> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const res = await Promise.race([
        this.fetchImpl(req.url, {
          method: req.method ?? "GET",
          headers: { "User-Agent": this.userAgent, ...req.headers },
          ...(req.body !== undefined ? { body: req.body } : {}),
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => reject(new AdapterTimeoutError(this.adapterId, this.timeoutMs)));
        }),
      ]);
      const text = await res.text();
      return { status: res.status, headers: res.headers, text };
    } catch (err) {
      if (timedOut) throw new AdapterTimeoutError(this.adapterId, this.timeoutMs);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
