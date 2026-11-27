import type { FlightOffer } from "@pricora/contracts";

/** "8:35 AM" from minutes after midnight. */
export function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Local wall-clock time from an ISO string with offset (airport local time, no browser TZ conversion). */
export function localTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? clock(Number(m[1]) * 60 + Number(m[2])) : iso;
}

/** "Wed, Jan 20" from an ISO date/datetime (date part, local). */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h${m ? ` ${String(m).padStart(2, "0")}m` : ""}` : `${m}m`;
}

export const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export const totalDuration = (o: FlightOffer) => o.slices.reduce((n, s) => n + s.durationMinutes, 0);

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
