/**
 * Provider-agnostic analytics: typed track() over pluggable sinks.
 * Default sink is a no-op, so nothing leaves the process until a sink is configured.
 */
import { isEventName, type EventMap, type EventName } from "./events";

export * from "./events";

export type AppSurface = "web" | "admin" | "mobile" | "api" | "worker" | "extension";

export interface AnalyticsContext {
  app: AppSurface;
  appVersion?: string;
  /** Opaque random id for the device/browser (no fingerprinting, no user identity). */
  anonymousId?: string;
  sessionId?: string;
}

export interface AnalyticsEvent<N extends EventName = EventName> {
  name: N;
  properties: EventMap[N];
  timestamp: string;
  context: AnalyticsContext;
  /** Keys removed or values redacted by the PII guard. */
  redactions: string[];
}

export interface AnalyticsSink {
  name: string;
  send(event: AnalyticsEvent): void | Promise<void>;
  flush?(): void | Promise<void>;
}

export interface AnalyticsOptions {
  context: AnalyticsContext;
  sinks?: AnalyticsSink[];
  /** Global kill switch / consent gate. When false, track() is a no-op. Default true. */
  enabled?: boolean;
  /** Called when a sink throws; analytics never throws into product code. */
  onError?: (error: unknown, sink: string) => void;
  now?: () => Date;
}

export interface Analytics {
  track<N extends EventName>(name: N, properties: EventMap[N]): AnalyticsEvent<N> | null;
  setEnabled(enabled: boolean): void;
  setSinks(sinks: AnalyticsSink[]): void;
  setContext(patch: Partial<AnalyticsContext>): void;
  flush(): Promise<void>;
}

// ---------------------------------------------------------------- PII guard

/** Property keys that are never allowed in analytics payloads. */
export const FORBIDDEN_KEYS = [
  "email", "e_mail", "name", "firstname", "first_name", "lastname", "last_name", "fullname", "full_name", "phone",
  "phonenumber", "phone_number", "address", "street", "zip", "zipcode", "postal_code", "ip", "ipaddress", "ip_address",
  "password", "token", "access_token", "refresh_token", "session_token", "secret", "apikey", "api_key", "card",
  "cardnumber", "card_number", "ssn", "dob", "birthdate", "query", "q", "search_text", "user_agent", "useragent",
  "latitude", "longitude", "lat", "lng",
] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_KEYS);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** Phone numbers written with separators ("(415) 555-0100", "415.555.0100", "+1 415 555 0100"). */
const PHONE_RE = /(?:\+?1[\s.-])?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
const CARD_CANDIDATE_RE = /\b\d(?:[ -]?\d){12,18}\b/g;

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits.charCodeAt(digits.length - 1 - i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function looksLikeCard(value: string): boolean {
  for (const m of value.match(CARD_CANDIDATE_RE) ?? []) {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
  }
  return false;
}

/** Remove forbidden keys and redact PII-looking string values. Returns a new object. */
export function sanitizeProperties(props: Record<string, unknown>): { properties: Record<string, unknown>; redactions: string[] } {
  const out: Record<string, unknown> = {};
  const redactions: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (FORBIDDEN.has(key.toLowerCase())) {
      redactions.push(key);
      continue;
    }
    if (typeof value === "string" && (EMAIL_RE.test(value) || PHONE_RE.test(value) || looksLikeCard(value))) {
      out[key] = "[redacted]";
      redactions.push(key);
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeProperties(value as Record<string, unknown>);
      out[key] = nested.properties;
      redactions.push(...nested.redactions.map((r) => `${key}.${r}`));
      continue;
    }
    out[key] = value;
  }
  return { properties: out, redactions };
}

// ---------------------------------------------------------------- sinks

export const noopSink: AnalyticsSink = { name: "noop", send: () => undefined };

interface ConsoleLike {
  info?: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
}

/** Dev sink: prints events to the console. Never use in production. */
export function consoleSink(prefix = "[analytics]"): AnalyticsSink {
  return {
    name: "console",
    send(event) {
      const c = (globalThis as unknown as { console?: ConsoleLike }).console;
      (c?.info ?? c?.log)?.(prefix, event.name, event.properties);
    },
  };
}

/** In-memory sink (tests, debugging panels). */
export function memorySink(): AnalyticsSink & { events: AnalyticsEvent[]; clear(): void } {
  const events: AnalyticsEvent[] = [];
  return {
    name: "memory",
    events,
    send(event) {
      events.push(event);
    },
    clear() {
      events.length = 0;
    },
  };
}

// ---------------------------------------------------------------- factory

export function createAnalytics(options: AnalyticsOptions): Analytics {
  let sinks = options.sinks ?? [noopSink];
  let enabled = options.enabled ?? true;
  let context: AnalyticsContext = { ...options.context };
  const now = options.now ?? (() => new Date());
  const onError = options.onError ?? (() => undefined);
  const pending = new Set<Promise<void>>();

  return {
    track(name, properties) {
      if (!enabled) return null;
      if (!isEventName(name)) {
        onError(new Error(`Unknown analytics event: ${String(name)}`), "core");
        return null;
      }
      const { properties: clean, redactions } = sanitizeProperties(properties as unknown as Record<string, unknown>);
      const event = {
        name,
        properties: clean as unknown as EventMap[typeof name],
        timestamp: now().toISOString(),
        context: { ...context },
        redactions,
      };
      for (const sink of sinks) {
        try {
          const r = sink.send(event as AnalyticsEvent);
          if (r && typeof (r as Promise<void>).then === "function") {
            const p = (r as Promise<void>).catch((e: unknown) => onError(e, sink.name)).finally(() => pending.delete(p));
            pending.add(p);
          }
        } catch (e) {
          onError(e, sink.name);
        }
      }
      return event;
    },
    setEnabled(v) {
      enabled = v;
    },
    setSinks(s) {
      sinks = s;
    },
    setContext(patch) {
      context = { ...context, ...patch };
    },
    async flush() {
      await Promise.all([...pending]);
      for (const sink of sinks) {
        try {
          await sink.flush?.();
        } catch (e) {
          onError(e, sink.name);
        }
      }
    },
  };
}

/** Shared default instance: no-op until `analytics.setSinks([...])` is called. */
export const analytics: Analytics = createAnalytics({ context: { app: "web" } });

/** Convenience wrapper over the default instance. */
export function track<N extends EventName>(name: N, properties: EventMap[N]): AnalyticsEvent<N> | null {
  return analytics.track(name, properties);
}
