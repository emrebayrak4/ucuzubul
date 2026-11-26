import type { Role } from "@pricora/contracts";

export type IconName =
  | "dashboard"
  | "users"
  | "products"
  | "categories"
  | "brands"
  | "retailers"
  | "offers"
  | "matching"
  | "anomalies"
  | "affiliate"
  | "subscriptions"
  | "campaigns"
  | "flags"
  | "audit"
  | "health"
  | "profile"
  | "feeds"
  | "analytics"
  | "keys"
  | "webhooks"
  | "integrations"
  | "docs";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Roles that see the item (default: all roles allowed in the portal). */
  roles?: Role[];
  /** No API endpoint yet — item rendered with a muted "API pending" hint. */
  pending?: boolean;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const ADMIN_NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }] },
  {
    label: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: "products" },
      { href: "/admin/categories", label: "Categories", icon: "categories" },
      { href: "/admin/brands", label: "Brands", icon: "brands" },
      { href: "/admin/retailers", label: "Retailers", icon: "retailers" },
      { href: "/admin/offers", label: "Offers", icon: "offers" },
    ],
  },
  {
    label: "Data quality",
    items: [
      { href: "/admin/matching", label: "Matching review", icon: "matching" },
      { href: "/admin/anomalies", label: "Price anomalies", icon: "anomalies" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/affiliate", label: "Affiliate programs", icon: "affiliate", pending: true },
      { href: "/admin/subscriptions", label: "Subscriptions & plans", icon: "subscriptions", pending: true },
      { href: "/admin/campaigns", label: "Sponsored campaigns", icon: "campaigns", pending: true },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/admin/integrations", label: "Integrations", icon: "integrations", roles: ["ADMIN"] },
      { href: "/admin/api-docs", label: "API docs", icon: "docs" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/users", label: "Users", icon: "users", roles: ["ADMIN"] },
      { href: "/admin/flags", label: "Feature flags", icon: "flags" },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "audit", roles: ["ADMIN"] },
      { href: "/admin/health", label: "System health", icon: "health" },
    ],
  },
];

export const MERCHANT_NAV: NavGroup[] = [
  {
    label: "Merchant",
    items: [
      { href: "/merchant", label: "Profile", icon: "profile" },
      { href: "/merchant/feeds", label: "Feed upload", icon: "feeds" },
      { href: "/merchant/offers", label: "Offers", icon: "offers" },
      { href: "/merchant/analytics", label: "Click analytics", icon: "analytics" },
      { href: "/merchant/api-keys", label: "API keys", icon: "keys" },
      { href: "/merchant/webhooks", label: "Webhooks", icon: "webhooks", pending: true },
    ],
  },
];
