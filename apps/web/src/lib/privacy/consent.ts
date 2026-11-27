/**
 * Consent state ↔ first-party cookie `pc_consent` (isomorphic: server reads it for SSR, client writes it).
 * Value format (no PII): `1.<functional><analytics><advertising><gpc>.<unix seconds>`, e.g. `1.1000.1795000000`.
 * Until the visitor chooses, every non-essential category is OFF. A Global Privacy Control signal always keeps
 * advertising & affiliate measurement OFF (opt-out of sale/sharing) and is recorded as `gpc`.
 */
import type { ConsentCategory, ConsentState } from "@pricora/contracts";
import { registryEntry } from "./storage-registry";

export const CONSENT_COOKIE = "pc_consent";
export const CONSENT_MAX_AGE_S = 396 * 86_400; // ~13 months

export function encodeConsent(c: ConsentState): string {
  const b = (v: boolean) => (v ? "1" : "0");
  return `1.${b(c.functional)}${b(c.analytics)}${b(c.advertising)}${b(c.gpc)}.${Math.floor(Date.parse(c.updatedAt) / 1000)}`;
}

export function decodeConsent(raw: string | null | undefined): ConsentState | null {
  const m = raw ? /^1\.([01])([01])([01])([01])\.(\d{9,11})$/.exec(raw) : null;
  if (!m) return null;
  return {
    v: 1,
    functional: m[1] === "1",
    analytics: m[2] === "1",
    advertising: m[3] === "1" && m[4] !== "1",
    gpc: m[4] === "1",
    updatedAt: new Date(Number(m[5]) * 1000).toISOString(),
  };
}

export function makeConsent(choice: { functional: boolean; analytics: boolean; advertising: boolean }, gpc: boolean): ConsentState {
  return { v: 1, functional: choice.functional, analytics: choice.analytics, advertising: gpc ? false : choice.advertising, gpc, updatedAt: new Date().toISOString() };
}

export function allows(c: ConsentState | null, category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  if (!c) return false;
  return c[category];
}

/* ───────── browser helpers ───────── */

/** Sets a first-party cookie with SameSite=Lax and Secure on HTTPS. `maxAgeS: null` = session cookie. */
export function setCookie(name: string, value: string, maxAgeS: number | null): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  const age = maxAgeS === null ? "" : `; Max-Age=${maxAgeS}`;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/${age}; SameSite=Lax${secure}`;
}

export function deleteCookie(name: string): void {
  setCookie(name, "", 0);
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function readConsentClient(): ConsentState | null {
  return decodeConsent(readCookie(CONSENT_COOKIE));
}

export function writeConsentCookie(c: ConsentState): void {
  setCookie(CONSENT_COOKIE, encodeConsent(c), CONSENT_MAX_AGE_S);
}

/** Browser GPC signal (navigator.globalPrivacyControl). */
export function browserGpc(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** May this registered storage key be written right now? Unregistered keys are never allowed. */
export function storageAllowed(key: string): boolean {
  const entry = registryEntry(key);
  if (!entry) return false;
  return allows(readConsentClient(), entry.category);
}

/** localStorage when Functional is allowed, otherwise sessionStorage (forgotten when the tab closes). */
export function preferenceStorage(): Storage | null {
  try {
    return allows(readConsentClient(), "functional") ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Removes functional storage when Functional consent is withdrawn. */
export function purgeFunctionalStorage(): void {
  try {
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (const k of Object.keys(store)) {
        if (registryEntry(k)?.category === "functional") store.removeItem(k);
      }
    }
  } catch {
    // storage unavailable
  }
}
