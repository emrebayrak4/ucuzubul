import { cache } from "react";
import { cookies, headers } from "next/headers";
import { parseEdgeZip } from "@pricora/utils";
import type { ConsentState } from "@pricora/contracts";
import { CONSENT_COOKIE, decodeConsent } from "./consent";

/**
 * Edge geo headers are only trusted when the site is deployed behind that edge: set EDGE_GEO_HEADERS=vercel|cloudflare.
 * Locally (unset) they are ignored, because any client can send them.
 */
export const getEdgeZipGuess = cache(async (): Promise<{ zip: string | null; state: string | null } | null> => {
  const mode = process.env.EDGE_GEO_HEADERS;
  if (mode !== "vercel" && mode !== "cloudflare") return null;
  const g = parseEdgeZip(await headers());
  if (g.source !== mode || (!g.zip && !g.state)) return null;
  return { zip: g.zip, state: g.state };
});

export const getInitialConsent = cache(async (): Promise<ConsentState | null> => decodeConsent((await cookies()).get(CONSENT_COOKIE)?.value));

/** Sec-GPC: 1 request header (Global Privacy Control). */
export const getGpcHeader = cache(async (): Promise<boolean> => (await headers()).get("sec-gpc")?.trim() === "1");
