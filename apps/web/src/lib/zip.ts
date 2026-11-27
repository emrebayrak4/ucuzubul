import type { ZipConfidence, ZipSource } from "@pricora/contracts";
import { allows, deleteCookie, preferenceStorage, readConsentClient, readCookie, setCookie } from "@/lib/privacy/consent";

export const ZIP_COOKIE = "pc_zip";
export const ZIP_META_KEY = "pc_zip_meta";
export const ZIP_RE = /^\d{5}$/;
const ZIP_MAX_AGE_S = 180 * 86_400;

export interface ZipMeta {
  source: ZipSource;
  confidence: ZipConfidence | null;
  /** Census place + state label from a location lookup, e.g. "Austin, TX". */
  label?: string | null;
}

/** Persistent (180 days) with Functional consent; otherwise a session cookie that disappears when the browser closes. */
export function setZipCookie(zip: string | null) {
  if (typeof document === "undefined") return;
  if (zip) setCookie(ZIP_COOKIE, zip, allows(readConsentClient(), "functional") ? ZIP_MAX_AGE_S : null);
  else deleteCookie(ZIP_COOKIE);
}

export function readZipCookie(): string | null {
  const v = readCookie(ZIP_COOKIE);
  return v && ZIP_RE.test(v) ? v : null;
}

export function readZipMeta(): ZipMeta | null {
  try {
    const raw = window.localStorage.getItem(ZIP_META_KEY) ?? window.sessionStorage.getItem(ZIP_META_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && "source" in v) return v as ZipMeta;
  } catch {
    // ignore
  }
  return null;
}

export function writeZipMeta(meta: ZipMeta | null) {
  try {
    window.localStorage.removeItem(ZIP_META_KEY);
    window.sessionStorage.removeItem(ZIP_META_KEY);
    if (meta) preferenceStorage()?.setItem(ZIP_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}
