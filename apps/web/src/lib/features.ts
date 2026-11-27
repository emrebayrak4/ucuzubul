/**
 * Feature flags (build/runtime env). Travel (flights, hotels, guides) is hidden until the founder re-enables it:
 * set NEXT_PUBLIC_TRAVEL_ENABLED=true in apps/web/.env.local to bring it back. Code and routes stay in place.
 */
export const TRAVEL_ENABLED = process.env.NEXT_PUBLIC_TRAVEL_ENABLED === "true";
