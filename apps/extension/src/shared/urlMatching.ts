import { BUILT_IN_RETAILERS, type BuiltInRetailer } from "./retailers";

/** Lower-cased hostname of an http(s) URL, or null for anything else (chrome://, file:, about:, invalid). */
export function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** True when `host` equals `domain` or is a subdomain of it ("smile.amazon.com" ⊂ "amazon.com"). Never a suffix trick ("notamazon.com"). */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Matches a host against an admin-managed host pattern.
 * Supported forms: "amazon.com" (domain + subdomains), "*.amazon.com" (same), "www.amazon.com" (that host + subdomains).
 * Patterns containing other wildcards, schemes or paths are rejected (fail closed).
 */
export function hostMatchesPattern(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase();
  if (!p || /[/:?#\s]/.test(p)) return false;
  const bare = p.startsWith("*.") ? p.slice(2) : p;
  if (bare.includes("*")) return false;
  return hostMatchesDomain(host, bare);
}

export function findBuiltInRetailer(
  host: string | null,
  retailers: readonly BuiltInRetailer[] = BUILT_IN_RETAILERS,
): BuiltInRetailer | null {
  if (!host) return null;
  return retailers.find((r) => hostMatchesDomain(host, r.domain)) ?? null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\]/g, "\$&");
}

/**
 * Compiles an admin-managed checkout URL pattern. Forms:
 *  - "re:<regex>"   → case-insensitive regular expression tested against pathname + search (e.g. "re:^/checkout(/|$)")
 *  - "https://…"    → glob tested against the full URL ("*" = any run of characters)
 *  - anything else  → glob tested against pathname + search (e.g. "/checkout*", "/cart/*")
 * Invalid patterns compile to null and never match (fail closed).
 */
export function compileUrlPattern(pattern: string): { test(url: URL): boolean } | null {
  const p = pattern.trim();
  if (!p) return null;
  if (p.toLowerCase().startsWith("re:")) {
    const body = p.slice(3);
    if (!body) return null;
    try {
      const rx = new RegExp(body, "i");
      return { test: (u) => rx.test(u.pathname + u.search) };
    } catch {
      return null;
    }
  }
  const full = /^https?:\/\//i.test(p);
  const rx = new RegExp(`^${p.split("*").map(escapeRegExp).join(".*")}$`, "i");
  return { test: (u) => rx.test(full ? u.href : u.pathname + u.search) };
}

export function urlMatchesAnyPattern(url: string, patterns: readonly string[]): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return patterns.some((p) => compileUrlPattern(p)?.test(u) ?? false);
}
