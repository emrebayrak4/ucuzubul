/** Adds the Unsplash referral params (API guidelines) when a URL doesn't carry them yet. Server- and client-safe. */
export function ensureUtm(url: string): string {
  if (/[?&]utm_source=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}utm_source=whichless&utm_medium=referral`;
}
