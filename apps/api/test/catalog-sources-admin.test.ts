/**
 * Admin "run now" for catalog-source jobs (Channel3 catalog/refresh, Kroger catalog, Icecat enrich).
 * Queues a BullMQ job; no worker runs here, so any queued job is removed again.
 */
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { Queue } from "bullmq";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CATALOG_SOURCES_QUEUE } from "../src/core";

let app: INestApplication;
let server: Server;

async function tokenFor(email: string): Promise<string> {
  const res = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password: process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026" }).expect(200);
  return res.body.sessionToken as string;
}

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
});

describe("admin catalog-source run", () => {
  it("queues a job for an admin and reports what happened", async () => {
    const admin = await tokenFor("admin@pricora.local");
    const res = await request(server).post("/v1/admin/catalog-sources/kroger-catalog/run").set("authorization", `Bearer ${admin}`).expect(200);
    expect(endpoints["admin.catalogSources.run"].response.safeParse(res.body).success).toBe(true);
    const body = res.body as { queued: boolean; jobId: string | null; message: string };
    if (body.queued) {
      expect(body.jobId).toBeTruthy();
      const q = new Queue(CATALOG_SOURCES_QUEUE, { connection: { url: process.env["REDIS_URL"] ?? "redis://localhost:6380" } });
      const job = await q.getJob(body.jobId as string);
      expect(job?.name).toBe("kroger-catalog");
      await job?.remove();
      await q.close();
    } else {
      expect(body.message).toMatch(/Pending configuration/);
    }
  });

  it("is admin-only", async () => {
    const editor = await tokenFor("editor@pricora.local");
    await request(server).post("/v1/admin/catalog-sources/channel3-catalog/run").set("authorization", `Bearer ${editor}`).expect(403);
    await request(server).post("/v1/admin/catalog-sources/channel3-catalog/run").expect(401);
  });

  it("rejects an unknown job", async () => {
    const admin = await tokenFor("admin@pricora.local");
    const res = await request(server).post("/v1/admin/catalog-sources/drop-tables/run").set("authorization", `Bearer ${admin}`);
    expect([400, 422]).toContain(res.status);
  });
});
