import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v));

const url = z.string().url();

/** Server-side env (API, worker, seed). Optional keys are undefined when not configured. */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  MEILI_HOST: url.default("http://localhost:7700"),
  MEILI_MASTER_KEY: optionalString,

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  WEB_ORIGIN: url.default("http://localhost:3100"),
  ADMIN_ORIGIN: url.default("http://localhost:3001"),
  API_URL: url.default("http://localhost:4400"),
  API_PORT: z.coerce.number().int().positive().default(4400),
  /** Shared secret for trusted server-to-server calls (web/admin SSR) sent as x-internal-api-key. Min 32 chars. */
  INTERNAL_API_KEY: optionalString.pipe(z.string().min(32).optional()),
  /** Express "trust proxy" value: unset = do not trust X-Forwarded-For; "loopback", "1", or comma-separated IPs/CIDRs. */
  TRUST_PROXY: optionalString,
  /** Requests per minute per client (IP or signed-in user). */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  /** Login/register/reset attempts per minute per client IP (per-account lockout applies on top). */
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  /** Directory shared by API and worker for uploaded merchant feeds (use object storage in production). */
  FEED_UPLOAD_DIR: optionalString,
  /** Local-disk object storage root (dev). Files are served by the API at /static. Default: <repo>/.data/storage. */
  STORAGE_DIR: optionalString,
  /** 32-byte key (base64) for AES-256-GCM encryption of admin-managed integration credentials. Required in production. */
  CREDENTIALS_ENCRYPTION_KEY: optionalString.refine(
    (v) => v === undefined || Buffer.from(v, "base64").length === 32,
    "CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
  ),

  SEED_ADMIN_PASSWORD: optionalString,

  AMAZON_PAAPI_ACCESS_KEY: optionalString,
  AMAZON_PAAPI_SECRET_KEY: optionalString,
  AMAZON_PAAPI_PARTNER_TAG: optionalString,
  AMAZON_PAAPI_HOST: optionalString,
  AMAZON_PAAPI_REGION: optionalString,
  WALMART_CONSUMER_ID: optionalString,
  WALMART_PRIVATE_KEY: optionalString,
  WALMART_KEY_VERSION: optionalString,
  WALMART_PUBLISHER_ID: optionalString,
  BESTBUY_API_KEY: optionalString,
  EBAY_CLIENT_ID: optionalString,
  EBAY_CLIENT_SECRET: optionalString,
  EBAY_CAMPAIGN_ID: optionalString,

  CJ_PERSONAL_ACCESS_TOKEN: optionalString,
  CJ_WEBSITE_ID: optionalString,
  CJ_COMPANY_ID: optionalString,
  IMPACT_ACCOUNT_SID: optionalString,
  IMPACT_AUTH_TOKEN: optionalString,
  AWIN_API_TOKEN: optionalString,
  AWIN_PUBLISHER_ID: optionalString,
  RAKUTEN_CLIENT_ID: optionalString,
  RAKUTEN_CLIENT_SECRET: optionalString,
  RAKUTEN_SID: optionalString,

  DUFFEL_ACCESS_TOKEN: optionalString,
  AMADEUS_CLIENT_ID: optionalString,
  AMADEUS_CLIENT_SECRET: optionalString,
  AMADEUS_ENV: z.enum(["test", "production"]).default("test"),
  TRAVELPAYOUTS_TOKEN: optionalString,
  TRAVELPAYOUTS_MARKER: optionalString,
  EXPEDIA_RAPID_API_KEY: optionalString,
  EXPEDIA_RAPID_SHARED_SECRET: optionalString,
  BOOKING_AFFILIATE_ID: optionalString,
  BOOKING_API_KEY: optionalString,

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_PUBLISHABLE_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalString,
  APPLE_CLIENT_ID: optionalString,
  APPLE_TEAM_ID: optionalString,
  APPLE_KEY_ID: optionalString,
  APPLE_PRIVATE_KEY: optionalString,

  ANTHROPIC_API_KEY: optionalString,
  SENTRY_DSN: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Production must have an encryption key for stored integration credentials. */
const productionGuards = (env: ServerEnv): { path: string; message: string }[] =>
  env.NODE_ENV === "production" && !env.CREDENTIALS_ENCRYPTION_KEY
    ? [{ path: "CREDENTIALS_ENCRYPTION_KEY", message: "required in production" }]
    : [];

/** Public (browser/mobile-safe) env. Never put secrets here. */
export const publicEnvSchema = z.object({
  API_URL: url.default("http://localhost:4400"),
  WEB_ORIGIN: url.default("http://localhost:3100"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export interface EnvIssue {
  path: string;
  message: string;
}

export class EnvValidationError extends Error {
  readonly issues: EnvIssue[];
  constructor(issues: EnvIssue[]) {
    super("Invalid environment:\n" + issues.map((i) => "  - " + i.path + ": " + i.message).join("\n"));
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const guard = productionGuards(result.data);
  if (guard.length) throw new EnvValidationError(guard);
  return result.data;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return publicEnvSchema.parse(source);
}

/** True when every listed key has a non-empty value. Adapters use this to report pending_configuration. */
export function hasKeys<K extends keyof ServerEnv>(env: ServerEnv, keys: readonly K[]): boolean {
  return keys.every((k) => {
    const v = env[k];
    return v !== undefined && v !== null && v !== "";
  });
}
