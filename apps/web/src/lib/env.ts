/** Public origins (safe in the browser). */
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4400").replace(/\/+$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, "");

/** Server-side API origin. Falls back to the public one (never contains secrets). */
export function serverApiUrl(): string {
  return (process.env.API_URL ?? PUBLIC_API_URL).replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return SITE_URL + (path.startsWith("/") ? path : "/" + path);
}
