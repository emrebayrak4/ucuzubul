/**
 * Nearest-ZIP algorithm (pure, no I/O) — "which ZCTA does this point most likely fall in?"
 *
 * We only have ZCTA internal points + land area (Census Gazetteer), not polygons. Plain nearest-centroid picks a tiny
 * neighbouring ZCTA when the user stands inside a large rural one, so each candidate gets an effective radius
 * r = √(land area / π) (equal-area circle) and we pick the lowest score  d − 0.5·r  (additively weighted nearest
 * neighbour). Confidence compares the distance with that radius. See docs/PRIVACY.md → "ZIP resolution".
 */
import type { ZipConfidence } from "@pricora/contracts";

export interface ZipCandidate {
  zip: string;
  lat: number;
  lng: number;
  state: string | null;
  city: string | null;
  landAreaKm2: number | null;
}

export interface ZipPick {
  candidate: ZipCandidate;
  distanceKm: number;
  confidence: ZipConfidence;
}

/** Search radii (km). The largest one bounds "inside US ZCTA coverage". */
export const SEARCH_RADII_KM = [8, 25, 80] as const;
export const MAX_DISTANCE_KM = SEARCH_RADII_KM[SEARCH_RADII_KM.length - 1] ?? 80;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371.0088;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Lat/lng bounding box that contains the circle of `radiusKm` around the point (index-friendly prefilter). */
export function boundingBox(lat: number, lng: number, radiusKm: number): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusKm / 111.32;
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = Math.min(180, radiusKm / (111.32 * cos));
  return { minLat: Math.max(-90, lat - dLat), maxLat: Math.min(90, lat + dLat), minLng: Math.max(-180, lng - dLng), maxLng: Math.min(180, lng + dLng) };
}

export function effectiveRadiusKm(landAreaKm2: number | null): number {
  const area = landAreaKm2 && landAreaKm2 > 0 ? landAreaKm2 : 1;
  return Math.min(30, Math.max(0.4, Math.sqrt(area / Math.PI)));
}

export function confidenceFor(distanceKm: number, radiusKm: number): ZipConfidence {
  if (distanceKm <= radiusKm && distanceKm <= 15) return "high";
  if (distanceKm <= Math.max(2 * radiusKm, 1.5) && distanceKm <= 30) return "medium";
  return "low";
}

/** Picks the most likely ZCTA among candidates; null when none is within `maxKm`. */
export function pickZip(lat: number, lng: number, candidates: readonly ZipCandidate[], maxKm: number = MAX_DISTANCE_KM): ZipPick | null {
  let best: { c: ZipCandidate; d: number; r: number; score: number } | null = null;
  for (const c of candidates) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d > maxKm) continue;
    const r = effectiveRadiusKm(c.landAreaKm2);
    const score = d - 0.5 * r;
    if (!best || score < best.score || (score === best.score && d < best.d)) best = { c, d, r, score };
  }
  if (!best) return null;
  return { candidate: best.c, distanceKm: Math.round(best.d * 100) / 100, confidence: confidenceFor(best.d, best.r) };
}
