import type { AdminCoupon, CouponDiscountType, CouponStatus } from "@pricora/contracts";
import { formatCents } from "@pricora/utils";

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  active: "Active",
  expired: "Expired",
  unverified: "Unverified",
  reported: "Reported",
  pending_approval: "Pending approval",
  rejected: "Rejected",
};

export const DISCOUNT_TYPE_LABEL: Record<CouponDiscountType, string> = {
  percent: "% off",
  amount: "$ off",
  free_shipping: "Free shipping",
  bogo: "Buy one, get one",
  other: "Other",
};

/** Human discount text from contract units (percent = basis points, amount = cents). */
export function formatDiscount(c: Pick<AdminCoupon, "discountType" | "discountValue" | "minSpendCents">): string {
  let base: string;
  switch (c.discountType) {
    case "percent":
      base = c.discountValue != null ? `${(c.discountValue / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% off` : "% off";
      break;
    case "amount":
      base = c.discountValue != null ? `${formatCents(c.discountValue, { cents: "auto" })} off` : "$ off";
      break;
    case "free_shipping":
      base = "Free shipping";
      break;
    case "bogo":
      base = "BOGO";
      break;
    default:
      base = "Deal";
  }
  return c.minSpendCents ? `${base} · min ${formatCents(c.minSpendCents, { cents: "auto" })}` : base;
}

export function isExpired(c: Pick<AdminCoupon, "expiresAt">): boolean {
  return !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
}

/** "YYYY-MM-DD" (local) ↔ ISO. Start of day for startsAt, end of day for expiresAt. */
export function dateToIso(d: string, endOfDay: boolean): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
export function isoToDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
