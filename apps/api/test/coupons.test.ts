/**
 * Coupon tracking + browser-extension integration tests (docker DB, demo coupons via `pnpm -C packages/database seed:coupons`).
 */
import type { INestApplication } from "@nestjs/common";
import { endpoints } from "@pricora/contracts";
import { getPrisma } from "@pricora/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let app: INestApplication;
const prisma = getPrisma();
type Server = Parameters<typeof request>[0];
let server: Server;
const pw = process.env["SEED_ADMIN_PASSWORD"] || "PricoraDev!2026";
const tokenFor = async (email: string) =>
  (await request(server).post("/v1/auth/login").set("x-pricora-client", "native").send({ email, password: pw }).expect(200)).body.sessionToken as string;

beforeAll(async () => {
  app = await createApp({ logger: false });
  await app.init();
  server = app.getHttpServer() as Server;
});

afterAll(async () => {
  await app.close();
});

describe("coupons", () => {
  it("lists live demo coupons with retailer info and DEMO-prefixed codes", async () => {
    const res = await request(server).get("/v1/coupons").query({ pageSize: 60 }).expect(200);
    expect(endpoints["coupons.list"].response.safeParse(res.body).success).toBe(true);
    const items = res.body.items as { code: string | null; source: string; status: string; retailer: { slug: string } }[];
    expect(items.length).toBeGreaterThan(5);
    for (const c of items.filter((x) => x.source === "demo")) if (c.code) expect(c.code.startsWith("DEMO")).toBe(true);
    expect(items.some((c) => c.status === "expired")).toBe(false);
    const bby = await request(server).get("/v1/retailers/best-buy/coupons").expect(200);
    expect((bby.body.items as { retailer: { slug: string } }[]).every((c) => c.retailer.slug === "best-buy")).toBe(true);
  });

  it("product detail includes applicable coupons only", async () => {
    const p = await prisma.product.findFirstOrThrow({ where: { slug: { startsWith: "sony-wh-1000xm5" } } });
    const res = await request(server).get(`/v1/products/${p.slug}`).expect(200);
    const coupons = res.body.coupons as { scope: { categorySlug: string | null }; retailer: { slug: string } }[];
    const sellers = new Set((res.body.offers as { retailer: { slug: string } }[]).map((o) => o.retailer.slug));
    for (const c of coupons) {
      expect(sellers.has(c.retailer.slug)).toBe(true);
      expect([null, "headphones-audio", "electronics"]).toContain(c.scope.categorySlug);
    }
    expect(coupons.some((c) => c.retailer.slug === "amazon")).toBe(true);
  });

  it("records usage results with dedupe, computes stats from events, and auto-downgrades after failures", async () => {
    const r = await prisma.retailer.findUniqueOrThrow({ where: { slug: "walmart" } });
    const c = await prisma.coupon.create({
      data: { retailerId: r.id, code: `DEMO-T${Date.now()}`, title: "Demo test coupon", discountType: "percent", discountValue: 500, source: "demo", status: "active" },
    });
    try {
      const ok = await request(server)
        .post(`/v1/coupons/${c.id}/result`)
        .send({ worked: true, savingsCents: 1200, orderTotalCents: 8000, source: "extension", deviceId: "device-aaaaaaaa" })
        .expect(200);
      expect(ok.body.recorded).toBe(true);
      expect(ok.body.coupon.stats.avgSavingsCents).toBe(1200);
      const dup = await request(server).post(`/v1/coupons/${c.id}/result`).send({ worked: true, deviceId: "device-aaaaaaaa" }).expect(200);
      expect(dup.body.recorded).toBe(false);
      let last: { status: string } = { status: "active" };
      for (let i = 0; i < 3; i++) {
        const f = await request(server).post(`/v1/coupons/${c.id}/result`).send({ worked: false, deviceId: `device-fail-${i}xx` }).expect(200);
        last = f.body.coupon as { status: string };
      }
      expect(last.status).toBe("unverified");
      const stats = await request(server).get("/v1/retailers/walmart/coupon-stats").expect(200);
      expect(endpoints["coupons.retailerStats"].response.safeParse(stats.body).success).toBe(true);
      expect(stats.body.reports30d.worked).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.coupon.delete({ where: { id: c.id } });
    }
  });

  it("redirects through /go with an AffiliateClick", async () => {
    const c = await prisma.coupon.findFirstOrThrow({ where: { source: "demo", status: "active" }, include: { retailer: true } });
    const res = await request(server).get(`/v1/coupons/${c.id}/go`).expect(302);
    const host = new URL(res.headers["location"] as string).hostname;
    expect(host === c.retailer.domain || host.endsWith(`.${c.retailer.domain}`)).toBe(true);
    expect(await prisma.affiliateClick.count({ where: { couponId: c.id, kind: "coupon" } })).toBeGreaterThan(0);
  });

  it("notifies followers when an admin activates a coupon; merchants submit for approval", async () => {
    const user = await tokenFor("user@pricora.local");
    await request(server).post("/v1/me/coupon-follows").set("authorization", `Bearer ${user}`).send({ retailerSlug: "demo-merchant-store" }).expect(404);
    await request(server).post("/v1/me/coupon-follows").set("authorization", `Bearer ${user}`).send({ retailerSlug: "costco" }).expect(201);
    const costco = await prisma.retailer.findUniqueOrThrow({ where: { slug: "costco" } });
    // Earlier runs may have started the 6 h per-store notification cooldown.
    const seedUser = await prisma.user.findUniqueOrThrow({ where: { email: "user@pricora.local" } });
    await prisma.notification.deleteMany({ where: { userId: seedUser.id, type: "coupon.followed_store" } });
    const editor = await tokenFor("editor@pricora.local");
    const created = await request(server)
      .post("/v1/admin/coupons")
      .set("authorization", `Bearer ${editor}`)
      .send({ retailerId: costco.id, code: `DEMO-CST${Date.now() % 100000}`, title: "Demo Costco test coupon", discountType: "amount", discountValue: 1000, status: "active" })
      .expect(201);
    const createdId = created.body.id as string;
    try {
      const u = await prisma.user.findUniqueOrThrow({ where: { email: "user@pricora.local" } });
      const n = await prisma.notification.findFirst({ where: { userId: u.id, dedupeKey: `coupon:${createdId}:user:${u.id}` } });
      expect(n).toBeTruthy();
      const analyst = await tokenFor("analyst@pricora.local");
      await request(server).post("/v1/admin/coupons").set("authorization", `Bearer ${analyst}`).send({ retailerId: costco.id, title: "nope nope", discountType: "other" }).expect(403);
      const merchant = await tokenFor("merchant@pricora.local");
      const m = await request(server)
        .post("/v1/merchant/coupons")
        .set("authorization", `Bearer ${merchant}`)
        .send({ code: "DEMO-MERCH1", title: "Demo merchant coupon", discountType: "percent", discountValue: 1000 })
        .expect(201);
      expect(m.body.status).toBe("pending_approval");
      await request(server).get(`/v1/coupons/${m.body.id as string}`).expect(404);
      await prisma.coupon.delete({ where: { id: m.body.id as string } });
    } finally {
      await prisma.coupon.delete({ where: { id: createdId } });
      await request(server).delete("/v1/me/coupon-follows/costco").set("authorization", `Bearer ${user}`).expect(200);
    }
  });

  it("serves extension config (enabled only), coupons by host, and refuses enabling without selectors", async () => {
    const cfg = await request(server).get("/v1/extension/config").expect(200);
    expect(endpoints["extension.config"].response.safeParse(cfg.body).success).toBe(true);
    expect(cfg.headers["cache-control"]).toMatch(/max-age=300/);
    expect((cfg.body.configs as unknown[]).length).toBe(await prisma.retailerCheckoutConfig.count({ where: { enabled: true } }));
    const ex = await request(server).get("/v1/extension/coupons").query({ host: "www.amazon.com" }).expect(200);
    expect(ex.body.retailer.slug).toBe("amazon");
    expect((ex.body.coupons as { code: string | null }[]).every((c) => Boolean(c.code))).toBe(true);
    const none = await request(server).get("/v1/extension/product").query({ url: "https://www.amazon.com/dp/B0EXAMPLE1" }).expect(200);
    expect(none.body.status).toBe("not_found");
    const editor = await tokenFor("editor@pricora.local");
    const amazon = await prisma.retailer.findUniqueOrThrow({ where: { slug: "amazon" } });
    await request(server).put(`/v1/admin/checkout-configs/${amazon.id}`).set("authorization", `Bearer ${editor}`).send({ enabled: true }).expect(422);
  });

  it("expires coupons past expiresAt; feed sources stay pending without keys", async () => {
    const { expireCoupons, pullCouponFeeds } = await import("../src/core/coupons");
    const r = await prisma.retailer.findUniqueOrThrow({ where: { slug: "target" } });
    const c = await prisma.coupon.create({
      data: { retailerId: r.id, code: `DEMO-EXP${Date.now() % 100000}`, title: "Demo expiring", discountType: "other", source: "demo", status: "active", expiresAt: new Date(Date.now() - 1000) },
    });
    try {
      expect(await expireCoupons(prisma)).toBeGreaterThanOrEqual(1);
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("expired");
      const feeds = await pullCouponFeeds(prisma, {});
      // Networks without credentials are pending; sources with no coupon API (eBay, Amazon) say so honestly.
      expect(feeds.every((f) => (f.status === "pending_configuration" || f.status === "unsupported") && f.created === 0)).toBe(true);
      expect(feeds.filter((f) => f.status === "pending_configuration").map((f) => f.id)).toEqual(["cj", "impact", "rakuten", "awin"]);
    } finally {
      await prisma.coupon.delete({ where: { id: c.id } });
    }
  });
});
