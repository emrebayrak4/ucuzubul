/**
 * Single catalog of every external integration manageable from the admin panel.
 * Adapter entries are derived from @pricora/retailer-adapters ADAPTER_REGISTRY; app integrations
 * (OAuth, payments, email, AI, monitoring, affiliate network reporting APIs) are declared here.
 */
import { ADAPTER_REGISTRY } from "@pricora/retailer-adapters";

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

const fromAdapters: IntegrationDef[] = ADAPTER_REGISTRY.map((m) => ({
  id: m.id,
  name: m.name,
  group: m.kind === "flight" ? "travel_flight" : m.kind === "hotel" ? "travel_hotel" : m.dataAccess === "affiliate_feed" ? "affiliate" : "retail",
  adapterId: m.id,
  fields: [
    ...m.requiredEnv.map((k) => field(k, true, k === "WALMART_PRIVATE_KEY" ? "PEM; literal \\n escapes are accepted" : null)),
    ...m.optionalEnv.filter((k) => !m.requiredEnv.includes(k)).map((k) => field(k, false)),
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
  {
    id: "cj",
    name: "CJ Affiliate (reporting API)",
    group: "affiliate",
    adapterId: null,
    fields: [field("CJ_PERSONAL_ACCESS_TOKEN", true), field("CJ_WEBSITE_ID", true, null, false), field("CJ_COMPANY_ID", false, null, false)],
    docsUrl: "https://developers.cj.com/",
    goLive: "Publisher account approval",
    notes: "Used for conversion/commission import (not implemented yet).",
  },
  {
    id: "impact",
    name: "Impact (reporting API)",
    group: "affiliate",
    adapterId: null,
    fields: [field("IMPACT_ACCOUNT_SID", true, null, false), field("IMPACT_AUTH_TOKEN", true)],
    docsUrl: "https://integrations.impact.com/impact-publisher/reference",
    goLive: "Partner account approval",
    notes: "Used for conversion/commission import (not implemented yet).",
  },
  {
    id: "awin",
    name: "Awin (reporting API)",
    group: "affiliate",
    adapterId: null,
    fields: [field("AWIN_API_TOKEN", true), field("AWIN_PUBLISHER_ID", true, null, false)],
    docsUrl: "https://wiki.awin.com/index.php/Publisher_API",
    goLive: "Publisher account approval",
    notes: "Used for conversion/commission import (not implemented yet).",
  },
  {
    id: "rakuten",
    name: "Rakuten Advertising (reporting API)",
    group: "affiliate",
    adapterId: null,
    fields: [field("RAKUTEN_CLIENT_ID", true, null, false), field("RAKUTEN_CLIENT_SECRET", true), field("RAKUTEN_SID", true, null, false)],
    docsUrl: "https://developers.rakutenadvertising.com/",
    goLive: "Publisher account approval",
    notes: "Used for conversion/commission import (not implemented yet).",
  },
];

export const INTEGRATION_CATALOG: readonly IntegrationDef[] = [...fromAdapters, ...APP_INTEGRATIONS];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find((i) => i.id === id);
}

/** Every env key managed through the catalog. */
export const MANAGED_KEYS: ReadonlySet<string> = new Set(INTEGRATION_CATALOG.flatMap((i) => i.fields.map((f) => f.key)));
