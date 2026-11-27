/**
 * Single catalog of every external integration manageable from the admin panel.
 * Adapter entries are derived from @pricora/retailer-adapters ADAPTER_REGISTRY; app integrations
 * (OAuth, payments, email, AI, monitoring, affiliate network reporting APIs) are declared here.
 */
import { ADAPTER_REGISTRY, NETWORK_REGISTRY, PRODUCT_SOURCE_REGISTRY } from "@pricora/retailer-adapters";

export type IntegrationGroup = "retail" | "affiliate" | "travel_flight" | "travel_hotel" | "auth" | "payments" | "email" | "ai" | "monitoring" | "branding";

export interface IntegrationField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  help: string | null;
}

export interface IntegrationDef {
  id: string;
  name: string;
  group: IntegrationGroup;
  /** Adapter id in @pricora/retailer-adapters, when the integration is an adapter. */
  adapterId: string | null;
  /** Affiliate-network client id (NETWORK_REGISTRY), when the integration is a network publisher API. */
  networkId?: string;
  /** Catalog source id (PRODUCT_SOURCE_REGISTRY: channel3, icecat), when the integration feeds the catalog. */
  productSourceId?: string;
  fields: IntegrationField[];
  docsUrl: string | null;
  goLive: string;
  notes: string;
}

const SECRET_RE = /(SECRET|PRIVATE_KEY|TOKEN|PASSWORD|API_KEY|AUTH_HEADER|_KEY$|DSN)/;
const NOT_SECRET_RE = /(ENVIRONMENT|_ENV$|BASE_URL|TEMPLATE|VERSION$|_KEY_ID$)/;

export const isSecretKey = (key: string) => SECRET_RE.test(key) && !NOT_SECRET_RE.test(key);

function label(key: string): string {
  return key
    .split("_")
    .map((w) => (["API", "ID", "URL", "SMTP", "DSN", "OAUTH", "EPN", "PEM"].includes(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

const field = (key: string, required: boolean, help: string | null = null, secret = isSecretKey(key)): IntegrationField => ({
  key,
  label: label(key),
  secret,
  required,
  help,
});

const GO_LIVE: Record<string, string> = {
  api_key: "Self-serve developer key",
  affiliate_approval: "Requires affiliate program / network approval",
  partner_contract: "Requires a signed partner agreement",
  discontinued: "Provider discontinued this API",
};

/** Where to find each adapter credential (shown under the field in Admin → Integrations). */
export const FIELD_HELP: Readonly<Record<string, string>> = {
  AMAZON_CREATORS_CREDENTIAL_ID: "Associates Central → Tools → Creators API → Manage credentials → Credential ID (needs 10 qualifying sales in the last 30 days).",
  AMAZON_CREATORS_CREDENTIAL_SECRET: "Shown once when the credential is created; regenerate if lost.",
  AMAZON_CREATORS_CREDENTIAL_VERSION: "Version shown next to the credential, e.g. 3.1 (NA, Login with Amazon) or 2.1 (NA, Cognito).",
  AMAZON_ASSOCIATE_TAG: "Your US store/tracking ID, e.g. yourstore-20 (Associates Central → Manage Tracking IDs).",
  AMAZON_MARKETPLACE: "Default www.amazon.com.",
  WALMART_CONSUMER_ID: "walmart.io → My Account → Applications → Consumer ID (after uploading your RSA public key).",
  WALMART_PRIVATE_KEY: "PEM of the RSA private key whose public half is uploaded on walmart.io; literal \\n escapes are accepted.",
  WALMART_KEY_VERSION: "Key version shown on walmart.io next to the uploaded key (usually 1).",
  WALMART_PUBLISHER_ID: "Your Impact publisher ID for Walmart (added to product tracking URLs).",
  BESTBUY_API_KEY: "developer.bestbuy.com → Get API Key (company email required).",
  BESTBUY_LEGAL_APPROVED: 'Type "true" only after counsel has approved using Best Buy API data for price comparison (the API terms restrict third-party price analysis).',
  BESTBUY_AFFILIATE_LINK_TEMPLATE: "Impact deep link for Best Buy containing {url} and {subId}, e.g. https://bestbuy.7tiv.net/c/<mpId>/<adId>/10014?u={url}&subId1={subId}.",
  EBAY_CLIENT_ID: "developer.ebay.com → Application Keys → Production App ID (Client ID).",
  EBAY_CLIENT_SECRET: "Same keyset → Cert ID (Client Secret).",
  EBAY_EPN_CAMPAIGN_ID: "partnernetwork.ebay.com → Campaigns → 10-digit campaign ID (campid).",
  EBAY_EPN_REFERENCE_ID: "Optional affiliateReferenceId sent in X-EBAY-C-ENDUSERCTX.",
  EBAY_ENVIRONMENT: '"production" (default) or "sandbox".',
  KROGER_CLIENT_ID: "developer.kroger.com → My Apps → Create App (Production, scope product.compact) → Client ID.",
  KROGER_CLIENT_SECRET: "Same app → Client Secret.",
  KROGER_LOCATION_ID: "8-character store locationId (GET /v1/locations?filter.zipCode.near=<zip> or the store page URL).",
  DUFFEL_ACCESS_TOKEN: "app.duffel.com → Developers → Access tokens. duffel_test_… works immediately (test mode); duffel_live_… after activation.",
  TRAVELPAYOUTS_TOKEN: "app.travelpayouts.com → Profile → API token.",
  TRAVELPAYOUTS_MARKER: "Your partner marker (numeric ID shown in the dashboard).",
  HOTELBEDS_API_KEY: "developer.hotelbeds.com → My Account → Hotel APItude evaluation key.",
  HOTELBEDS_SECRET: "Secret shown with the key.",
  HOTELBEDS_ENVIRONMENT: '"test" (default, evaluation) or "production" after certification.',
  EXPEDIA_RAPID_API_KEY: "Issued by Expedia Group after the Rapid partner agreement (test key works on test.ean.com only).",
  EXPEDIA_RAPID_SECRET: "Shared secret paired with the Rapid API key.",
  EXPEDIA_RAPID_ENVIRONMENT: '"test" (default) or "production".',
  BOOKING_API_KEY: "Booking.com Partner Centre → Demand API credentials (Managed Affiliate Partners only).",
  BOOKING_AFFILIATE_ID: "Your Booking.com affiliate ID (aid).",
  BOOKING_ENVIRONMENT: '"sandbox" (default) or "production".',
  AMADEUS_CLIENT_ID: "Enterprise contract credentials only (Self-Service was decommissioned 2026-07-17).",
  AMADEUS_CLIENT_SECRET: "Enterprise contract credentials only.",
  AMADEUS_BASE_URL: "Base URL issued with the enterprise contract.",
};

function adapterFieldHelp(key: string): string | null {
  const known = FIELD_HELP[key];
  if (known) return known;
  if (key.endsWith("_FEED_URL")) return "Product-feed URL from the network (CJ/Impact/Rakuten/Awin feed export for this advertiser; https).";
  if (key.endsWith("_FEED_AUTH_HEADER")) return 'Optional full header for the feed URL, e.g. "Authorization: Bearer …".';
  if (key.endsWith("_AFFILIATE_LINK_TEMPLATE")) return "Optional network deep-link template containing {url} and {subId} (sub-ID = our click id).";
  return null;
}

const fromAdapters: IntegrationDef[] = ADAPTER_REGISTRY.map((m) => ({
  id: m.id,
  name: m.name,
  group: m.kind === "flight" ? "travel_flight" : m.kind === "hotel" ? "travel_hotel" : m.dataAccess === "affiliate_feed" ? "affiliate" : "retail",
  adapterId: m.id,
  fields: [
    ...m.requiredEnv.map((k) => field(k, true, adapterFieldHelp(k), k === "BESTBUY_LEGAL_APPROVED" ? false : isSecretKey(k))),
    ...m.optionalEnv.filter((k) => !m.requiredEnv.includes(k)).map((k) => field(k, false, adapterFieldHelp(k))),
  ],
  docsUrl: m.docsUrl,
  goLive: GO_LIVE[m.goLive] ?? m.goLive,
  notes: m.notes,
}));

const APP_INTEGRATIONS: IntegrationDef[] = [
  {
    id: "google_oauth",
    name: "Google sign-in",
    group: "auth",
    adapterId: null,
    fields: [field("GOOGLE_OAUTH_CLIENT_ID", true, null, false), field("GOOGLE_OAUTH_CLIENT_SECRET", true), field("GOOGLE_OAUTH_REDIRECT_URI", false, "e.g. https://api.pricora.com/v1/auth/oauth/google/callback", false)],
    docsUrl: "https://developers.google.com/identity/protocols/oauth2/web-server",
    goLive: "Self-serve (Google Cloud console); consent screen verification for production",
    notes: "OAuth flow not implemented in the API yet; credentials can be stored now.",
  },
  {
    id: "apple_oauth",
    name: "Sign in with Apple",
    group: "auth",
    adapterId: null,
    fields: [field("APPLE_CLIENT_ID", true, "Services ID", false), field("APPLE_TEAM_ID", true, null, false), field("APPLE_KEY_ID", true, null, false), field("APPLE_PRIVATE_KEY", true, ".p8 key contents")],
    docsUrl: "https://developer.apple.com/documentation/sign_in_with_apple",
    goLive: "Apple Developer Program membership",
    notes: "OAuth flow not implemented in the API yet; credentials can be stored now.",
  },
  {
    id: "stripe",
    name: "Stripe",
    group: "payments",
    adapterId: null,
    fields: [field("STRIPE_SECRET_KEY", true), field("STRIPE_PUBLISHABLE_KEY", false, null, false), field("STRIPE_WEBHOOK_SECRET", false)],
    docsUrl: "https://docs.stripe.com/keys",
    goLive: "Self-serve; account activation for live mode",
    notes: "Use test-mode keys (sk_test_…) outside production.",
  },
  {
    id: "smtp",
    name: "Email (SMTP)",
    group: "email",
    adapterId: null,
    fields: [field("SMTP_HOST", true, null, false), field("SMTP_PORT", false, "Default 587", false), field("SMTP_USER", false, null, false), field("SMTP_PASSWORD", false), field("SMTP_FROM", true, "e.g. Pricora <no-reply@pricora.com>", false)],
    docsUrl: null,
    goLive: "Any SMTP provider (SES, Postmark, SendGrid…)",
    notes: "Mail delivery is not wired yet; the test checks TCP reachability of host:port only.",
  },
  {
    id: "anthropic",
    name: "AI assistant (Anthropic)",
    group: "ai",
    adapterId: null,
    fields: [field("ANTHROPIC_API_KEY", true)],
    docsUrl: "https://docs.anthropic.com/en/api/getting-started",
    goLive: "Self-serve API key",
    notes: "Also requires feature flag assistant.enabled.",
  },
  {
    id: "sentry",
    name: "Sentry",
    group: "monitoring",
    adapterId: null,
    fields: [field("SENTRY_DSN", true)],
    docsUrl: "https://docs.sentry.io/concepts/key-terms/dsn-explainer/",
    goLive: "Self-serve",
    notes: "SDK wiring is not implemented yet; the test only validates the DSN format.",
  },
  {
    id: "logo_dev",
    name: "Logo provider (logo.dev)",
    group: "branding",
    adapterId: null,
    fields: [field("LOGO_DEV_TOKEN", true, "Publishable token (pk_…)")],
    docsUrl: "https://www.logo.dev/docs",
    goLive: "Self-serve token; check attribution/plan terms",
    notes: "Fallback for store/brand logos when the official site icon cannot be fetched. Logos remain trademarks of their owners.",
  },
];

/** Affiliate-network publisher APIs (products, promotions, conversion reports). */
const fromNetworks: IntegrationDef[] = NETWORK_REGISTRY.map((n) => ({
  // "ebay" is already the Browse adapter's id; the EPN reporting API gets its own entry.
  id: n.id === "ebay_partner" ? "ebay_partner_network" : n.id,
  name: n.name,
  group: "affiliate" as const,
  adapterId: null,
  networkId: n.id,
  fields: n.fields.map((x) => field(x.key, x.required, x.help, x.secret)),
  docsUrl: n.docsUrl,
  goLive: GO_LIVE.affiliate_approval ?? "affiliate_approval",
  notes: `${n.notes} Capabilities: ${(Object.entries(n.capabilities) as [string, boolean][])
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ")}. Sign up: ${n.signupUrl}`,
}));

/** Catalog sources: multi-retailer product search (Channel3) and product content (Open Icecat). */
const fromProductSources: IntegrationDef[] = PRODUCT_SOURCE_REGISTRY.map((s) => ({
  id: s.id,
  name: s.name,
  group: "retail" as const,
  adapterId: null,
  productSourceId: s.id,
  fields: s.requiredEnv.map((k) => field(k, true, null, isSecretKey(k))),
  docsUrl: s.docsUrl,
  goLive: GO_LIVE.api_key ?? "api_key",
  notes: `${s.notes} Sign up: ${s.signupUrl}`,
}));

export const INTEGRATION_CATALOG: readonly IntegrationDef[] = [...fromAdapters, ...fromProductSources, ...fromNetworks, ...APP_INTEGRATIONS];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find((i) => i.id === id);
}

/** Every env key managed through the catalog. */
export const MANAGED_KEYS: ReadonlySet<string> = new Set(INTEGRATION_CATALOG.flatMap((i) => i.fields.map((f) => f.key)));
