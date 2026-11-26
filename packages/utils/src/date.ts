export type DateInput = Date | string | number;

function toDate(input: DateInput): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new RangeError("Invalid date: " + String(input));
  return d;
}

export interface UsDateOptions {
  /** IANA time zone. Default "America/New_York". */
  timeZone?: string;
}

/** "Nov 26, 2026" */
export function formatDateUS(input: DateInput, options: UsDateOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: options.timeZone ?? "America/New_York",
  }).format(toDate(input));
}

/** "11/26/2026" */
export function formatDateShortUS(input: DateInput, options: UsDateOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: options.timeZone ?? "America/New_York",
  }).format(toDate(input));
}

/** "Nov 26, 2026, 3:05 PM EST" */
export function formatDateTimeUS(input: DateInput, options: UsDateOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: options.timeZone ?? "America/New_York",
  }).format(toDate(input));
}

/** "Thu, Nov 26" — compact travel-style date */
export function formatTravelDate(input: DateInput, options: UsDateOptions = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: options.timeZone ?? "UTC",
  }).format(toDate(input));
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

/** "5 minutes ago", "in 2 days". `now` injectable for tests. */
export function formatRelativeTime(input: DateInput, now: DateInput = Date.now()): string {
  const diffSec = Math.round((toDate(input).getTime() - toDate(now).getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const [unit, sec] of RELATIVE_UNITS) {
    if (abs >= sec) return rtf.format(Math.round(diffSec / sec), unit);
  }
  return "just now";
}

/** Minutes → "2h 35m" (flight durations). */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return m + "m";
  if (m === 0) return h + "h";
  return h + "h " + m + "m";
}

/** YYYY-MM-DD in UTC. */
export function toIsoDate(input: DateInput): string {
  return toDate(input).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(input: DateInput, days: number): Date {
  const d = new Date(toDate(input).getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Whole nights between two ISO dates (hotel stays). */
export function nightsBetween(checkin: DateInput, checkout: DateInput): number {
  const ms = toDate(checkout).getTime() - toDate(checkin).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}
