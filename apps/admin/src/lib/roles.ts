import type { Role } from "@pricora/contracts";

export const STAFF_ROLES: readonly Role[] = ["ADMIN", "EDITOR", "ANALYST"];
export const MERCHANT_ROLES: readonly Role[] = ["MERCHANT"];

export function isStaff(role: Role | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}
export function isMerchant(role: Role | null | undefined): boolean {
  return role === "MERCHANT";
}
/** Contract auth level `staff` writes need EDITOR or ADMIN. ANALYST is read-only. */
export function canEdit(role: Role | null | undefined): boolean {
  return role === "ADMIN" || role === "EDITOR";
}
/** Contract auth level `admin`. */
export function isAdmin(role: Role | null | undefined): boolean {
  return role === "ADMIN";
}

/** Where a signed-in user lands after login. `null` → no portal for this role. */
export function homeForRole(role: Role | null | undefined): "/admin" | "/merchant" | null {
  if (isStaff(role)) return "/admin";
  if (isMerchant(role)) return "/merchant";
  return null;
}

/** Self-serve local seller signup: reachable by any signed-in user (the API upgrades the account to MERCHANT). */
export const MERCHANT_APPLY_PATH = "/merchant/apply";
/** Request header set by `proxy.ts` with the current pathname (always overwritten; read by the merchant layout). */
export const PATHNAME_HEADER = "x-pc-pathname";

/** Only allow same-app relative redirect targets (anti open-redirect). */
export function safeNext(next: string | null | undefined, role: Role): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  if (next === MERCHANT_APPLY_PATH || next.startsWith(MERCHANT_APPLY_PATH + "?")) return next;
  if (next.startsWith("/admin") && isStaff(role)) return next;
  if (next.startsWith("/merchant") && isMerchant(role)) return next;
  return null;
}

export const ROLE_LABEL: Record<Role, string> = {
  USER: "User",
  MERCHANT: "Merchant",
  EDITOR: "Editor",
  ANALYST: "Analyst",
  ADMIN: "Admin",
};
