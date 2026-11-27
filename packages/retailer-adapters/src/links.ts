/**
 * Affiliate deep-link builders + sub-ID injection.
 *
 * Every outbound click gets our opaque click id (AffiliateClick.subId) in the network's own sub-ID
 * parameter so the conversion-import jobs can map commissions back to the click:
 *
 * | Network            | Link host(s)                                   | Sub-ID            | Verification (see side notes / DATA_SOURCES.md) |
 * |--------------------|------------------------------------------------|-------------------|--------|
 * | CJ                 | anrdoezrs.net, jdoqocy.com, tkqlhce.com, dpbolvw.net, kqzyfj.com | `sid` | API: linkCode(pid, shopperId) (developers.cj.com Product Search). Appending `sid` to click URLs: UNVERIFIED (CJ publisher docs are login-only). |
 * | Impact             | *.sjv.io, *.pxf.io, *.7eer.net, goto.walmart.com, any `/c/{mp}/{ad}/{campaign}` | `subId1` | Verified: TrackingLinks API params (integrations.impact.com/partner-api-reference) |
 * | Rakuten            | click.linksynergy.com                          | `u1`              | Verified: deep-link API output `…&mid=&murl=&u1=`; manual /deeplink host UNVERIFIED |
 * | Awin               | www.awin1.com/cread.php                        | `clickref`        | Verified: Link Builder API `clickref` (help.awin.com/apidocs) |
 * | Partnerize         | prf.hn/click/…                                 | `pubref:` segment | Verified: api-docs.partnerize.com |
 * | eBay Partner Network | *.ebay.com with `campid`                     | `customid`        | Verified link params (no `siteid`); partnerhelp.ebay.com |
 * | Amazon Associates  | amazon.com with `tag`                          | `ascsubtag`       | Associates link sub-tag (reports) |
 * | Travelpayouts      | tp.media, aviasales.com (`marker`)             | `marker=<id>.<sub>` | Travelpayouts SubID help article |
 * | Booking.com        | booking.com with `aid`                         | `label`           | Booking.com affiliate `label` parameter |
 *
 * All builders are pure functions (unit-tested with fixtures; no network calls).
 */

export type LinkNetwork = "cj" | "impact" | "rakuten" | "awin" | "partnerize" | "ebay_partner" | "amazon_associates" | "travelpayouts" | "booking";

/** Sub-ids are our own opaque tokens: restrict to a charset every network accepts. */
export function sanitizeSubId(subId: string, max = 64): string {
  return subId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);
}

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

export const CJ_CLICK_HOSTS = ["anrdoezrs.net", "jdoqocy.com", "tkqlhce.com", "dpbolvw.net", "kqzyfj.com", "qksrv.net", "lduhtrp.net", "ftjcfx.com", "afcyhf.com"] as const;
export const IMPACT_CLICK_HOSTS = ["sjv.io", "pxf.io", "7eer.net", "evyy.net", "ojrq.net", "r2ux.net", "goto.walmart.com", "goto.target.com", "bestbuy.7tiv.net"] as const;

/** Identify which affiliate network a tracking URL belongs to (null = plain merchant URL). */
export function detectLinkNetwork(url: string): LinkNetwork | null {
  const u = parse(url);
  if (!u) return null;
  const h = u.hostname.toLowerCase();
  if (CJ_CLICK_HOSTS.some((d) => hostIs(h, d))) return "cj";
  if (hostIs(h, "linksynergy.com")) return "rakuten";
  if (hostIs(h, "awin1.com") && /cread\.php|\/a\/|\/pclick\.php/.test(u.pathname)) return "awin";
  if (h === "prf.hn") return "partnerize";
  if (IMPACT_CLICK_HOSTS.some((d) => hostIs(h, d)) || /^\/c\/\d+\/\d+\/\d+/.test(u.pathname)) return "impact";
  if (hostIs(h, "ebay.com") && u.searchParams.has("campid")) return "ebay_partner";
  if (hostIs(h, "amazon.com") && u.searchParams.has("tag")) return "amazon_associates";
  if (h === "tp.media" || hostIs(h, "aviasales.com") || hostIs(h, "tp.st")) return u.searchParams.has("marker") || h === "tp.media" ? "travelpayouts" : null;
  if (hostIs(h, "booking.com") && u.searchParams.has("aid")) return "booking";
  return null;
}

/**
 * Add our click id to an existing tracking URL in the right network-specific place.
 * Returns the URL unchanged when it is not a recognised affiliate link (nothing to attribute).
 */
export function applySubId(url: string, rawSubId: string): string {
  const subId = sanitizeSubId(rawSubId);
  const net = detectLinkNetwork(url);
  if (!net || !subId) return url;
  const u = parse(url) as URL;
  switch (net) {
    case "cj":
      if (/\/links\/\d+\/type\/dlg\//.test(u.pathname)) {
        // Path-style deep link: /links/{PID}/type/dlg/sid/{SID}/{destination}
        u.pathname = u.pathname.replace(/\/sid\/[^/]*/, "").replace(/(\/type\/dlg)\//, `$1/sid/${subId}/`);
        return u.toString();
      }
      u.searchParams.set("sid", subId);
      return u.toString();
    case "impact":
      u.searchParams.set("subId1", subId);
      return u.toString();
    case "rakuten":
      u.searchParams.set("u1", subId);
      return u.toString();
    case "awin":
      u.searchParams.set("clickref", subId);
      return u.toString();
    case "partnerize":
      return partnerizeWithPubref(u, subId);
    case "ebay_partner":
      u.searchParams.set("customid", subId);
      return u.toString();
    case "amazon_associates":
      u.searchParams.set("ascsubtag", subId);
      return u.toString();
    case "travelpayouts": {
      const marker = u.searchParams.get("marker");
      if (marker) u.searchParams.set("marker", `${marker.split(".")[0]}.${subId}`);
      else u.searchParams.set("sub_id", subId);
      return u.toString();
    }
    case "booking":
      u.searchParams.set("label", subId);
      return u.toString();
  }
}

function partnerizeWithPubref(u: URL, subId: string): string {
  // prf.hn/click/camref:XXXX[/pubref:YYY][/destination:ENCODED]
  const parts = u.pathname.split("/").filter((p) => p !== "" && !p.startsWith("pubref:"));
  const camIdx = parts.findIndex((p) => p.startsWith("camref:"));
  if (camIdx === -1) return u.toString();
  parts.splice(camIdx + 1, 0, `pubref:${subId}`);
  u.pathname = `/${parts.join("/")}`;
  return u.toString();
}

/** Extract the sub-id we injected (inverse of applySubId) — used by tests and the click debugger. */
export function readSubId(url: string): string | null {
  const net = detectLinkNetwork(url);
  const u = parse(url);
  if (!net || !u) return null;
  switch (net) {
    case "cj":
      return u.searchParams.get("sid") ?? /\/sid\/([^/]+)/.exec(u.pathname)?.[1] ?? null;
    case "impact":
      return u.searchParams.get("subId1");
    case "rakuten":
      return u.searchParams.get("u1");
    case "awin":
      return u.searchParams.get("clickref");
    case "partnerize":
      return /\/pubref:([^/]+)/.exec(u.pathname)?.[1] ?? null;
    case "ebay_partner":
      return u.searchParams.get("customid");
    case "amazon_associates":
      return u.searchParams.get("ascsubtag");
    case "travelpayouts":
      return u.searchParams.get("marker")?.split(".")[1] ?? u.searchParams.get("sub_id");
    case "booking":
      return u.searchParams.get("label");
  }
}

// ------------------------------------------------------------------ deep-link builders

export interface DeepLinkInput {
  destinationUrl: string;
  subId?: string;
}

/**
 * CJ deep link (path style, no ad id needed): https://www.anrdoezrs.net/links/{PID}/type/dlg/sid/{SID}/{destination}
 * PID = CJ website (property) id. Advertiser must have deep linking enabled.
 * Docs: https://developers.cj.com/docs/traditional-api-reference/deep-linking
 */
export function cjDeepLink(i: DeepLinkInput & { websiteId: string }): string | null {
  if (!/^\d+$/.test(i.websiteId) || !parse(i.destinationUrl)) return null;
  const sid = i.subId ? `/sid/${sanitizeSubId(i.subId)}` : "";
  return `https://www.anrdoezrs.net/links/${i.websiteId}/type/dlg${sid}/${i.destinationUrl}`;
}

/**
 * Impact tracking link from a program's base tracking link (copied from the Impact dashboard or
 * returned by the TrackingLinks API), e.g. https://goto.walmart.com/c/{mpId}/{adId}/{campaignId}.
 * `u` carries the deep-link destination; `subId1` our click id.
 * Docs: https://integrations.impact.com/impact-publisher/reference/tracking-links
 */
export function impactDeepLink(i: DeepLinkInput & { trackingBase: string }): string | null {
  const base = parse(i.trackingBase);
  if (!base || !parse(i.destinationUrl)) return null;
  base.searchParams.set("u", i.destinationUrl);
  if (i.subId) base.searchParams.set("subId1", sanitizeSubId(i.subId));
  return base.toString();
}

/**
 * Rakuten (LinkShare) deep link: https://click.linksynergy.com/deeplink?id={encryptedSiteId}&mid={advertiserMid}&murl={url}&u1={sub}
 * Docs: https://developers.rakutenadvertising.com/guides/deep_linking
 */
export function rakutenDeepLink(i: DeepLinkInput & { siteId: string; advertiserId: string }): string | null {
  if (!i.siteId || !/^\d+$/.test(i.advertiserId) || !parse(i.destinationUrl)) return null;
  const u = new URL("https://click.linksynergy.com/deeplink");
  u.searchParams.set("id", i.siteId);
  u.searchParams.set("mid", i.advertiserId);
  u.searchParams.set("murl", i.destinationUrl);
  if (i.subId) u.searchParams.set("u1", sanitizeSubId(i.subId, 72));
  return u.toString();
}

/**
 * Awin cread link: https://www.awin1.com/cread.php?awinmid={advertiserId}&awinaffid={publisherId}&clickref={sub}&ued={url}
 * Docs: https://help.awin.com/docs/publisher-link-parameters
 */
export function awinDeepLink(i: DeepLinkInput & { publisherId: string; advertiserId: string }): string | null {
  if (!/^\d+$/.test(i.publisherId) || !/^\d+$/.test(i.advertiserId) || !parse(i.destinationUrl)) return null;
  const u = new URL("https://www.awin1.com/cread.php");
  u.searchParams.set("awinmid", i.advertiserId);
  u.searchParams.set("awinaffid", i.publisherId);
  if (i.subId) u.searchParams.set("clickref", sanitizeSubId(i.subId, 50));
  u.searchParams.set("ued", i.destinationUrl);
  return u.toString();
}

/**
 * Partnerize link: https://prf.hn/click/camref:{camref}/pubref:{sub}/destination:{encodedUrl}
 * camref = campaign reference shown in the Partnerize console for each joined campaign.
 */
export function partnerizeDeepLink(i: DeepLinkInput & { camref: string }): string | null {
  if (!/^[A-Za-z0-9]+$/.test(i.camref) || !parse(i.destinationUrl)) return null;
  const pub = i.subId ? `/pubref:${sanitizeSubId(i.subId)}` : "";
  return `https://prf.hn/click/camref:${i.camref}${pub}/destination:${encodeURIComponent(i.destinationUrl)}`;
}

/**
 * eBay Partner Network link parameters (US rotation id 711-53200-19255-0).
 * Docs: https://partnerhelp.ebay.com/helpcenter/s/article/How-do-I-create-a-link
 */
export function epnLink(i: DeepLinkInput & { campaignId: string }): string | null {
  const u = parse(i.destinationUrl);
  if (!u || !/^\d+$/.test(i.campaignId) || !hostIs(u.hostname.toLowerCase(), "ebay.com")) return null;
  u.searchParams.set("mkcid", "1");
  u.searchParams.set("mkrid", "711-53200-19255-0");
  u.searchParams.set("campid", i.campaignId);
  u.searchParams.set("toolid", "10001");
  u.searchParams.set("mkevt", "1");
  if (i.subId) u.searchParams.set("customid", sanitizeSubId(i.subId));
  return u.toString();
}

/** Amazon Associates: canonical /dp/{ASIN} with `tag` and optional `ascsubtag`. */
export function amazonLink(i: DeepLinkInput & { tag: string }): string | null {
  const u = parse(i.destinationUrl);
  if (!u || !i.tag || !hostIs(u.hostname.toLowerCase(), "amazon.com")) return null;
  const asin = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i.exec(u.pathname)?.[1];
  const out = new URL(asin ? `https://www.amazon.com/dp/${asin.toUpperCase()}` : `https://www.amazon.com${u.pathname}`);
  out.searchParams.set("tag", i.tag);
  if (i.subId) out.searchParams.set("ascsubtag", sanitizeSubId(i.subId));
  return out.toString();
}

/** Fill a `{url}` / `{subId}` template (admin-provided link template for programs without an API). */
export function fillLinkTemplate(template: string, i: DeepLinkInput): string | null {
  if (!template.includes("{url}") || !parse(i.destinationUrl)) return null;
  const out = template.replace("{url}", encodeURIComponent(i.destinationUrl)).replace("{subId}", i.subId ? sanitizeSubId(i.subId) : "");
  return parse(out) ? out : null;
}
