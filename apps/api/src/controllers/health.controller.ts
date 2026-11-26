import { Controller, Get, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { HealthCheck, HealthResponse } from "@pricora/contracts";
import { getAdapterStatuses, type EnvLike } from "@pricora/retailer-adapters";
import type { Redis } from "ioredis";
import type { Meilisearch } from "meilisearch";
import { INTEGRATIONS, MEILI, PRISMA, REDIS, type PrismaClient } from "../common/infra";
import type { IntegrationConfig } from "../core/integration-config";

async function timed(fn: () => Promise<unknown>): Promise<HealthCheck> {
  const t = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
    return { status: "up", latencyMs: Date.now() - t };
  } catch (err) {
    return { status: "down", latencyMs: null, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Adapter status (no network calls) for the adapters that @pricora/retailer-adapters knows about, plus app-level integrations. */
export function adapterStatuses(env: EnvLike): HealthResponse["adapters"] {
  const fromRegistry = getAdapterStatuses(env).map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind === "retailer" ? ("retailer" as const) : ("travel" as const),
    status: a.status,
  }));
  const extra: HealthResponse["adapters"] = [
    { id: "anthropic", name: "AI assistant (Anthropic)", kind: "ai", status: env.ANTHROPIC_API_KEY ? "live" : "pending_configuration" },
    { id: "stripe", name: "Stripe", kind: "payments", status: env.STRIPE_SECRET_KEY ? "live" : "pending_configuration" },
    { id: "google", name: "Google sign-in", kind: "oauth", status: env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET ? "live" : "pending_configuration" },
    { id: "apple", name: "Sign in with Apple", kind: "oauth", status: env.APPLE_CLIENT_ID && env.APPLE_PRIVATE_KEY ? "live" : "pending_configuration" },
  ];
  return [...fromRegistry, ...extra];
}

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MEILI) private readonly meili: Meilisearch,
    @Inject(INTEGRATIONS) private readonly integrations: IntegrationConfig,
  ) {}

  @Get()
  async get(): Promise<HealthResponse> {
    const [db, redis, search] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      timed(() => this.redis.ping()),
      timed(() => this.meili.health()),
    ]);
    const status = db.status === "down" ? "down" : redis.status === "down" || search.status === "down" ? "degraded" : "ok";
    if (search.status === "down") search.message = `${search.message ?? "unreachable"} — Postgres search fallback active`;
    return {
      status,
      version: process.env["npm_package_version"] ?? "0.1.0",
      time: new Date().toISOString(),
      checks: { db, redis, search },
      adapters: adapterStatuses(await this.integrations.env()),
    };
  }
}
