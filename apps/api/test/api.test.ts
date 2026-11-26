/**
 * Integration tests against the docker Postgres (seeded via `pnpm db:seed`), Redis and Meilisearch.
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import type { Meilisearch } from "meilisearch";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { CatalogService } from "../src/services/catalog.service";
import { SearchService } from "../src/services/search.service";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;

function cookieValue(setCookie: string[] | string | undefined, name: string): string | undefined {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  return hit?.split(";")[0]?.split("=")[1];
}

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
  // Make sure the search index matches the seeded DB.
  await app.get(SearchService).ensureIndex(true);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test.pricora.local" } } });
  await app.close();
});

describe("health", () => {
  it("reports db/redis/search and adapters", async () => {
    const res = await request(server).get("/v1/health").expect(200);
    expect(endpoints["health.get"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.checks.db.status).toBe("up");
  });
});

describe("auth flow", () => {
  const email = `flow-${Date.now()}@test.pricora.local`;
  const password = "correct-horse-battery-staple";

  it("register → me → CSRF enforcement → logout → login", async () => {
    const agent = request.agent(server);
    const me0 = await agent.get("/v1/auth/me").expect(200);
    expect(me0.body.user).toBeNull();
    const csrf0: string = me0.body.csrfToken;
    expect(csrf0.length).toBeGreaterThan(20);

    const reg = await agent.post("/v1/auth/register").set("x-csrf-token", csrf0).send({ email, password, name: "Flow Test" }).expect(201);
    expect(endpoints["auth.register"].response.safeParse(reg.body).success).toBe(true);
    const sessionCookie = cookieValue(reg.headers["set-cookie"], "pc_session");
    expect(sessionCookie).toBeTruthy();
    expect(String(reg.headers["set-cookie"])).toMatch(/pc_session=[^;]+;.*HttpOnly/i);
    const csrf: string = reg.body.csrfToken;

    const me = await agent.get("/v1/auth/me").expect(200);
    expect(me.body.user.email).toBe(email);

    // Session hash only — raw token never stored.
    const sessions = await prisma.userSession.findMany({ where: { user: { email } } });
    expect(sessions.length).toBe(1);
    expect(sessions[0]?.tokenHash).not.toBe(sessionCookie);

    await agent.post("/v1/auth/logout").expect(403); // missing CSRF header
    await agent.post("/v1/auth/logout").set("x-csrf-token", "wrong-token-wrong-token-wrong").expect(403);
    await agent.post("/v1/auth/logout").set("x-csrf-token", csrf).expect(200);
    const after = await agent.get("/v1/auth/me").expect(200);
    expect(after.body.user).toBeNull();

    await request(server).post("/v1/auth/login").send({ email, password: "wrong-password-123" }).expect(401);
    const login = await request(server).post("/v1/auth/login").send({ email, password }).expect(200);
    expect(login.body.user.email).toBe(email);
  });

  it("rejects duplicate registration and invalid input", async () => {
    await request(server).post("/v1/auth/register").send({ email, password, name: "Dup" }).expect(409);
    const bad = await request(server).post("/v1/auth/register").send({ email: "nope", password: "short", name: "" }).expect(422);
    expect(bad.body.error.code).toBe("validation_failed");
  });

  it("supports bearer sessions for native clients (no cookies, no CSRF)", async () => {
    const web = await request(server).post("/v1/auth/login").send({ email, password }).expect(200);
    expect(web.body.sessionToken).toBeUndefined();
    const native = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password }).expect(200);
    const token: string = native.body.sessionToken;
    expect(token.length).toBeGreaterThan(20);
    const product = await prisma.product.findFirstOrThrow({ where: { status: "active" } });
    await request(server).post("/v1/me/favorites").set("authorization", `Bearer ${token}`).send({ productId: product.id }).expect(201);
    const favs = await request(server).get("/v1/me/favorites").set("authorization", `Bearer ${token}`).expect(200);
    expect(favs.body.total).toBe(1);
    await request(server).get("/v1/me/favorites").set("authorization", "Bearer not-a-real-token").expect(401);
  });

  it("enforces RBAC on admin routes", async () => {
    const res = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password }).expect(200);
    await request(server).get("/v1/admin/stats").set("authorization", `Bearer ${res.body.sessionToken as string}`).expect(403);
    const admin = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email: "admin@pricora.local", password: process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026" }).expect(200);
    const stats = await request(server).get("/v1/admin/stats").set("authorization", `Bearer ${admin.body.sessionToken as string}`).expect(200);
    expect(endpoints["admin.stats"].response.safeParse(stats.body).success).toBe(true);
    expect(stats.body.queues.length).toBe(4);
  });

  it("protects user routes", async () => {
    const res = await request(server).get("/v1/me/favorites").expect(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});

describe("search", () => {
  it("parses natural language price caps and categories", async () => {
    const res = await request(server).get("/v1/search").query({ q: "best laptop under $800" }).expect(200);
    expect(endpoints["search.search"].response.safeParse(res.body).success).toBe(true);
    expect(res.body.parsed.maxPriceCents).toBe(80_000);
    expect(res.body.parsed.category?.slug).toBe("laptops");
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items as { lowestPriceCents: number }[]) expect(item.lowestPriceCents).toBeLessThanOrEqual(80_000);
    expect(res.body.facets.brands.length).toBeGreaterThan(0);
  });

  it("filters by brand and sorts by price", async () => {
    const res = await request(server).get("/v1/search").query({ q: "apple", brand: "apple", sort: "price_asc", pageSize: 60 }).expect(200);
    const prices = (res.body.items as { lowestPriceCents: number; brand: { slug: string } }[]).map((i) => {
      expect(i.brand.slug).toBe("apple");
      return i.lowestPriceCents;
    });
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("falls back to Postgres (degraded) when Meilisearch is unreachable", async () => {
    const broken = {
      index: () => ({
        getStats: () => Promise.reject(new Error("connect ECONNREFUSED")),
        search: () => Promise.reject(new Error("connect ECONNREFUSED")),
      }),
    } as unknown as Meilisearch;
    const svc = new SearchService(prisma, broken, app.get(CatalogService));
    const res = await svc.search({ q: "headphones", sort: "relevance", page: 1, pageSize: 24 });
    expect(res.degraded).toBe(true);
    expect(res.items.length).toBeGreaterThan(0);
  });
});

describe("product detail", () => {
  it("returns offers with estimated totals, stats, deal score and fake-discount check", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: { startsWith: "sony-wh-1000xm5" } } });
    const withZip = await request(server).get(`/v1/products/${product.slug}`).query({ zip: "10001" }).expect(200);
    expect(endpoints["catalog.product"].response.safeParse(withZip.body).success).toBe(true);
    const body = withZip.body as {
      offers: { priceCents: number; shipping: { costCents: number | null }; tax: { amountCents: number | null; status: string }; estimatedTotalCents: number; source: string }[];
      priceStats: { sampleSize: number; currentLowestCents: number };
      dealScore: { score: number } | null;
      hasDemoData: boolean;
    };
    expect(body.offers.length).toBeGreaterThanOrEqual(2);
    for (const o of body.offers) {
      expect(o.tax.status).toBe("estimated");
      expect(o.tax.amountCents).not.toBeNull();
      expect(o.estimatedTotalCents).toBe(o.priceCents + (o.shipping.costCents ?? 0) + (o.tax.amountCents ?? 0));
      expect(Number.isInteger(o.estimatedTotalCents)).toBe(true);
      expect(o.source).toBe("demo");
    }
    expect(body.hasDemoData).toBe(true);
    expect(body.priceStats.sampleSize).toBeGreaterThan(0);
    expect(body.priceStats.currentLowestCents).toBe(Math.min(...body.offers.map((o) => o.priceCents)));

    const noZip = await request(server).get(`/v1/products/${product.slug}`).expect(200);
    for (const o of noZip.body.offers as typeof body.offers) {
      expect(o.tax.status).toBe("unknown_set_zip");
      expect(o.estimatedTotalCents).toBe(o.priceCents + (o.shipping.costCents ?? 0));
    }
  });

  it("returns only real history points", async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: { startsWith: "sony-wh-1000xm5" } } });
    const res = await request(server).get(`/v1/products/${product.slug}/history`).query({ range: "30d" }).expect(200);
    const stored = await prisma.priceHistory.count({ where: { productId: product.id, observedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
    const returned = (res.body.series as { points: unknown[] }[]).reduce((n, s) => n + s.points.length, 0);
    expect(returned).toBe(stored);
  });

  it("404s unknown products with the error envelope", async () => {
    const res = await request(server).get("/v1/products/does-not-exist").expect(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Product not found" } });
  });
});

describe("outbound redirect", () => {
  it("logs an AffiliateClick and 302s to an allow-listed host", async () => {
    const offer = await prisma.offer.findFirstOrThrow({ where: { isActive: true }, include: { retailer: true } });
    const before = await prisma.affiliateClick.count({ where: { offerId: offer.id } });
    const res = await request(server).get(`/v1/go/${offer.id}`).query({ placement: "test" }).expect(302);
    const location = new URL(res.headers["location"] as string);
    expect(location.protocol).toBe("https:");
    expect([offer.retailer.domain, `www.${offer.retailer.domain}`, ...offer.retailer.allowedRedirectHosts]).toContain(location.hostname);
    const after = await prisma.affiliateClick.count({ where: { offerId: offer.id } });
    expect(after).toBe(before + 1);
    const click = await prisma.affiliateClick.findFirstOrThrow({ where: { offerId: offer.id }, orderBy: { createdAt: "desc" } });
    expect(click.placement).toBe("test");
    expect(click.ipHash).not.toContain("127.0.0.1");
  });

  it("refuses hosts outside the allow-list (open-redirect protection)", async () => {
    const base = await prisma.offer.findFirstOrThrow({ where: { isActive: true } });
    const evil = await prisma.offer.create({
      data: {
        productId: base.productId,
        retailerId: base.retailerId,
        retailerSku: `TEST-EVIL-${Date.now()}`,
        title: "evil",
        url: "https://evil.example/phish",
        priceCents: 100,
        source: "demo",
      },
    });
    try {
      const res = await request(server).get(`/v1/go/${evil.id}`).expect(400);
      expect(res.body.error.code).toBe("bad_request");
      expect(await prisma.affiliateClick.count({ where: { offerId: evil.id } })).toBe(0);
    } finally {
      await prisma.offer.delete({ where: { id: evil.id } });
    }
  });
});

describe("alert evaluation (worker core)", () => {
  it("creates one notification per triggered alert and dedupes repeats", async () => {
    const { processPriceEvent } = await import("../src/core/alerts");
    const offer = await prisma.offer.findFirstOrThrow({ where: { isActive: true, source: "demo" } });
    const user = await prisma.user.create({ data: { email: `alerts-${Date.now()}@test.pricora.local`, name: "Alerts" } });
    const alert = await prisma.priceAlert.create({
      data: { userId: user.id, productId: offer.productId, type: "below_price", targetPriceCents: offer.priceCents + 1 },
    });
    const job = {
      offerId: offer.id,
      previousPriceCents: offer.priceCents + 5000,
      newPriceCents: offer.priceCents,
      previousInStock: true,
      newInStock: true,
      occurredAt: new Date().toISOString(),
    };
    const first = await processPriceEvent(prisma, job);
    expect(first.created).toBe(1);
    const second = await processPriceEvent(prisma, job);
    expect(second.created).toBe(0);
    const notes = await prisma.notification.findMany({ where: { alertId: alert.id } });
    expect(notes.length).toBe(1);
    expect(notes[0]?.url).toMatch(/^\/products\//);
  });
});

describe("security hardening", () => {
  it("rate-limit identity: trusted SSR server forwards client IP; spoofed headers are ignored; sessions key on user", async () => {
    const { AppThrottlerGuard } = await import("../src/common/throttle");
    const { loadEnv } = await import("../src/common/env");
    const env = loadEnv();
    expect(env.INTERNAL_API_KEY, "set INTERNAL_API_KEY in .env").toBeTruthy();
    const { Reflector } = await import("@nestjs/core");
    const { SessionService } = await import("../src/common/auth");
    const storage = { increment: () => Promise.resolve({ totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }) };
    const guard = new AppThrottlerGuard({ throttlers: [] }, storage, new Reflector(), env, app.get(SessionService)) as unknown as {
      getTracker(r: unknown): Promise<string>;
    };
    const base = { ip: "10.0.0.5", socket: { remoteAddress: "10.0.0.5" }, cookies: {} };
    const t1 = await guard.getTracker({ ...base, headers: { "x-pricora-client-ip": "203.0.113.7" } });
    expect(t1).toBe("ip:10.0.0.5"); // no key → forwarded IP ignored
    const t2 = await guard.getTracker({ ...base, headers: { "x-internal-api-key": "x".repeat(64), "x-pricora-client-ip": "203.0.113.7" } });
    expect(t2).toBe("ip:10.0.0.5"); // wrong key
    const t3 = await guard.getTracker({ ...base, headers: { "x-internal-api-key": env.INTERNAL_API_KEY, "x-pricora-client-ip": "203.0.113.7" } });
    expect(t3).toBe("ip:203.0.113.7");
    const t4 = await guard.getTracker({ ...base, headers: { "x-forwarded-for": "198.51.100.1" } });
    expect(t4).toBe("ip:10.0.0.5"); // XFF not trusted without TRUST_PROXY
    const login = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email: "user@pricora.local", password: process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026" }).expect(200);
    const t5 = await guard.getTracker({ ...base, headers: { authorization: `Bearer ${login.body.sessionToken as string}` } });
    expect(t5).toBe(`user:${login.body.user.id as string}`);
    const t6 = await guard.getTracker({ ...base, headers: { authorization: "Bearer forged-token-forged-token" } });
    expect(t6).toBe("ip:10.0.0.5");
  });

  it("locks an account after repeated failed logins, independent of IP", async () => {
    const email = `lock-${Date.now()}@test.pricora.local`;
    const password = "correct-horse-battery-staple";
    await request(server).post("/v1/auth/register").send({ email, password, name: "Lock" }).expect(201);
    for (let i = 0; i < 6; i++) await request(server).post("/v1/auth/login").send({ email, password: "wrong-password-1" }).expect(401);
    const locked = await request(server).post("/v1/auth/login").set("x-forwarded-for", "203.0.113.99").send({ email, password }).expect(429);
    expect(locked.body.error.code).toBe("rate_limited");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    const { LoginLockoutService } = await import("../src/common/lockout");
    await app.get(LoginLockoutService).clear(email);
    await request(server).post("/v1/auth/login").send({ email, password }).expect(200);
  });

  it("register does not reveal account existence in its message", async () => {
    const res = await request(server).post("/v1/auth/register").send({ email: "admin@pricora.local", password: "some-long-password", name: "X" }).expect(409);
    expect(res.body.error.message).not.toMatch(/already exists/i);
  });

  it("registers and removes push devices", async () => {
    const login = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email: "user@pricora.local", password: process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026" }).expect(200);
    const auth = { authorization: `Bearer ${login.body.sessionToken as string}` };
    const token = `ExponentPushToken[test${Date.now()}]`;
    const res = await request(server).post("/v1/me/devices").set(auth).send({ token, platform: "ios" }).expect(201);
    expect(endpoints["me.devices.register"].response.safeParse(res.body).success).toBe(true);
    await request(server).post("/v1/me/devices").set(auth).send({ token: "not-a-token", platform: "ios" }).expect(422);
    await request(server).delete(`/v1/me/devices/${encodeURIComponent(token)}`).set(auth).expect(200);
    expect(await prisma.pushDevice.count({ where: { token } })).toBe(0);
  });

  it("rejects non-text feed uploads and processes small feeds inline", async () => {
    const login = await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email: "merchant@pricora.local", password: process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026" }).expect(200);
    const auth = { authorization: `Bearer ${login.body.sessionToken as string}` };
    const bad = await request(server).post("/v1/merchant/feeds").set(auth).field("name", "evil").field("format", "csv").attach("file", Buffer.from("MZ\0\0binary"), { filename: "evil.exe", contentType: "application/x-msdownload" }).expect(415);
    expect(bad.body.error.code).toBe("unsupported_media_type");
    const csv = "sku,title,price,condition,availability,link\nT-1,=HYPERLINK(1),9.99,new,in stock,https://www.demo-merchant.example/p/t1\n";
    const ok = await request(server).post("/v1/merchant/feeds").set(auth).field("name", "tiny").field("format", "csv").attach("file", Buffer.from(csv), { filename: "tiny.csv", contentType: "text/csv" }).expect(201);
    expect(ok.body.status).toBe("completed");
    expect((ok.body.errors as { field: string }[]).some((e) => e.field === "title")).toBe(true);
  });
});

describe("admin-managed integrations", () => {
  const pw = process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026";
  const tokenFor = async (email: string) =>
    (await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password: pw }).expect(200)).body.sessionToken as string;

  it("encrypts with AES-256-GCM (round-trip, tamper detection) and masks secrets", async () => {
    const { encryptJson, decryptJson, maskSecret } = await import("../src/core/crypto");
    const { randomBytes } = await import("node:crypto");
    const key = randomBytes(32);
    const payload = encryptJson({ DUFFEL_ACCESS_TOKEN: "duffel_test_abcdef123456" }, key);
    expect(payload.startsWith("v1:")).toBe(true);
    expect(payload).not.toContain("duffel_test");
    expect(decryptJson(payload, key)).toEqual({ DUFFEL_ACCESS_TOKEN: "duffel_test_abcdef123456" });
    const raw = Buffer.from(payload.slice(3), "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    expect(() => decryptJson("v1:" + raw.toString("base64"), key)).toThrow();
    expect(() => decryptJson(payload, randomBytes(32))).toThrow();
    expect(maskSecret("duffel_test_abcdef123456")).toBe("••••3456");
    expect(maskSecret("short")).toBe("••••");
  });

  it("is ADMIN-only; the admin OpenAPI spec is available to staff", async () => {
    const editor = await tokenFor("editor@pricora.local");
    await request(server).get("/v1/admin/integrations").set("authorization", `Bearer ${editor}`).expect(403);
    const spec = await request(server).get("/v1/admin/openapi.json").set("authorization", `Bearer ${editor}`).expect(200);
    expect(spec.body.openapi).toBe("3.1.0");
    await request(server).get("/v1/admin/openapi.json").expect(401);
    const user = await tokenFor("user@pricora.local");
    await request(server).get("/v1/admin/openapi.json").set("authorization", `Bearer ${user}`).expect(403);
  });

  it("stores credentials encrypted, never returns them, and DB values override env", async () => {
    const admin = await tokenFor("admin@pricora.local");
    const auth = { authorization: `Bearer ${admin}` };
    const secret = "duffel_test_SECRET_value_9876";
    await request(server).delete("/v1/admin/integrations/duffel").set(auth).expect(200);
    try {
      const before = await request(server).get("/v1/health").expect(200);
      expect((before.body.adapters as { id: string; status: string }[]).find((a) => a.id === "duffel")?.status).toBe("pending_configuration");

      const put = await request(server).put("/v1/admin/integrations/duffel").set(auth).send({ fields: { DUFFEL_ACCESS_TOKEN: secret } }).expect(200);
      expect(endpoints["admin.integrations.update"].response.safeParse(put.body).success).toBe(true);
      expect(JSON.stringify(put.body)).not.toContain(secret);
      const f = (put.body.fields as { key: string; masked: string; isSet: boolean; source: string }[]).find((x) => x.key === "DUFFEL_ACCESS_TOKEN");
      expect(f).toMatchObject({ isSet: true, source: "db", masked: "••••9876" });

      const row = await prisma.integrationCredential.findUniqueOrThrow({ where: { adapterId: "duffel" } });
      expect(row.ciphertext).not.toContain(secret);

      // DB overrides env → adapter now reports live (no network call in /health).
      const after = await request(server).get("/v1/health").expect(200);
      expect((after.body.adapters as { id: string; status: string }[]).find((a) => a.id === "duffel")?.status).toBe("live");

      // Blank keeps, unknown field rejected, disable blanks the integration.
      await request(server).put("/v1/admin/integrations/duffel").set(auth).send({ fields: { DUFFEL_ACCESS_TOKEN: "" } }).expect(200);
      await request(server).put("/v1/admin/integrations/duffel").set(auth).send({ fields: { NOT_A_FIELD: "x" } }).expect(422);
      const disabled = await request(server).put("/v1/admin/integrations/duffel").set(auth).send({ fields: {}, enabled: false }).expect(200);
      expect(disabled.body.status).toBe("disabled");

      // Audit log has field names, never values.
      const logs = await prisma.auditLog.findMany({ where: { entityType: "IntegrationCredential", entityId: "duffel" }, orderBy: { createdAt: "desc" }, take: 5 });
      expect(JSON.stringify(logs)).not.toContain(secret);
      expect(JSON.stringify(logs)).toContain("DUFFEL_ACCESS_TOKEN");

      // Test endpoint never fabricates success: disabled → pending; missing → pending.
      const t = await request(server).post("/v1/admin/integrations/duffel/test").set(auth).expect(200);
      expect(t.body.status).toBe("pending_configuration");
      const t2 = await request(server).post("/v1/admin/integrations/anthropic/test").set(auth).expect(200);
      if (!process.env["ANTHROPIC_API_KEY"]) expect(t2.body.status).toBe("pending_configuration");

      const list = await request(server).get("/v1/admin/integrations").set(auth).expect(200);
      expect(endpoints["admin.integrations.list"].response.safeParse(list.body).success).toBe(true);
      const groups = new Set((list.body.items as { group: string }[]).map((i) => i.group));
      for (const g of ["retail", "affiliate", "travel_flight", "travel_hotel", "auth", "payments", "email", "ai", "monitoring"]) expect(groups.has(g)).toBe(true);
    } finally {
      await request(server).delete("/v1/admin/integrations/duffel").set(auth).expect(200);
    }
    const final = await request(server).get("/v1/health").expect(200);
    expect((final.body.adapters as { id: string; status: string }[]).find((a) => a.id === "duffel")?.status).toBe("pending_configuration");
  });
});

describe("logos", () => {
  const pw = process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026";
  const tokenFor = async (email: string) =>
    (await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password: pw }).expect(200)).body.sessionToken as string;
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  it("sanitises SVGs and detects types by content", async () => {
    const { sanitizeSvg, detectLogoType, validateLogo } = await import("../src/core/images");
    const dirty = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><rect width="1" height="1"/></a><foreignObject><div/></foreignObject><use href="https://evil.example/x.svg#a"/></svg>';
    const clean = sanitizeSvg(dirty) ?? "";
    expect(clean).not.toMatch(/script|onload|javascript:|foreignObject|evil\.example/i);
    expect(clean).toContain("<rect");
    expect(detectLogoType(PNG)).toBe("png");
    expect("error" in validateLogo(Buffer.from("GIF89a...."))).toBe(true);
    expect("error" in validateLogo(Buffer.alloc(600 * 1024, 1))).toBe(true);
  });

  it("editors upload/remove logos (audit-logged); analysts cannot; files are served safely", async () => {
    const retailer = await prisma.retailer.findUniqueOrThrow({ where: { slug: "demo-merchant-store" } });
    const analyst = await tokenFor("analyst@pricora.local");
    await request(server).post(`/v1/admin/retailers/${retailer.id}/logo`).set("authorization", `Bearer ${analyst}`).attach("file", PNG, { filename: "l.png", contentType: "image/png" }).expect(403);
    const editor = await tokenFor("editor@pricora.local");
    const auth = { authorization: `Bearer ${editor}` };
    await request(server).post(`/v1/admin/retailers/${retailer.id}/logo`).set(auth).attach("file", Buffer.from("not an image"), { filename: "x.png", contentType: "image/png" }).expect(415);
    const up = await request(server).post(`/v1/admin/retailers/${retailer.id}/logo`).set(auth).attach("file", PNG, { filename: "l.png", contentType: "image/png" }).expect(201);
    expect(up.body.logoSource).toBe("admin_upload");
    const url = new URL(up.body.logoUrl as string);
    const file = await request(server).get(url.pathname).expect(200);
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["cache-control"]).toMatch(/max-age=31536000/);
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    await request(server).get("/static/logos/retailers/../../../package.json").expect(404);
    const log = await prisma.auditLog.findFirst({ where: { action: "retailer.logo.upload", entityId: retailer.id } });
    expect(log).toBeTruthy();
    await request(server).delete(`/v1/admin/retailers/${retailer.id}/logo`).set(auth).expect(200);
    await request(server).get(url.pathname).expect(404);
    expect((await prisma.retailer.findUniqueOrThrow({ where: { id: retailer.id } })).logoUrl).toBeNull();
  });
});
