/** Small self-contained helpers: money parsing, GTIN check, availability/condition mapping, safe access. */
import type { Availability, Condition, EnvLike } from "./types";

/**
 * Convert a major-unit amount to integer cents without float drift.
 * Accepts numbers (29.99), numeric strings ("1,299.99", "$1299", "1299.99 USD", "USD 12.5").
 * Returns null for anything unparsable, negative, or with more than 2 decimals of real precision.
 */
export function toCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return toCents(value.toFixed(2));
  }
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^[A-Z]{3}\s+/i, "").replace(/\s+[A-Z]{3}$/i, "").replace(/^\$/, "").replace(/,/g, "").trim();
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(cleaned);
  if (!m) return null;
  const whole = Number(m[1]);
  const fracRaw = m[2] ?? "";
  // round half-up on the third decimal (providers sometimes send 4 decimals: "12.3450")
  const frac2 = Number((fracRaw + "00").slice(0, 2));
  const third = Number((fracRaw + "000")[2]);
  const cents = whole * 100 + frac2 + (third >= 5 ? 1 : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Extract an ISO currency code from strings like "1299.99 USD" / "USD 12"; null if none. */
export function currencyFromPriceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /(?:^|\s)([A-Z]{3})(?:\s|$)/.exec(value.trim());
  return m ? (m[1] as string) : null;
}

export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  let sum = 0;
  const body = code.slice(0, -1);
  for (let i = 0; i < body.length; i++) sum += (body.charCodeAt(body.length - 1 - i) - 48) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === code.charCodeAt(code.length - 1) - 48;
}

/** Clean and validate a GTIN; returns the digits or null. */
export function cleanGtin(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/[\s-]/g, "");
  return isValidGtin(digits) ? digits : null;
}

export function mapAvailability(value: unknown): Availability {
  if (typeof value === "boolean") return value ? "in_stock" : "out_of_stock";
  if (typeof value !== "string") return "unknown";
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["in_stock", "instock", "available", "yes", "true", "1", "high", "in_stock_scarce_no"].includes(v)) return "in_stock";
  if (["limited", "limited_stock", "low", "in_stock_scarce", "limited_supply", "only_a_few_left"].includes(v)) return "limited";
  if (["out_of_stock", "outofstock", "not_available", "unavailable", "sold_out", "no", "false", "0", "temporarily_out_of_stock", "discontinued"].includes(v)) return "out_of_stock";
  if (["preorder", "pre_order", "available_for_preorder"].includes(v)) return "preorder";
  if (["backorder", "back_order", "backordered", "leadtime", "available_date"].includes(v)) return "backorder";
  return "unknown";
}

/**
 * Free-text / feed condition → Condition. Missing or unrecognized values map to "unknown" — never to "new" —
 * so second-hand listings can't win "lowest new price" by omission. Retailers that only sell new pass "new" explicitly.
 */
export function mapCondition(value: unknown): Condition {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  const v = value.trim().toLowerCase();
  if (/for parts|not working|parts only|for_parts/.test(v)) return "for_parts";
  if (/open[\s_-]?box|new other|new \(other\)|new with defects|damaged box/.test(v)) return "open_box";
  if (/refurb|renewed|reconditioned|remanufactured/.test(v)) return "refurbished";
  if (/used|pre-?owned|collectible|like new|very good|acceptable|good/.test(v)) return "used";
  if (/^(new|brand new|new_condition|newcondition|https?:\/\/schema\.org\/newcondition)$/.test(v) || v === "new item") return "new";
  return "unknown";
}

export function readEnv(env: EnvLike, keys: readonly string[]): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const k of keys) {
    const v = env[k];
    if (v === undefined || v.trim() === "") missing.push(k);
    else values[k] = v.trim();
  }
  return { values, missing };
}

/** Default env source: process.env when available (Node), else empty. */
export function defaultEnv(): EnvLike {
  const p = (globalThis as unknown as { process?: { env?: EnvLike } }).process;
  return p?.env ?? {};
}

/** Drop null/undefined values from an attribute map. */
export function compactAttrs(o: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "string" && v !== "") out[k] = v;
  return out;
}

export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Safe nested access: get(obj, "a.b.0.c"). */
export function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(part)];
    else if (isObject(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

export function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** ISO-8601 duration ("PT5H30M", "P1DT2H") -> minutes; null if unparsable. */
export function isoDurationToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === "P" || value.trim() === "PT") return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + (Number(m[4] ?? 0) >= 30 ? 1 : 0);
}

export function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new RangeError("checkout must be after checkin (YYYY-MM-DD)");
  return Math.round((b - a) / 86_400_000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function assertDate(value: string, field: string): void {
  if (!DATE_RE.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) throw new RangeError(`${field} must be YYYY-MM-DD`);
}

export function assertIata(value: string, field: string): string {
  const v = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) throw new RangeError(`${field} must be a 3-letter IATA code`);
  return v;
}

/** Base64 without Buffer/btoa typing concerns (Node has Buffer; browsers btoa). */
export function base64(input: string): string {
  const g = globalThis as unknown as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } }; btoa?: (s: string) => string };
  if (g.Buffer) return g.Buffer.from(input, "utf8").toString("base64");
  if (g.btoa) return g.btoa(unescape(encodeURIComponent(input)));
  throw new Error("No base64 encoder available");
}
