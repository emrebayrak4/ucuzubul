import { type APIRequestContext, expect, test } from "@playwright/test";
import { csrfOf, mutate, newApiContext, searchProducts, withRateLimitRetry } from "../helpers/api";
import { API_URL, authFile, uniqueEmail } from "../helpers/env";

/**
 * API-level security regression checks against the local API. Viewport-independent → desktop project only.
 * Rate-limit exhaustion and oversized uploads are probed manually (see docs/TEST_REPORT.md) so they don't
 * starve the rest of the suite.
 */
test.skip(({ isMobile }) => isMobile, "API-level checks run once (desktop project)");

const ctxs: Record<string, APIRequestContext> = {};
const ctx = (k: string) => ctxs[k]!;

test.beforeAll(async () => {
  ctxs.anon = await newApiContext();
  ctxs.a = await newApiContext(authFile("user-desktop-chromium"));
  ctxs.b = await newApiContext(authFile("user-b"));
  ctxs.user = await newApiContext(authFile("seed-user"));
  ctxs.analyst = await newApiContext(authFile("seed-analyst"));
  ctxs.merchant = await newApiContext(authFile("seed-merchant"));
  ctxs.admin = await newApiContext(authFile("seed-admin"));
});
test.afterAll(async () => {
  await Promise.all(Object.values(ctxs).map((c) => c.dispose()));
});

function noStackLeak(body: string) {
  expect(body).not.toMatch(/\bat\s+\S+\s+\(.*:\d+:\d+\)/); // V8 stack frame
  expect(body).not.toMatch(/node_modules|PrismaClient|\.ts:\d+/);
}

test.describe("auth & session", () => {
  // Register/login share a 10/min/IP bucket per route; on quick re-runs the helper waits out the window.
  test.describe.configure({ timeout: 200_000 });
  test("password policy rejects short passwords", async () => {
    for (const pw of ["short", "123456789"]) {
      const res = await withRateLimitRetry(() => ctx("anon").post("/v1/auth/register", { data: { email: uniqueEmail("pw"), password: pw, name: "x" } }));
      expect(res.status(), pw).toBe(422);
    }
  });

  test("login sets HttpOnly SameSite=Lax session cookie and generic error for bad credentials", async () => {
    const bad = await withRateLimitRetry(() => ctx("anon").post("/v1/auth/login", { data: { email: "user@pricora.local", password: "definitely-wrong-1" } }));
    expect(bad.status()).toBe(401);
    const unknown = await withRateLimitRetry(() => ctx("anon").post("/v1/auth/login", { data: { email: uniqueEmail("nouser"), password: "definitely-wrong-1" } }));
    expect(unknown.status()).toBe(401);
    expect((await unknown.json()).error.message).toBe((await bad.json()).error.message);
  });

  test("register reveals whether an email exists (409) [finding SEC-L2]", async () => {
    const res = await withRateLimitRetry(() => ctx("anon").post("/v1/auth/register", { data: { email: "user@pricora.local", password: "Long-enough-pass-1", name: "x" } }));
    // Documented here so the behaviour change is noticed; account enumeration via signup is a Low finding.
    expect(res.status()).toBe(409);
  });
});

test.describe("CSRF", () => {
  test("cookie-authenticated mutations require a matching x-csrf-token", async () => {
    const [p] = await searchProducts(ctx("a"), "headphones");
    expect(p).toBeTruthy();
    const none = await ctx("a").post("/v1/me/favorites", { data: { productId: p!.id } });
    expect(none.status()).toBe(403);
    expect((await none.json()).error.code).toBe("csrf_invalid");
    const wrong = await ctx("a").post("/v1/me/favorites", { data: { productId: p!.id }, headers: { "x-csrf-token": "x".repeat(32) } });
    expect(wrong.status()).toBe(403);
    const delMe = await ctx("a").delete("/v1/me", { data: {} });
    expect(delMe.status(), "DELETE /v1/me without CSRF").toBe(403);
    const ok = await mutate(ctx("a"), "post", "/v1/me/favorites", { productId: p!.id });
    expect(ok.status()).toBeLessThan(300);
  });

  test("CORS does not reflect untrusted origins", async () => {
    const res = await ctx("anon").get("/v1/health", { headers: { origin: "https://evil.example" } });
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
    const ok = await ctx("anon").get("/v1/health", { headers: { origin: "http://localhost:3100" } });
    expect(ok.headers()["access-control-allow-origin"]).toBe("http://localhost:3100");
    expect(ok.headers()["access-control-allow-credentials"]).toBe("true");
  });
});

test.describe("IDOR on /v1/me/*", () => {
  test("user B cannot read, modify or delete user A's favorites, alerts and lists", async () => {
    const [p1, p2] = await searchProducts(ctx("a"), "tv");
    const fav = await mutate(ctx("a"), "post", "/v1/me/favorites", { productId: p2!.id });
    expect(fav.status()).toBeLessThan(300);
    const favId = (await fav.json()).id as string;
    const alert = await mutate(ctx("a"), "post", "/v1/me/alerts", { productId: p1!.id, type: "below_price", targetPriceCents: 100, channels: ["in_app"] });
    expect(alert.status(), await alert.text()).toBeLessThan(300);
    const alertId = (await alert.json()).id as string;
    const list = await mutate(ctx("a"), "post", "/v1/me/lists", { name: "A private list" });
    expect(list.status(), await list.text()).toBeLessThan(300);
    const listId = (await list.json()).id as string;
    const withItem = await mutate(ctx("a"), "post", `/v1/me/lists/${listId}/items`, { productId: p1!.id, quantity: 1 });
    expect(withItem.status(), await withItem.text()).toBeLessThan(300);
    const itemId = ((await withItem.json()).items as Array<{ id: string }>)[0]!.id;

    // B's own collections don't include A's rows.
    const bFavs = await (await ctx("b").get("/v1/me/favorites")).json();
    expect(JSON.stringify(bFavs)).not.toContain(favId);
    const bAlerts = await (await ctx("b").get("/v1/me/alerts")).json();
    expect(JSON.stringify(bAlerts)).not.toContain(alertId);
    const bLists = await (await ctx("b").get("/v1/me/lists")).json();
    expect(JSON.stringify(bLists)).not.toContain(listId);

    // Direct object access by id.
    expect((await ctx("b").get(`/v1/me/lists/${listId}`)).status()).toBe(404);
    expect((await mutate(ctx("b"), "patch", `/v1/me/lists/${listId}`, { name: "pwned" })).status()).toBe(404);
    expect((await mutate(ctx("b"), "post", `/v1/me/lists/${listId}/items`, { productId: p2!.id, quantity: 1 })).status()).toBe(404);
    expect((await mutate(ctx("b"), "patch", `/v1/me/lists/${listId}/items/${itemId}`, { quantity: 5 })).status()).toBe(404);
    expect((await mutate(ctx("b"), "delete", `/v1/me/lists/${listId}/items/${itemId}`)).status()).toBe(404);
    expect((await mutate(ctx("b"), "patch", `/v1/me/alerts/${alertId}`, { active: false })).status()).toBe(404);
    expect((await mutate(ctx("b"), "delete", `/v1/me/alerts/${alertId}`)).status()).toBe(404);
    expect((await mutate(ctx("b"), "delete", `/v1/me/favorites/${favId}`)).status()).toBe(404);
    expect((await mutate(ctx("b"), "delete", `/v1/me/lists/${listId}`)).status()).toBe(404);

    // A's data is intact.
    const aList = await (await ctx("a").get(`/v1/me/lists/${listId}`)).json();
    expect(aList.name).toBe("A private list");
    expect(aList.items[0].quantity).toBe(1);
    expect(JSON.stringify(await (await ctx("a").get("/v1/me/alerts")).json())).toContain(alertId);
    expect(JSON.stringify(await (await ctx("a").get("/v1/me/favorites?pageSize=60")).json())).toContain(favId);
    // Export only contains own data.
    const exp = JSON.stringify(await (await ctx("b").get("/v1/me/export")).json());
    expect(exp).not.toContain(listId);
    expect(exp).not.toContain(alertId);
  });
});

test.describe("RBAC", () => {
  test("anonymous → 401, consumer → 403 on admin and merchant routes", async () => {
    expect((await ctx("anon").get("/v1/admin/stats")).status()).toBe(401);
    expect((await ctx("anon").get("/v1/me/favorites")).status()).toBe(401);
    for (const path of ["/v1/admin/stats", "/v1/admin/users", "/v1/admin/products", "/v1/admin/audit-logs", "/v1/merchant/profile"]) {
      expect((await ctx("user").get(path)).status(), `user GET ${path}`).toBe(403);
    }
    expect((await mutate(ctx("user"), "post", "/v1/admin/brands", { name: "x", slug: "x-e2e" })).status()).toBe(403);
  });

  test("analyst can read staff routes but cannot write; admin-only routes are closed", async () => {
    expect((await ctx("analyst").get("/v1/admin/stats")).status()).toBe(200);
    expect((await ctx("analyst").get("/v1/admin/products")).status()).toBe(200);
    expect((await ctx("analyst").get("/v1/admin/users")).status()).toBe(403);
    expect((await ctx("analyst").get("/v1/admin/audit-logs")).status()).toBe(403);
    const products = (await (await ctx("analyst").get("/v1/admin/products?pageSize=1")).json()).items as Array<{ id: string; title: string }>;
    const writes: Array<[string, "post" | "patch", string, unknown]> = [
      ["create brand", "post", "/v1/admin/brands", { name: "E2E Analyst Brand", slug: "e2e-analyst-brand" }],
      ["update product", "patch", `/v1/admin/products/${products[0]!.id}`, { title: products[0]!.title }],
      ["create category", "post", "/v1/admin/categories", { name: "E2E Cat", slug: "e2e-analyst-cat" }],
      ["toggle flag", "patch", "/v1/admin/flags/assistant", { enabled: true }],
    ];
    for (const [label, m, url, body] of writes) {
      const res = await mutate(ctx("analyst"), m, url, body);
      expect([403, 422], `analyst ${label} → ${res.status()} ${await res.text()}`).toContain(res.status());
      if (res.status() === 422) {
        // Validation ran before authorization: still not a write, but note it.
        test.info().annotations.push({ type: "note", description: `analyst ${label} returned 422 before 403` });
      }
    }
  });

  test("merchant cannot access admin; staff cannot access merchant routes", async () => {
    expect((await ctx("merchant").get("/v1/admin/stats")).status()).toBe(403);
    expect((await ctx("analyst").get("/v1/merchant/profile")).status()).toBe(403);
    expect((await ctx("merchant").get("/v1/merchant/profile")).status()).toBe(200);
  });
});

test.describe("outbound redirect (/v1/go)", () => {
  test("only redirects to the offer's allow-listed https host, ignores injected targets", async () => {
    const res = await ctx("anon").get("/v1/search?q=laptop");
    const slug = (await res.json()).items[0].slug as string;
    const detail = await (await ctx("anon").get(`/v1/products/${slug}`)).json();
    const offerId = detail.offers[0].id as string;
    const evil = ["https://evil.example", "//evil.example", "https:%2F%2Fevil.example", "javascript:alert(1)"];
    for (const q of ["url", "to", "redirect", "next", "target"]) {
      const r = await ctx("anon").get(`/v1/go/${offerId}?${q}=${encodeURIComponent(evil[0]!)}`, { maxRedirects: 0 });
      expect([302, 422], `?${q}=`).toContain(r.status());
      if (r.status() === 302) expect(new URL(r.headers().location!).hostname).not.toContain("evil");
    }
    for (const e of evil) {
      const r = await ctx("anon").get(`/v1/go/${encodeURIComponent(e)}`, { maxRedirects: 0 });
      expect([400, 404, 422], `go/${e} → ${r.status()}`).toContain(r.status());
      expect(r.headers().location).toBeUndefined();
    }
    const tr = await ctx("anon").get(`/v1/travel/go/hotel/${encodeURIComponent("https://evil.example")}`, { maxRedirects: 0 });
    expect(tr.headers().location).toBeUndefined();
  });
});

test.describe("injection & error hygiene", () => {
  test("SQL-ish and XSS search inputs are handled without 5xx or reflection", async () => {
    const probes = ["' OR 1=1--", "laptop'; DROP TABLE products;--", "%' UNION SELECT password_hash FROM users--", "<script>alert(1)</script>", "\\x00\u0000", "%%%%____", "a".repeat(500)];
    for (const q of probes) {
      const r = await ctx("anon").get(`/v1/search?q=${encodeURIComponent(q)}`);
      expect(r.status(), `search ${JSON.stringify(q).slice(0, 40)}`).toBeLessThan(500);
      const body = await r.text();
      noStackLeak(body);
      expect(body).not.toMatch(/\$argon2|passwordHash|tokenHash/);
    }
    const s = await ctx("anon").get(`/v1/search/suggest?q=${encodeURIComponent("' OR 1=1--")}`);
    expect(s.status()).toBeLessThan(500);
  });

  test("web search page renders an XSS payload as inert text", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    const payload = `"><img src=x onerror=alert(1)><script>alert(2)</script>`;
    const res = await page.goto(`/search?q=${encodeURIComponent(payload)}`);
    expect(res?.status()).toBeLessThan(500);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    expect(await page.locator("img[src='x']").count()).toBe(0);
    expect(dialogs).toBe(0);
  });

  test("malformed input returns the error envelope without stack traces", async () => {
    const bad = await ctx("anon").post("/v1/auth/forgot-password", { headers: { "content-type": "application/json" }, data: "{not json" });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    expect(bad.status()).toBeLessThan(500);
    const body = await bad.text();
    noStackLeak(body);
    expect(JSON.parse(body).error.code).toBeTruthy();
    for (const path of ["/v1/products/%E0%A4%A", "/v1/nope", "/v1/products/x/history?range=forever", "/v1/compare?ids=", "/v1/search?page=-1&pageSize=100000"]) {
      const r = await ctx("anon").get(path);
      expect(r.status(), path).toBeLessThan(500);
      const t = await r.text();
      noStackLeak(t);
    }
    // Oversized JSON body (> 1 MB) is rejected cleanly.
    const big = await ctx("anon").post("/v1/basket/optimize", { data: { items: [], pad: "x".repeat(1_200_000) } });
    expect(big.status()).toBe(413);
    noStackLeak(await big.text());
  });

  test("API sets baseline security headers", async () => {
    const r = await ctx("anon").get("/v1/health");
    const h = r.headers();
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toBeTruthy();
    expect(h["x-frame-options"] ?? h["content-security-policy"]).toBeTruthy();
  });
});

test.describe("merchant feed upload hardening", () => {
  test("formula-injection and XSS payloads are not executed; off-domain URLs rejected", async () => {
    const csv = [
      "sku,title,brand,gtin,mpn,condition,price,list_price,shipping,stock,url,image_url,category",
      'E2E-FX-1,"=HYPERLINK(""https://evil.example"",""click"")",DemoBrand,,FX1,new,10.00,,0,in_stock,https://demo-merchant.example/p/fx1,,Accessories',
      'E2E-FX-2,"<img src=x onerror=alert(1)>",DemoBrand,,FX2,new,10.00,,0,in_stock,https://demo-merchant.example/p/fx2,,Accessories',
      "E2E-FX-3,Off domain,DemoBrand,,FX3,new,10.00,,0,in_stock,https://demo-merchant.example.evil.net/p,,Accessories",
      "E2E-FX-4,Javascript url,DemoBrand,,FX4,new,10.00,,0,in_stock,javascript:alert(1),,Accessories",
      "E2E-FX-5,Http url,DemoBrand,,FX5,new,10.00,,0,in_stock,http://demo-merchant.example/p/fx5,,Accessories",
    ].join("\n");
    const res = await ctx("merchant").post("/v1/merchant/feeds", {
      headers: { "x-csrf-token": await csrfOf(ctx("merchant")) },
      multipart: { name: "e2e-malicious", format: "csv", file: { name: "malicious.csv", mimeType: "text/csv", buffer: Buffer.from(csv) } },
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
    const feed = await res.json();
    expect(feed.rowsTotal).toBe(5);
    const rejectedRows = new Set((feed.errors as Array<{ row: number; field: string }>).filter((e) => e.field === "url").map((e) => e.row));
    expect(rejectedRows.size, JSON.stringify(feed.errors)).toBe(3);
    // Formula/XSS titles are accepted as plain strings (React escapes on render; no CSV export exists yet).
    test.info().annotations.push({ type: "finding", description: `formula/XSS rows accepted=${feed.rowsAccepted} (stored raw; SEC-L3)` });
  });

  test("non-multipart / wrong-field uploads fail cleanly", async () => {
    const headers = { "x-csrf-token": await csrfOf(ctx("merchant")) };
    const noFile = await ctx("merchant").post("/v1/merchant/feeds", { headers, multipart: { name: "x", format: "csv" } });
    expect(noFile.status()).toBe(422);
    const twoFiles = await ctx("merchant").post("/v1/merchant/feeds", {
      headers,
      multipart: { name: "x", format: "csv", other: { name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2") } },
    });
    expect(twoFiles.status()).toBeLessThan(500);
    noStackLeak(await twoFiles.text());
  });
});
