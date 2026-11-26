import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from "@nestjs/common";
import type { ServerEnv } from "@pricora/config/env";
import type { AdminIntegration, AdminIntegrationListResponse, AdminIntegrationTestResponse, OkResponse } from "@pricora/contracts";
import type { Redis } from "ioredis";
import { Auth, type AuthedRequest } from "../common/auth";
import { ApiException, notFound } from "../common/errors";
import { ENV, INTEGRATIONS, PRISMA, REDIS, type PrismaClient } from "../common/infra";
import { input } from "../common/validate";
import { decryptJson, encryptJson, maskSecret, parseKey } from "../core/crypto";
import { INTEGRATIONS_CHANNEL, testIntegration, type IntegrationConfig } from "../core/integration-config";
import { getIntegration, INTEGRATION_CATALOG, type IntegrationDef } from "../core/integrations";
import { buildOpenApi } from "../openapi";

@Controller("admin")
export class IntegrationsController {
  private readonly key: Buffer | null;
  private openapi: Record<string, unknown> | null = null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(INTEGRATIONS) private readonly config: IntegrationConfig,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {
    this.key = parseKey(env.CREDENTIALS_ENCRYPTION_KEY);
  }

  private requireKey(): Buffer {
    if (!this.key) throw new ApiException(503, "pending_configuration", "CREDENTIALS_ENCRYPTION_KEY is not configured on the API server");
    return this.key;
  }

  private def(id: string): IntegrationDef {
    const d = getIntegration(id);
    if (!d) throw notFound("Integration");
    return d;
  }

  private async changed(): Promise<void> {
    this.config.invalidate();
    await this.redis.publish(INTEGRATIONS_CHANNEL, String(Date.now())).catch(() => undefined);
  }

  private async view(defs: readonly IntegrationDef[]): Promise<AdminIntegration[]> {
    const [env, stored, statuses, rows] = await Promise.all([
      this.config.env(),
      this.config.stored(),
      this.config.statuses(),
      this.prisma.integrationCredential.findMany({
        where: { adapterId: { in: defs.map((d) => d.id) } },
        include: { updatedBy: { select: { id: true, email: true } } },
      }),
    ]);
    return defs.map((d) => {
      const s = stored.get(d.id);
      const row = rows.find((r) => r.adapterId === d.id);
      return {
        id: d.id,
        name: d.name,
        group: d.group,
        adapterId: d.adapterId,
        status: statuses.get(d.id) ?? "pending_configuration",
        enabled: s?.enabled ?? true,
        hasStoredCredentials: Boolean(row),
        fields: d.fields.map((f) => {
          const dbValue = s?.values[f.key];
          const effective = s && !s.enabled ? undefined : env[f.key] || undefined;
          const source = dbValue ? "db" : effective ? "env" : null;
          const value = dbValue || effective;
          return {
            key: f.key,
            label: f.label,
            secret: f.secret,
            required: f.required,
            help: f.help,
            isSet: Boolean(value),
            source,
            masked: value ? (f.secret ? maskSecret(value) : value) : null,
          };
        }),
        docsUrl: d.docsUrl,
        goLive: d.goLive,
        notes: d.notes,
        lastTest:
          row?.lastTestAt && row.lastTestStatus
            ? {
                at: row.lastTestAt.toISOString(),
                status: row.lastTestStatus as NonNullable<AdminIntegration["lastTest"]>["status"],
                message: row.lastTestMessage,
                latencyMs: row.lastTestLatencyMs,
              }
            : null,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
        error: s?.decryptError ?? null,
      };
    });
  }

  private async audit(req: AuthedRequest, action: string, id: string, diff: Record<string, unknown>): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: req.user?.id ?? null,
        action,
        entityType: "IntegrationCredential",
        entityId: id,
        diff: diff as object,
        ip: req.ip ?? null,
        userAgent: (req.headers["user-agent"] ?? "").slice(0, 300) || null,
      },
    });
  }

  @Get("integrations")
  @Auth("admin")
  async list(): Promise<AdminIntegrationListResponse> {
    return { items: await this.view(INTEGRATION_CATALOG), encryptionConfigured: this.key !== null };
  }

  @Get("integrations/:id")
  @Auth("admin")
  async get(@Param() params: unknown): Promise<AdminIntegration> {
    const { id } = input("admin.integrations.get", "params", params);
    const [out] = await this.view([this.def(id)]);
    if (!out) throw notFound("Integration");
    return out;
  }

  @Put("integrations/:id")
  @Auth("admin")
  async update(@Param() params: unknown, @Body() body: unknown, @Req() req: AuthedRequest): Promise<AdminIntegration> {
    const { id } = input("admin.integrations.update", "params", params);
    const b = input("admin.integrations.update", "body", body);
    const def = this.def(id);
    const key = this.requireKey();
    const allowed = new Set(def.fields.map((f) => f.key));
    const unknown = Object.keys(b.fields).filter((k) => !allowed.has(k));
    if (unknown.length) throw new ApiException(422, "validation_failed", `Unknown field(s) for ${def.name}: ${unknown.join(", ")}`);

    const existing = await this.prisma.integrationCredential.findUnique({ where: { adapterId: id } });
    let values: Record<string, string> = {};
    if (existing) {
      try {
        values = decryptJson(existing.ciphertext, key);
      } catch {
        values = {}; // unreadable (key rotated) → start fresh with what is submitted
      }
    }
    const set: string[] = [];
    const cleared: string[] = [];
    for (const [k, v] of Object.entries(b.fields)) {
      if (v === null) {
        if (k in values) cleared.push(k);
        delete values[k];
      } else if (v.trim() !== "") {
        values[k] = v.trim();
        set.push(k);
      }
    }
    const ciphertext = encryptJson(values, key);
    await this.prisma.integrationCredential.upsert({
      where: { adapterId: id },
      update: { ciphertext, ...(b.enabled !== undefined ? { enabled: b.enabled } : {}), updatedById: req.user?.id ?? null },
      create: { adapterId: id, ciphertext, enabled: b.enabled ?? true, updatedById: req.user?.id ?? null },
    });
    // Audit field names only — never values.
    await this.audit(req, "integration.update", id, { fieldsSet: set, fieldsCleared: cleared, ...(b.enabled !== undefined ? { enabled: b.enabled } : {}) });
    await this.changed();
    const [out] = await this.view([def]);
    if (!out) throw notFound("Integration");
    return out;
  }

  @Post("integrations/:id/test")
  @HttpCode(200)
  @Auth("admin")
  async test(@Param() params: unknown, @Req() req: AuthedRequest): Promise<AdminIntegrationTestResponse> {
    const { id } = input("admin.integrations.test", "params", params);
    const def = this.def(id);
    const stored = (await this.config.stored()).get(id);
    const result =
      stored && !stored.enabled
        ? { status: "pending_configuration" as const, message: "Integration is disabled", latencyMs: null }
        : await testIntegration(def, await this.config.env());
    const testedAt = new Date();
    await this.prisma.integrationCredential.updateMany({
      where: { adapterId: id },
      data: { lastTestAt: testedAt, lastTestStatus: result.status, lastTestMessage: result.message.slice(0, 500), lastTestLatencyMs: result.latencyMs },
    });
    await this.audit(req, "integration.test", id, { status: result.status });
    return { id, status: result.status, message: result.message, latencyMs: result.latencyMs === null ? null : Math.round(result.latencyMs), testedAt: testedAt.toISOString() };
  }

  @Delete("integrations/:id")
  @Auth("admin")
  async clear(@Param() params: unknown, @Req() req: AuthedRequest): Promise<OkResponse> {
    const { id } = input("admin.integrations.clear", "params", params);
    this.def(id);
    const r = await this.prisma.integrationCredential.deleteMany({ where: { adapterId: id } });
    if (r.count > 0) {
      await this.audit(req, "integration.clear", id, {});
      await this.changed();
    }
    return { ok: true };
  }

  /** Full API spec for the admin "API docs" page — available in production (the public /docs is dev-only). */
  @Get("openapi.json")
  @Auth("staff")
  spec(): Record<string, unknown> {
    if (!this.openapi) this.openapi = buildOpenApi(this.env.API_URL);
    return this.openapi;
  }
}
