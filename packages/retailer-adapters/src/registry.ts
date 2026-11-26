/**
 * Adapter registry with metadata. See docs/DATA_SOURCES.md for sources and verification notes.
 */
import type { AdapterOptions } from "./base";
import { AffiliateFeedAdapter } from "./feeds/affiliateFeed";
import { AmazonCreatorsAdapter } from "./retailers/amazon";
import { BestBuyAdapter } from "./retailers/bestbuy";
import { EbayBrowseAdapter } from "./retailers/ebay";
import { KrogerAdapter } from "./retailers/kroger";
import { WalmartAffiliateAdapter } from "./retailers/walmart";
import { AmadeusFlightProvider, DuffelFlightProvider, TravelpayoutsFlightProvider } from "./travel/flights";
import { BookingDemandHotelProvider, ExpediaRapidHotelProvider, HotelbedsHotelProvider, TravelpayoutsHotelProvider } from "./travel/hotels";
import type { AdapterKind, AdapterStatus, DataAccess, EnvLike, FlightProvider, HotelProvider, RetailerAdapter } from "./types";
import { defaultEnv, readEnv } from "./util";

/** What it takes to switch the adapter to live. */
export type GoLiveRequirement =
  | "api_key" // self-serve developer key
  | "affiliate_approval" // approval by an affiliate program / network advertiser
  | "partner_contract" // signed partnership / commercial agreement
  | "discontinued";

export type AnyAdapter = RetailerAdapter | FlightProvider | HotelProvider;

export interface AdapterMetadata {
  id: string;
  name: string;
  kind: AdapterKind;
  dataAccess: DataAccess;
  affiliateNetwork: string | null;
  docsUrl: string;
  requiredEnv: readonly string[];
  optionalEnv: readonly string[];
  goLive: GoLiveRequirement;
  notes: string;
  create(options?: AdapterOptions): AnyAdapter;
}

interface FeedRetailerDef {
  id: string;
  name: string;
  envPrefix: string;
  network: string;
  /** Best available source (official page where reachable, otherwise the third-party source used). */
  docsUrl: string;
  notes: string;
}

/** Retailers with no public product API: covered through affiliate-network product feeds. */
const FEED_RETAILERS: readonly FeedRetailerDef[] = [
  { id: "target", name: "Target", envPrefix: "TARGET", network: "Impact", docsUrl: "https://partners.target.com/", notes: "Target Partners on Impact; creator program replaced 2026-05 (Club Target). Feed availability UNVERIFIED." },
  { id: "costco", name: "Costco", envPrefix: "COSTCO", network: "CJ", docsUrl: "https://manychat.com/blog/costco-affiliate-program/", notes: "Network per third-party directories (medium confidence); mostly memberships commissionable." },
  { id: "homedepot", name: "The Home Depot", envPrefix: "HOME_DEPOT", network: "Impact", docsUrl: "https://www.homedepot.com/c/SF_MS_The_Home_Depot_Affiliate_Program", notes: "Impact confirmed on official page; daily product feed UNVERIFIED." },
  { id: "lowes", name: "Lowe's", envPrefix: "LOWES", network: "Impact or CJ (UNVERIFIED)", docsUrl: "https://uppromote.com/affiliate-directory/lowes/", notes: "Sources conflict on network; confirm in network dashboard." },
  { id: "newegg", name: "Newegg", envPrefix: "NEWEGG", network: "Rakuten", docsUrl: "https://www.newegg.com/affiliates", notes: "Rakuten confirmed on official page." },
  { id: "bhphoto", name: "B&H Photo", envPrefix: "BH_PHOTO", network: "Impact", docsUrl: "https://uppromote.com/affiliate-directory/bh-photo/", notes: "Network per directories (medium confidence)." },
  { id: "adorama", name: "Adorama", envPrefix: "ADORAMA", network: "Impact", docsUrl: "https://uppromote.com/affiliate-directory/adorama/", notes: "Network per directories (medium confidence)." },
  { id: "macys", name: "Macy's", envPrefix: "MACYS", network: "Rakuten or CJ (UNVERIFIED)", docsUrl: "https://www.flexoffers.com/affiliate-programs/macys-com-affiliate-program", notes: "Sources conflict on network." },
  { id: "kohls", name: "Kohl's", envPrefix: "KOHLS", network: "Impact", docsUrl: "https://uppromote.com/affiliate-directory/kohls/", notes: "Network per directories (medium confidence)." },
  { id: "wayfair", name: "Wayfair", envPrefix: "WAYFAIR", network: "CJ", docsUrl: "https://strackr.com/blog/wayfair-affiliate-program", notes: "CJ for US (medium confidence); Awin for UK." },
  { id: "staples", name: "Staples", envPrefix: "STAPLES", network: "Rakuten or CJ (UNVERIFIED)", docsUrl: "https://uppromote.com/affiliate-directory/staples/", notes: "Sources conflict on network." },
  { id: "officedepot", name: "Office Depot / OfficeMax", envPrefix: "OFFICE_DEPOT", network: "CJ", docsUrl: "https://www.officedepot.com/l/help/affiliate-program", notes: "CJ (medium confidence)." },
  { id: "walgreens", name: "Walgreens", envPrefix: "WALGREENS", network: "CJ", docsUrl: "https://uppromote.com/affiliate-program-directory/walgreens", notes: "CJ (medium confidence); also FlexOffers." },
  { id: "cvs", name: "CVS", envPrefix: "CVS", network: "CJ", docsUrl: "https://linkclicky.com/affiliate-program/cvs/", notes: "CJ (low-medium confidence); also FlexOffers." },
  { id: "gamestop", name: "GameStop", envPrefix: "GAMESTOP", network: "Rakuten (UNVERIFIED)", docsUrl: "https://uppromote.com/affiliate-directory/gamestop/", notes: "Directory-only source." },
  { id: "samsclub", name: "Sam's Club", envPrefix: "SAMS_CLUB", network: "Rakuten", docsUrl: "https://www.samsclub.com/content/affiliates", notes: "developer.samsclub.com is a seller/supplier API, not a catalog API for affiliates." },
  { id: "chewy", name: "Chewy", envPrefix: "CHEWY", network: "Impact", docsUrl: "https://www.chewy.com/app/content/affiliate", notes: "Impact per official page (older sources: CJ/Partnerize)." },
];

function feedMeta(def: FeedRetailerDef): AdapterMetadata {
  const urlEnv = `${def.envPrefix}_FEED_URL`;
  const authEnv = `${def.envPrefix}_FEED_AUTH_HEADER`;
  const tplEnv = `${def.envPrefix}_AFFILIATE_LINK_TEMPLATE`;
  return {
    id: def.id,
    name: def.name,
    kind: "retailer",
    dataAccess: "affiliate_feed",
    affiliateNetwork: def.network,
    docsUrl: def.docsUrl,
    requiredEnv: [urlEnv],
    optionalEnv: [authEnv, tplEnv],
    goLive: "affiliate_approval",
    notes: `No public product API; scraping prohibited by ToS. ${def.notes}`,
    create: (options) =>
      new AffiliateFeedAdapter(
        { id: def.id, name: def.name, affiliateNetwork: def.network, feedUrlEnv: urlEnv, feedAuthHeaderEnv: authEnv, affiliateLinkTemplateEnv: tplEnv },
        options,
      ),
  };
}

export const ADAPTER_REGISTRY: readonly AdapterMetadata[] = [
  {
    id: "amazon",
    name: "Amazon",
    kind: "retailer",
    dataAccess: "official_api",
    affiliateNetwork: "Amazon Associates (in-house)",
    docsUrl: "https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction",
    requiredEnv: ["AMAZON_CREATORS_CREDENTIAL_ID", "AMAZON_CREATORS_CREDENTIAL_SECRET", "AMAZON_CREATORS_CREDENTIAL_VERSION", "AMAZON_ASSOCIATE_TAG"],
    optionalEnv: ["AMAZON_MARKETPLACE"],
    goLive: "affiliate_approval",
    notes: "Creators API (PA-API 5 deprecated, returns 403). Needs an approved Associates account with 10 qualifying sales in the last 30 days; access lapses after 30 days without sales.",
    create: (o) => new AmazonCreatorsAdapter(o),
  },
  {
    id: "walmart",
    name: "Walmart",
    kind: "retailer",
    dataAccess: "official_api",
    affiliateNetwork: "Impact",
    docsUrl: "https://walmart.io/apidocs/affiliates/quickstart",
    requiredEnv: ["WALMART_CONSUMER_ID", "WALMART_PRIVATE_KEY", "WALMART_KEY_VERSION"],
    optionalEnv: ["WALMART_PUBLISHER_ID"],
    goLive: "affiliate_approval",
    notes: "Affiliate API with RSA signature auth; approved Walmart affiliate (Impact) account required.",
    create: (o) => new WalmartAffiliateAdapter(o),
  },
  {
    id: "bestbuy",
    name: "Best Buy",
    kind: "retailer",
    dataAccess: "official_api",
    affiliateNetwork: "Impact",
    docsUrl: "https://bestbuyapis.github.io/api-documentation/",
    requiredEnv: ["BESTBUY_API_KEY"],
    optionalEnv: ["BESTBUY_AFFILIATE_LINK_TEMPLATE"],
    goLive: "api_key",
    notes: "Self-serve key (company email). 5 req/s, 50k/day, 72h cache cap. LEGAL REVIEW: terms restrict using data to analyze Best Buy pricing for third parties.",
    create: (o) => new BestBuyAdapter(o),
  },
  {
    id: "ebay",
    name: "eBay",
    kind: "retailer",
    dataAccess: "official_api",
    affiliateNetwork: "eBay Partner Network (in-house)",
    docsUrl: "https://developer.ebay.com/develop/api/buy/browse_api.md",
    requiredEnv: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_EPN_CAMPAIGN_ID"],
    optionalEnv: ["EBAY_EPN_REFERENCE_ID", "EBAY_ENVIRONMENT"],
    goLive: "api_key",
    notes: "Browse API with developer keys (5,000 calls/day default) + self-serve EPN campaign id for commissions.",
    create: (o) => new EbayBrowseAdapter(o),
  },
  {
    id: "kroger",
    name: "Kroger",
    kind: "retailer",
    dataAccess: "official_api",
    affiliateNetwork: null,
    docsUrl: "https://developer.kroger.com/",
    requiredEnv: ["KROGER_CLIENT_ID", "KROGER_CLIENT_SECRET", "KROGER_LOCATION_ID"],
    optionalEnv: [],
    goLive: "api_key",
    notes: "Public Products API (OAuth2 client credentials, scope product.compact); store-specific prices via location id; 10,000 calls/day. Affiliate network UNVERIFIED.",
    create: (o) => new KrogerAdapter(o),
  },
  ...FEED_RETAILERS.map(feedMeta),
  {
    id: "merchant_feed",
    name: "Merchant feed upload",
    kind: "retailer",
    dataAccess: "affiliate_feed",
    affiliateNetwork: null,
    docsUrl: "https://support.google.com/merchants/answer/7052112",
    requiredEnv: [],
    optionalEnv: [],
    goLive: "api_key",
    notes: "Generic CSV/TSV/XML parser (Google Merchant-style columns) for merchant-portal uploads; use AffiliateFeedAdapter.parseFeed().",
    create: (o) => new AffiliateFeedAdapter({ id: "merchant_feed", name: "Merchant feed upload", dataAccess: "affiliate_feed", source: "merchant_upload" }, o),
  },
  {
    id: "duffel",
    name: "Duffel",
    kind: "flight",
    dataAccess: "official_api",
    affiliateNetwork: null,
    docsUrl: "https://duffel.com/docs/api/v2/offer-requests/create-offer-request",
    requiredEnv: ["DUFFEL_ACCESS_TOKEN"],
    optionalEnv: [],
    goLive: "api_key",
    notes: "Self-serve test mode (duffel_test_ tokens) immediately; live bookings need account activation + balance. $3/order.",
    create: (o) => new DuffelFlightProvider(o),
  },
  {
    id: "amadeus",
    name: "Amadeus (Enterprise)",
    kind: "flight",
    dataAccess: "partner_only",
    affiliateNetwork: null,
    docsUrl: "https://amadeus.com/en/industry-messaging/statement-regarding-amadeus-for-developers-portal",
    requiredEnv: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET", "AMADEUS_BASE_URL"],
    optionalEnv: [],
    goLive: "partner_contract",
    notes: "Self-Service APIs decommissioned 2026-07-17 (keys disabled). Enterprise access by contract only.",
    create: (o) => new AmadeusFlightProvider(o),
  },
  {
    id: "travelpayouts",
    name: "Travelpayouts (Aviasales)",
    kind: "flight",
    dataAccess: "affiliate_feed",
    affiliateNetwork: "Travelpayouts",
    docsUrl: "https://support.travelpayouts.com/hc/en-us/articles/203956163",
    requiredEnv: ["TRAVELPAYOUTS_TOKEN", "TRAVELPAYOUTS_MARKER"],
    optionalEnv: [],
    goLive: "api_key",
    notes: "Self-serve affiliate signup; Data API returns cached fares (<=48h old). Real-time Search API needs 50k+ MAU.",
    create: (o) => new TravelpayoutsFlightProvider(o),
  },
  {
    id: "travelpayouts_hotels",
    name: "Travelpayouts Hotels (Hotellook)",
    kind: "hotel",
    dataAccess: "affiliate_feed",
    affiliateNetwork: "Travelpayouts",
    docsUrl: "https://support.travelpayouts.com/hc/en-us/articles/29534131568530-FAQ-on-the-closure-of-Hotellook",
    requiredEnv: [],
    optionalEnv: [],
    goLive: "discontinued",
    notes: "Hotellook closed 2025-10-20; API disabled; no replacement.",
    create: (o) => new TravelpayoutsHotelProvider(o),
  },
  {
    id: "expedia_rapid",
    name: "Expedia Rapid",
    kind: "hotel",
    dataAccess: "partner_only",
    affiliateNetwork: null,
    docsUrl: "https://developers.expediagroup.com/docs/products/rapid/setup/getting-started",
    requiredEnv: ["EXPEDIA_RAPID_API_KEY", "EXPEDIA_RAPID_SECRET"],
    optionalEnv: ["EXPEDIA_RAPID_ENVIRONMENT"],
    goLive: "partner_contract",
    notes: "Partner application + launch review; test key works on test.ean.com only.",
    create: (o) => new ExpediaRapidHotelProvider(o),
  },
  {
    id: "booking",
    name: "Booking.com Demand API",
    kind: "hotel",
    dataAccess: "partner_only",
    affiliateNetwork: "Booking.com Affiliate Partner Programme",
    docsUrl: "https://developers.booking.com/demand/docs",
    requiredEnv: ["BOOKING_API_KEY", "BOOKING_AFFILIATE_ID"],
    optionalEnv: ["BOOKING_ENVIRONMENT"],
    goLive: "partner_contract",
    notes: "Managed Affiliate Partner contract required; key from Partner Centre.",
    create: (o) => new BookingDemandHotelProvider(o),
  },
  {
    id: "hotelbeds",
    name: "Hotelbeds APItude",
    kind: "hotel",
    dataAccess: "official_api",
    affiliateNetwork: null,
    docsUrl: "https://developer.hotelbeds.com/documentation/getting-started/",
    requiredEnv: ["HOTELBEDS_API_KEY", "HOTELBEDS_SECRET"],
    optionalEnv: ["HOTELBEDS_ENVIRONMENT"],
    goLive: "api_key",
    notes: "Self-serve evaluation key (50 req/day, test env); production requires certification + contract. Net (wholesale) rates.",
    create: (o) => new HotelbedsHotelProvider(o),
  },
];

export function getAdapterMetadata(id: string): AdapterMetadata | undefined {
  return ADAPTER_REGISTRY.find((m) => m.id === id);
}

export function createAdapter(id: string, options?: AdapterOptions): AnyAdapter {
  const meta = getAdapterMetadata(id);
  if (!meta) throw new Error(`Unknown adapter: ${id}`);
  return meta.create(options);
}

export function createRetailerAdapters(options?: AdapterOptions): RetailerAdapter[] {
  return ADAPTER_REGISTRY.filter((m) => m.kind === "retailer").map((m) => m.create(options) as RetailerAdapter);
}

export function createFlightProviders(options?: AdapterOptions): FlightProvider[] {
  return ADAPTER_REGISTRY.filter((m) => m.kind === "flight").map((m) => m.create(options) as FlightProvider);
}

export function createHotelProviders(options?: AdapterOptions): HotelProvider[] {
  return ADAPTER_REGISTRY.filter((m) => m.kind === "hotel").map((m) => m.create(options) as HotelProvider);
}

export interface AdapterStatusSummary {
  id: string;
  name: string;
  kind: AdapterKind;
  status: AdapterStatus;
  missingEnv: string[];
  goLive: GoLiveRequirement;
}

/** Status for every adapter without any network calls (for /v1/health and admin). */
export function getAdapterStatuses(env: EnvLike = defaultEnv()): AdapterStatusSummary[] {
  return ADAPTER_REGISTRY.map((m) => {
    const missing = readEnv(env, m.requiredEnv).missing;
    const status: AdapterStatus = m.goLive === "discontinued" ? "error" : missing.length ? "pending_configuration" : "live";
    return { id: m.id, name: m.name, kind: m.kind, status, missingEnv: missing, goLive: m.goLive };
  });
}

/** Every env var referenced by any adapter (for .env.example generation). */
export function allAdapterEnvKeys(): string[] {
  return [...new Set(ADAPTER_REGISTRY.flatMap((m) => [...m.requiredEnv, ...m.optionalEnv]))].sort();
}
