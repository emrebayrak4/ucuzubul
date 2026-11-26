import { formatCents, formatDateTimeUS, formatRelativeTime } from "@pricora/utils";

export const DASH = "—";

export function money(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return DASH;
  return formatCents(cents, { currency });
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined) return DASH;
  return new Intl.NumberFormat("en-US").format(n);
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return formatDateTimeUS(iso);
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return formatRelativeTime(iso);
}

export function pct(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return DASH;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function humanize(s: string): string {
  return s.replace(/[_.-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
