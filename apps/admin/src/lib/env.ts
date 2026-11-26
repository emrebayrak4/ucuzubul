/** Public API origin (without /v1). Browser requests go here with `credentials: "include"`. */
export const PUBLIC_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4400").replace(/\/+$/, "");

/** Server-side API origin for RSC auth checks. Falls back to the public origin. */
export function serverApiUrl(): string {
  return (process.env.API_URL || PUBLIC_API_URL).replace(/\/+$/, "");
}
