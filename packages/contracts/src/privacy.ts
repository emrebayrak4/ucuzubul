import { z } from "zod";
import { Email, IsoDateTime } from "./common";

/* ───────────────────────────── Geo: ZIP from coordinates / edge headers ───────────────────────────── */

/** How confident we are that `zip` is the ZIP the coordinates fall in (nearest-ZCTA heuristic, see docs/PRIVACY.md). */
export const ZipConfidence = z.enum(["high", "medium", "low"]);
export type ZipConfidence = z.infer<typeof ZipConfidence>;

/** Where a ZIP guess came from, in the web/mobile resolution order. */
export const ZipSource = z.enum(["account", "cookie", "manual", "location", "edge"]);
export type ZipSource = z.infer<typeof ZipSource>;

export const GeoZipQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type GeoZipQuery = z.infer<typeof GeoZipQuery>;

export const GeoZipResponse = z.object({
  /** null when the point is outside the US ZCTA coverage (ocean, other countries, > 80 km from any ZCTA). */
  zip: z.string().regex(/^\d{5}$/).nullable(),
  /** Census place name — an approximation of the postal city. */
  city: z.string().nullable(),
  state: z.string().length(2).nullable(),
  distanceKm: z.number().nullable(),
  confidence: ZipConfidence.nullable(),
  source: z.literal("census_zcta"),
});
export type GeoZipResponse = z.infer<typeof GeoZipResponse>;

export const GeoZipResolveResponse = z.object({
  zip: z.string().regex(/^\d{5}$/).nullable(),
  state: z.string().length(2).nullable(),
  /** `vercel` / `cloudflare` when an edge header was trusted, `none` otherwise. */
  source: z.enum(["vercel", "cloudflare", "none"]),
  confidence: ZipConfidence.nullable(),
});
export type GeoZipResolveResponse = z.infer<typeof GeoZipResolveResponse>;

/* ───────────────────────────── Consent ───────────────────────────── */

export const ConsentCategory = z.enum(["necessary", "functional", "analytics", "advertising"]);
export type ConsentCategory = z.infer<typeof ConsentCategory>;

/** Consent choices. `necessary` is always true and therefore not stored. */
export const ConsentState = z.object({
  v: z.literal(1),
  functional: z.boolean(),
  analytics: z.boolean(),
  /** Advertising & affiliate measurement ("sale"/"sharing" under CCPA/CPRA). Forced false while GPC is on. */
  advertising: z.boolean(),
  /** A Global Privacy Control signal was present when these choices were saved. */
  gpc: z.boolean(),
  updatedAt: IsoDateTime,
});
export type ConsentState = z.infer<typeof ConsentState>;

export const ConsentResponse = z.object({ consent: ConsentState.nullable() });
export type ConsentResponse = z.infer<typeof ConsentResponse>;

export const UpdateConsentRequest = ConsentState.omit({ v: true, updatedAt: true });
export type UpdateConsentRequest = z.infer<typeof UpdateConsentRequest>;

/* ───────────────────────────── Data subject requests (logged-out) ───────────────────────────── */

export const PrivacyRequestType = z.enum(["access", "delete", "correct", "opt_out"]);
export type PrivacyRequestType = z.infer<typeof PrivacyRequestType>;

export const CreatePrivacyRequest = z.object({
  type: PrivacyRequestType,
  email: Email,
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  details: z.string().trim().max(2000).optional(),
});
export type CreatePrivacyRequest = z.infer<typeof CreatePrivacyRequest>;

export const PrivacyRequestResponse = z.object({
  id: z.string(),
  status: z.enum(["awaiting_verification", "verified", "completed", "rejected"]),
  /** `sent` = verification email sent; `not_configured` = SMTP is not configured in this environment, nothing was sent. */
  verification: z.enum(["sent", "not_configured"]),
  dueAt: IsoDateTime,
  message: z.string(),
});
export type PrivacyRequestResponse = z.infer<typeof PrivacyRequestResponse>;

export const VerifyPrivacyRequestQuery = z.object({ token: z.string().min(20).max(128) });
export type VerifyPrivacyRequestQuery = z.infer<typeof VerifyPrivacyRequestQuery>;
