/**
 * SINGLE SOURCE OF TRUTH for every cookie and browser-storage key the web app (and the API on its behalf) sets.
 * The Cookie Policy table (/legal/cookies) is generated from this list, and `pnpm -C apps/web audit:storage`
 * fails if source code writes a key that is not registered here. Add an entry BEFORE adding a new key.
 */
import type { ConsentCategory } from "@pricora/contracts";

export type StorageKind = "cookie" | "localStorage" | "sessionStorage";

export interface StorageEntry {
  /** Exact key, or a prefix ending in `*`. */
  name: string;
  kind: StorageKind;
  category: ConsentCategory;
  /** Who writes it. */
  setBy: "WhichLess API" | "WhichLess website";
  purpose: string;
  duration: string;
  /** Cookie attributes (cookies only). */
  attributes?: string;
}

export const STORAGE_REGISTRY: readonly StorageEntry[] = [
  // ── Strictly necessary ──
  {
    name: "pc_session",
    kind: "cookie",
    category: "necessary",
    setBy: "WhichLess API",
    purpose: "Keeps you signed in. Contains a random session token; the server stores only its hash.",
    duration: "30 days (or until you log out)",
    attributes: "HttpOnly; Secure (production); SameSite=Lax; Path=/",
  },
  {
    name: "pc_csrf",
    kind: "cookie",
    category: "necessary",
    setBy: "WhichLess API",
    purpose: "Security token that protects account actions against cross-site request forgery.",
    duration: "30 days",
    attributes: "Secure (production); SameSite=Lax; Path=/",
  },
  {
    name: "pc_consent",
    kind: "cookie",
    category: "necessary",
    setBy: "WhichLess website",
    purpose: "Remembers your cookie choices and whether a Global Privacy Control signal was honored.",
    duration: "13 months",
    attributes: "Secure (HTTPS); SameSite=Lax; Path=/",
  },
  {
    name: "pc_basket",
    kind: "localStorage",
    category: "necessary",
    setBy: "WhichLess website",
    purpose: "Items you add to Smart Basket (a feature you explicitly use). Never sent to our servers unless you run an optimization.",
    duration: "Until you clear it",
  },
  {
    name: "pc_compare",
    kind: "localStorage",
    category: "necessary",
    setBy: "WhichLess website",
    purpose: "Products you selected to compare side by side.",
    duration: "Until you clear it",
  },
  {
    name: "pc-theme",
    kind: "localStorage",
    category: "necessary",
    setBy: "WhichLess website",
    purpose: "The light/dark display mode you chose (written only when you switch modes).",
    duration: "Until you clear it",
  },
  {
    name: "pc_zip_prompt",
    kind: "sessionStorage",
    category: "necessary",
    setBy: "WhichLess website",
    purpose: "Remembers that you dismissed the “tax-inclusive totals” prompt in this tab (stored in localStorage instead when Functional is on, so it stays dismissed).",
    duration: "This browser tab session",
  },
  // ── Functional ──
  {
    name: "pc_zip",
    kind: "cookie",
    category: "functional",
    setBy: "WhichLess website",
    purpose: "Your ZIP code, used only to estimate sales tax and delivered totals. With Functional off it is kept only until you close the browser.",
    duration: "180 days (session-only when Functional is off)",
    attributes: "Secure (HTTPS); SameSite=Lax; Path=/",
  },
  {
    name: "pc_zip_meta",
    kind: "localStorage",
    category: "functional",
    setBy: "WhichLess website",
    purpose: "How your ZIP was set (typed, account, your location, estimate) and the match confidence, so we can show it. Kept in sessionStorage when Functional is off.",
    duration: "Until you clear it or change your ZIP",
  },
  {
    name: "pc_recent_searches",
    kind: "localStorage",
    category: "functional",
    setBy: "WhichLess website",
    purpose: "Your recent searches, shown as suggestions in the search box. Not written when Functional is off.",
    duration: "Until you clear it",
  },
  {
    name: "pc_recent_places_*",
    kind: "localStorage",
    category: "functional",
    setBy: "WhichLess website",
    purpose: "Recently picked airports/destinations in travel search. Not written when Functional is off.",
    duration: "Until you clear it",
  },
];

/** Analytics and advertising/affiliate-measurement tools: none are installed today. Listed here when added. */
export const NON_ESSENTIAL_VENDORS: readonly { name: string; category: ConsentCategory; purpose: string }[] = [];

export function registryEntry(name: string): StorageEntry | undefined {
  return STORAGE_REGISTRY.find((e) => (e.name.endsWith("*") ? name.startsWith(e.name.slice(0, -1)) : e.name === name));
}
