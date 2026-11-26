import { formatPrice } from "@pricora/ui/utils";
import { formatDateTimeUS, formatDuration, formatRelativeTime } from "@pricora/utils";

export { formatPrice, formatDuration };

export function money(cents: number | null | undefined, currency = "USD"): string {
  return cents === null || cents === undefined ? "—" : formatPrice(cents, { currency });
}

/** Ratio (0.12) → positive integer percent (12) or null. */
export function ratioToPercent(ratio: number | null | undefined): number | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return null;
  const p = Math.round(ratio * 100);
  return p >= 1 ? p : null;
}

export function relative(iso: string): string {
  return formatRelativeTime(iso);
}

export function absolute(iso: string): string {
  return formatDateTimeUS(iso);
}

export function isStale(iso: string, hours = 24): boolean {
  return Date.now() - new Date(iso).getTime() > hours * 3600_000;
}

export const conditionLabel: Record<string, string> = {
  new: "New",
  refurbished: "Refurbished",
  used: "Used",
  open_box: "Open box",
};

export const stockLabel: Record<string, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  preorder: "Pre-order",
  unknown: "Stock unknown",
};

export const cabinLabel: Record<string, string> = {
  economy: "Economy",
  premium_economy: "Premium economy",
  business: "Business",
  first: "First",
};
