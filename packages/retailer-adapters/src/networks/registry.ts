/**
 * Affiliate-network registry: metadata for Admin → Integrations (fields, help text, docs) and factories.
 * Ingestion jobs iterate NETWORK_REGISTRY; a network without credentials reports pending_configuration.
 */
import type { AdapterOptions } from "../base";
import type { EnvLike } from "../types";
import { readEnv } from "../util";
import { AwinNetworkClient } from "./awin";
import { CjNetworkClient } from "./cj";
import { EbayPartnerNetworkClient } from "./ebayPartner";
import { ImpactNetworkClient } from "./impact";
import { PartnerizeNetworkClient } from "./partnerize";
import { RakutenNetworkClient } from "./rakuten";
import type { AffiliateNetworkClient, NetworkCapabilities, NetworkId } from "./types";

export interface NetworkFieldMeta {
  key: string;
  required: boolean;
  secret: boolean;
  help: string;
}

export interface NetworkMetadata {
  id: NetworkId;
  name: string;
  docsUrl: string;
  signupUrl: string;
  fields: readonly NetworkFieldMeta[];
  capabilities: NetworkCapabilities;
  /** Suggested schedules (minutes) respecting the network's rate limits. */
  schedule: { couponsEveryMin: number; productsEveryMin: number; conversionsEveryMin: number };
  notes: string;
  create(options?: AdapterOptions): AffiliateNetworkClient;
}

const f = (key: string, required: boolean, secret: boolean, help: string): NetworkFieldMeta => ({ key, required, secret, help });

export const NETWORK_REGISTRY: readonly NetworkMetadata[] = [
  {
    id: "cj",
    name: "CJ Affiliate",
    docsUrl: "https://developers.cj.com/",
    signupUrl: "https://signup.cj.com/member/signup/publisher/",
    fields: [
      f("CJ_PERSONAL_ACCESS_TOKEN", true, true, "developers.cj.com → Authentication → Personal Access Tokens → Create. Used as Bearer token for every CJ API."),
      f("CJ_COMPANY_ID", true, false, "Your publisher Company ID (CID), shown top-right in members.cj.com (Account → Company ID)."),
      f("CJ_WEBSITE_ID", true, false, "Property/Website ID (PID) of the property registered for this site (Account → Properties). Used for deep links (sid) and Link Search."),
    ],
    capabilities: { products: true, coupons: true, conversions: true, links: true },
    schedule: { couponsEveryMin: 360, productsEveryMin: 720, conversionsEveryMin: 180 },
    notes: "Products: Product Search GraphQL (joined advertisers). Coupons: Link Search (promotion-type=coupon). Conversions: Commission Detail GraphQL; shopperId = our sid.",
    create: (o) => new CjNetworkClient(o),
  },
  {
    id: "impact",
    name: "Impact.com",
    docsUrl: "https://integrations.impact.com/partner-api-reference",
    signupUrl: "https://app.impact.com/signup/create-account-partner.ihtml",
    fields: [
      f("IMPACT_ACCOUNT_SID", true, false, "app.impact.com → Settings → API → Account SID (starts with IR…)."),
      f("IMPACT_AUTH_TOKEN", true, true, "Same page → Auth Token (read-only scopes are sufficient for catalogs, deals and actions)."),
    ],
    capabilities: { products: true, coupons: true, conversions: true, links: true },
    schedule: { couponsEveryMin: 360, productsEveryMin: 720, conversionsEveryMin: 180 },
    notes: "Walmart, Target, Home Depot, Best Buy, Chewy… run on Impact. Catalog items carry tracking URLs; subId1 = our click id.",
    create: (o) => new ImpactNetworkClient(o),
  },
  {
    id: "rakuten",
    name: "Rakuten Advertising",
    docsUrl: "https://developers.rakutenadvertising.com/",
    signupUrl: "https://rakutenadvertising.com/en-us/publishers/",
    fields: [
      f("RAKUTEN_CLIENT_ID", true, false, "developers.rakutenadvertising.com → (signed in) → your app → Client ID."),
      f("RAKUTEN_CLIENT_SECRET", true, true, "Same page → Client Secret."),
      f("RAKUTEN_SID", true, false, "Your Site ID (SID), shown in the publisher dashboard header; used as the token scope."),
      f("RAKUTEN_ENCRYPTED_ID", false, false, "Optional: encrypted publisher ID (the `id=` value of any LinkShare link) — enables deep links without the API."),
    ],
    capabilities: { products: true, coupons: true, conversions: true, links: true },
    schedule: { couponsEveryMin: 360, productsEveryMin: 1440, conversionsEveryMin: 180 },
    notes: "Products: Product Search 1.0. Coupons: Coupon 1.0. Conversions: Events/Transactions API (u1 = our click id).",
    create: (o) => new RakutenNetworkClient(o),
  },
  {
    id: "awin",
    name: "Awin",
    docsUrl: "https://help.awin.com/apidocs/introduction-1",
    signupUrl: "https://ui.awin.com/publisher-signup/en/awin/step1",
    fields: [
      f("AWIN_API_TOKEN", true, true, "ui.awin.com → (user menu) → API Credentials → Show my API token."),
      f("AWIN_PUBLISHER_ID", true, false, "Your publisher ID (number in the dashboard URL: ui.awin.com/awin/affiliate/<ID>/…)."),
      f("AWIN_FEED_API_KEY", false, true, "Optional data-feed key: Toolbox → Create-a-Feed → the value after `apikey/` in a feed URL (not the API token). Needed only for product feeds."),
    ],
    capabilities: { products: true, coupons: true, conversions: true, links: true },
    schedule: { couponsEveryMin: 360, productsEveryMin: 1440, conversionsEveryMin: 240 },
    notes: "20 API calls/minute (legacy APIs). Promotions API for vouchers (codes only for joined advertisers); transactions ≤ 31 days per call; clickref = our click id.",
    create: (o) => new AwinNetworkClient(o),
  },
  {
    id: "partnerize",
    name: "Partnerize",
    docsUrl: "https://api-docs.partnerize.com/partner/",
    signupUrl: "https://partnerize.com/",
    fields: [
      f("PARTNERIZE_USER_API_KEY", true, true, "console.partnerize.com → Settings → API Credentials → User API Key."),
      f("PARTNERIZE_USER_APPLICATION_KEY", true, true, "Same page → User Application Key."),
      f("PARTNERIZE_PUBLISHER_ID", true, false, "Your publisher (partner) ID shown in the console account settings."),
    ],
    capabilities: { products: false, coupons: false, conversions: true, links: true },
    schedule: { couponsEveryMin: 0, productsEveryMin: 0, conversionsEveryMin: 240 },
    notes: "Conversions report (pubref = our click id). Links use each campaign's camref (stored per program).",
    create: (o) => new PartnerizeNetworkClient(o),
  },
  {
    id: "ebay_partner",
    name: "eBay Partner Network (reporting)",
    docsUrl: "https://developer.ebay.com/api-docs/buy/static/buy-requirements.html",
    signupUrl: "https://partnernetwork.ebay.com/",
    fields: [
      f("EBAY_EPN_ACCOUNT_SID", true, false, "partnernetwork.ebay.com → Tools → API → Account SID."),
      f("EBAY_EPN_AUTH_TOKEN", true, true, "Same page → Auth Token (reporting API)."),
    ],
    capabilities: { products: false, coupons: false, conversions: true, links: true },
    schedule: { couponsEveryMin: 0, productsEveryMin: 0, conversionsEveryMin: 360 },
    notes: "Product data comes from the eBay Browse adapter; this client imports EPN transactions (customid = our click id). Reporting endpoint UNVERIFIED publicly — run Test connection after entering credentials.",
    create: (o) => new EbayPartnerNetworkClient(o),
  },
];

export function getNetworkMetadata(id: string): NetworkMetadata | undefined {
  return NETWORK_REGISTRY.find((n) => n.id === id);
}

export function createNetworkClient(id: NetworkId, options?: AdapterOptions): AffiliateNetworkClient {
  const meta = getNetworkMetadata(id);
  if (!meta) throw new Error(`Unknown network: ${id}`);
  return meta.create(options);
}

export function createNetworkClients(options?: AdapterOptions): AffiliateNetworkClient[] {
  return NETWORK_REGISTRY.map((n) => n.create(options));
}

export function networkMissingEnv(id: NetworkId, env: EnvLike): string[] {
  const meta = getNetworkMetadata(id);
  return meta ? readEnv(env, meta.fields.filter((x) => x.required).map((x) => x.key)).missing : [];
}
