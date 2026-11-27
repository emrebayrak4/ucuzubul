import { ApiError } from "@pricora/api-client";
import type { BusinessCategory, DataQualityFlag, GeoPrecision, StoreHours, VerificationState } from "@pricora/contracts";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export const BUSINESS_CATEGORY_LABEL: Record<BusinessCategory, string> = {
  grocery: "Grocery",
  convenience: "Convenience store",
  pharmacy: "Pharmacy",
  hardware: "Hardware",
  electronics: "Electronics",
  pet: "Pet supplies",
  beauty: "Beauty",
  home: "Home & furniture",
  sporting: "Sporting goods",
  books: "Books",
  general: "General merchandise",
};

export const VERIFICATION_LABEL: Record<VerificationState, string> = {
  unverified: "Not verified",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};

export const GEO_PRECISION_LABEL: Record<GeoPrecision, string> = {
  zip_centroid: "Approx. (ZIP centroid)",
  provider: "Geocoded",
  source: "From source",
};

export const FLAG_SEVERITY_CLASS: Record<DataQualityFlag["severity"], string> = {
  info: "border-info/30 bg-info-soft text-info",
  warning: "border-warning/30 bg-warning-soft text-warning",
  error: "border-error/30 bg-error-soft text-error",
};

export const LISTING_POLICY =
  "Listing is free. Promoted listings are optional, always labeled Sponsored, and never change organic ranking or Deal Score.";
export const ZIP_GEO_NOTE = "Store coordinates are approximated from your ZIP code until precise geocoding is configured.";

/** "12.5" → 1250. Empty → undefined. Invalid → null. Integer cents only (no float math leaks into the payload). */
export function dollarsToCents(input: string): number | undefined | null {
  const v = input.trim().replace(/^\$/, "");
  if (!v) return undefined;
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + frac;
}

/** 1250 → "12.50" (for prefilling inputs). */
export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const whole = Math.trunc(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `${whole}.${frac}`;
}

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export function defaultWeek(): DayHours[] {
  return WEEKDAYS.map((_, day) => ({ closed: day === 0, open: "09:00", close: "18:00" }));
}

export function weekFromHours(hours: StoreHours | null | undefined): DayHours[] {
  if (!hours || hours.length === 0) return defaultWeek();
  return WEEKDAYS.map((_, day) => {
    const h = hours.find((x) => x.day === day);
    return h ? { closed: false, open: h.open, close: h.close } : { closed: true, open: "09:00", close: "18:00" };
  });
}

export function hoursFromWeek(week: DayHours[]): StoreHours {
  return week.flatMap((d, day) => (d.closed ? [] : [{ day, open: d.open, close: d.close }]));
}

export function formatHours(hours: StoreHours | null | undefined): string {
  if (!hours || hours.length === 0) return "Hours not listed";
  return hours.map((h) => `${WEEKDAYS[h.day]?.slice(0, 3) ?? h.day} ${h.open}–${h.close}`).join(", ");
}

/** The endpoint is not deployed yet / not applicable for this account (used to hide optional UI, never to fake data). */
export function isNotAvailable(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 409);
}
