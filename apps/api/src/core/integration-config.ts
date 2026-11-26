/**
 * Runtime integration configuration: process.env overlaid with admin-managed credentials from the DB
 * (DB wins; a disabled integration blanks its fields). Cached with a short TTL and invalidated across
 * processes via Redis pub/sub.
 */
import { connect } from "node:net";
import type { PrismaClient } from "@pricora/database";
import { createAdapter, getAdapterStatuses, type EnvLike } from "@pricora/retailer-adapters";
import { Redis } from "ioredis";
import { decryptJson } from "./crypto";
import { getIntegration, INTEGRATION_CATALOG, type IntegrationDef } from "./integrations";

export const INTEGRATIONS_CHANNEL = "pricora:integrations:changed";
const TTL_MS = 30_000;

export interface StoredIntegration {
  values: Record<string, string>;
  enabled: boolean;
  decryptError: string | null;
}

export type IntegrationStatus = "live" | "configured" | "pending_configuration" | "error" | "disabled";
export type TestStatus = "live" | "unverified" | "pending_configuration" | "error";

export interface TestResult {
  status: TestStatus;
  message: string;
  latencyMs: number | null;
}

export class IntegrationConfig {
  private cache: { at: number; env: EnvLike; stored: Map<string, StoredIntegration> } | null = null;
  private inflight: Promise<void> | null = null;
  private subscriber: Redis | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly key: Buffer | null,
    private readonly baseEnv: EnvLike = process.env,
  ) {}

  private async load(): Promise<void> {
    const rows = await this.prisma.integrationCredential.findMany();
    const stored = new Map<string, StoredIntegration>();
    for (const r of rows) {
      let values: Record<string, string> = {};
      let decryptError: string | null = null;
      if (!this.key) decryptError = "CREDENTIALS_ENCRYPTION_KEY is not set";
      else {
        try {
          values = decryptJson(r.ciphertext, this.key);
        } catch {
          decryptError = "Stored credentials cannot be decrypted (encryption key changed?) — re-enter them";
        }
      }
      stored.set(r.adapterId, { values, enabled: r.enabled, decryptError });
    }
    const env: Record<string, string | undefined> = { ...this.baseEnv };
    // Enabled overrides first, then disabled integrations blank their own fields.
    for (const s of stored.values()) {
      if (!s.enabled) continue;
      for (const [k, v] of Object.entries(s.values)) if (v !== "") env[k] = v;
    }
    for (const [id, s] of stored) {
      if (s.enabled) continue;
      for (const f of getIntegration(id)?.fields ?? []) env[f.key] = "";
    }
    this.cache = { at: Date.now(), env, stored };
  }

  private async ensure(): Promise<NonNullable<IntegrationConfig["cache"]>> {
    if (!this.cache || Date.now() - this.cache.at > TTL_MS) {
      if (!this.inflight) this.inflight = this.load().finally(() => (this.inflight = null));
      await this.inflight;
    }
    if (!this.cache) throw new Error("integration config failed to load");
    return this.cache;
  }

  /** Merged env for adapters (DB overrides process.env). */
  async env(): Promise<EnvLike> {
    return (await this.ensure()).env;
  }

  async get(key: string): Promise<string | undefined> {
    const v = (await this.env())[key];
    return v === undefined || v === "" ? undefined : v;
  }

  async stored(): Promise<Map<string, StoredIntegration>> {
    return (await this.ensure()).stored;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** Listen for invalidations published by other processes (API ↔ worker). */
  subscribe(redisUrl: string): void {
    if (this.subscriber) return;
    const sub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
    sub.on("error", () => undefined);
    sub.on("message", () => this.invalidate());
    void sub.connect().then(() => sub.subscribe(INTEGRATIONS_CHANNEL)).catch(() => undefined);
    this.subscriber = sub;
  }

  async close(): Promise<void> {
    this.subscriber?.disconnect();
    this.subscriber = null;
  }

  /** Status for every catalog entry (no network calls). */
  async statuses(): Promise<Map<string, IntegrationStatus>> {
    const env = await this.env();
    const stored = await this.stored();
    const adapterStatus = new Map(getAdapterStatuses(env).map((a) => [a.id, a.status]));
    const out = new Map<string, IntegrationStatus>();
    for (const def of INTEGRATION_CATALOG) {
      const s = stored.get(def.id);
      if (s && !s.enabled) out.set(def.id, "disabled");
      else if (s?.decryptError) out.set(def.id, "error");
      else if (def.adapterId) out.set(def.id, adapterStatus.get(def.adapterId) ?? "pending_configuration");
      else out.set(def.id, missingRequired(def, env).length ? "pending_configuration" : "configured");
    }
    return out;
  }
}

export function missingRequired(def: IntegrationDef, env: EnvLike): string[] {
  return def.fields.filter((f) => f.required && !env[f.key]).map((f) => f.key);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`Timed out after ${ms} ms`)), ms))]);
}

/** Runs a real connectivity/credential check. Never reports success without a successful provider response. */
export async function testIntegration(def: IntegrationDef, env: EnvLike, timeoutMs = 8000, fetchImpl: typeof fetch = fetch): Promise<TestResult> {
  const missing = missingRequired(def, env);
  if (missing.length) return { status: "pending_configuration", message: `Missing: ${missing.join(", ")}`, latencyMs: null };
  const start = Date.now();
  const elapsed = () => Date.now() - start;
  try {
    if (def.adapterId) {
      const adapter = createAdapter(def.adapterId, { env });
      const r = await withTimeout(adapter.healthCheck(), timeoutMs);
      return { status: r.status === "live" ? "live" : r.status === "pending_configuration" ? "pending_configuration" : "error", message: r.message, latencyMs: r.latencyMs ?? elapsed() };
    }
    switch (def.id) {
      case "stripe": {
        const res = await withTimeout(fetchImpl("https://api.stripe.com/v1/balance", { headers: { authorization: `Bearer ${env["STRIPE_SECRET_KEY"] ?? ""}` } }), timeoutMs);
        return res.ok
          ? { status: "live", message: "Stripe accepted the secret key", latencyMs: elapsed() }
          : { status: "error", message: `Stripe responded HTTP ${res.status}`, latencyMs: elapsed() };
      }
      case "anthropic": {
        const res = await withTimeout(
          fetchImpl("https://api.anthropic.com/v1/models", { headers: { "x-api-key": env["ANTHROPIC_API_KEY"] ?? "", "anthropic-version": "2023-06-01" } }),
          timeoutMs,
        );
        return res.ok
          ? { status: "live", message: "Anthropic accepted the API key", latencyMs: elapsed() }
          : { status: "error", message: `Anthropic responded HTTP ${res.status}`, latencyMs: elapsed() };
      }
      case "smtp": {
        const host = env["SMTP_HOST"] ?? "";
        const port = Number(env["SMTP_PORT"] || 587);
        await withTimeout(
          new Promise<void>((resolve, reject) => {
            const sock = connect({ host, port }, () => {
              sock.end();
              resolve();
            });
            sock.on("error", reject);
          }),
          timeoutMs,
        );
        return { status: "unverified", message: `TCP connection to ${host}:${port} succeeded; login/delivery not verified`, latencyMs: elapsed() };
      }
      case "logo_dev": {
        const res = await withTimeout(fetchImpl(`https://img.logo.dev/apple.com?token=${encodeURIComponent(env["LOGO_DEV_TOKEN"] ?? "")}&format=png`), timeoutMs);
        return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")
          ? { status: "live", message: "logo.dev returned an image for the token", latencyMs: elapsed() }
          : { status: "error", message: `logo.dev responded HTTP ${res.status}`, latencyMs: elapsed() };
      }
      case "sentry": {
        const ok = /^https:\/\/[^@\s]+@[^/\s]+\/\d+$/.test(env["SENTRY_DSN"] ?? "");
        return ok
          ? { status: "unverified", message: "DSN format is valid; event delivery not verified", latencyMs: null }
          : { status: "error", message: "DSN format is invalid", latencyMs: null };
      }
      default:
        return { status: "unverified", message: "Credentials stored; no automated check is available for this integration", latencyMs: null };
    }
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err), latencyMs: elapsed() };
  }
}
