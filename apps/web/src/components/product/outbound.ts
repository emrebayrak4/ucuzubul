import type { Offer } from "@pricora/contracts";
import { PUBLIC_API_URL } from "@/lib/env";

/** Outbound redirect URL (/v1/go/:offerId) with a placement tag. Server- and client-safe. */
export function goHref(offer: Pick<Offer, "goUrl">, placement: string): string {
  const base = offer.goUrl.startsWith("http") ? offer.goUrl : PUBLIC_API_URL + offer.goUrl;
  return base + (base.includes("?") ? "&" : "?") + "placement=" + encodeURIComponent(placement);
}

/** Outbound link attributes required for affiliate/retailer links. */
export const outboundRel = "sponsored nofollow noopener";
