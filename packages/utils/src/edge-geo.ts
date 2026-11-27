/**
 * ZIP guess from CDN/edge geolocation headers (IP-based, coarse). Only call this when the request is known to come
 * through that edge (TRUST_PROXY / platform config) — otherwise any client could forge these headers.
 *  - Vercel:     x-vercel-ip-country, x-vercel-ip-country-region, x-vercel-ip-postal-code
 *  - Cloudflare: cf-ipcountry, cf-region-code / cf-region, cf-postal-code (needs "Add visitor location headers")
 */
export interface EdgeZipGuess {
  zip: string | null;
  state: string | null;
  source: "vercel" | "cloudflare" | "none";
}

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function header(h: HeaderBag, name: string): string | null {
  if (typeof (h as { get?: unknown }).get === "function") return (h as { get(n: string): string | null }).get(name);
  const v = (h as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const clean = (v: string | null) => (v ? decodeURIComponent(v).trim() : "");

export function parseEdgeZip(h: HeaderBag): EdgeZipGuess {
  const providers: Array<{ source: "vercel" | "cloudflare"; country: string; region: string[]; zip: string }> = [
    { source: "vercel", country: "x-vercel-ip-country", region: ["x-vercel-ip-country-region"], zip: "x-vercel-ip-postal-code" },
    { source: "cloudflare", country: "cf-ipcountry", region: ["cf-region-code", "cf-region"], zip: "cf-postal-code" },
  ];
  for (const p of providers) {
    const zipRaw = clean(header(h, p.zip));
    const regionRaw = p.region.map((r) => clean(header(h, r))).find(Boolean) ?? "";
    if (!zipRaw && !regionRaw) continue;
    const country = clean(header(h, p.country)).toUpperCase();
    // US only: unknown country is accepted only when the ZIP itself is a 5-digit US ZIP.
    if (country && country !== "US") return { zip: null, state: null, source: "none" };
    const zip = /^\d{5}$/.test(zipRaw.slice(0, 5)) && zipRaw.slice(0, 5) !== "00000" ? zipRaw.slice(0, 5) : null;
    const state = /^[A-Z]{2}$/i.test(regionRaw) ? regionRaw.toUpperCase() : null;
    if (!zip && !state) continue;
    return { zip, state, source: p.source };
  }
  return { zip: null, state: null, source: "none" };
}
