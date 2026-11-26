import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { ADMIN_URL, SEED, SEED_PASSWORD, authFile } from "../helpers/env";

const FIXTURE = fileURLToPath(new URL("../fixtures/merchant-feed-small.csv", import.meta.url));

test.describe("admin portal: login + role gating", () => {
  test.use({ baseURL: ADMIN_URL });

  test("admin logs in through the form and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.getByLabel("Email").fill(SEED.admin);
    await page.locator("#password").fill(SEED_PASSWORD);
    const resP = page.waitForResponse((r) => r.url().includes("/v1/auth/login"));
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    expect((await resP).status()).toBe(200);
    await page.waitForURL(/\/admin(\/|$|\?)/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test("anonymous visitor is sent to login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/);
  });

  test.describe("merchant", () => {
    test.use({ storageState: authFile("seed-merchant") });
    test("is kept out of /admin and can use /merchant", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).not.toHaveURL(/\/admin(\/|$|\?)/);
      await expect(page).toHaveURL(/\/(forbidden|merchant)/);
      await page.goto("/merchant");
      await expect(page).toHaveURL(/\/merchant/);
      await expect(page.getByRole("heading", { name: "Merchant profile" })).toBeVisible();
    });

    test("uploads a small CSV feed and gets per-row results", async ({ page }) => {
      await page.goto("/merchant/feeds");
      await page.locator("#feed-file").setInputFiles(FIXTURE);
      await expect(page.getByRole("heading", { name: "Validation results" })).toBeVisible();
      const name = `e2e-feed-${Date.now()}`;
      await page.locator("#feed-name").fill(name);
      const resP = page.waitForResponse((r) => r.url().includes("/v1/merchant/feeds") && r.request().method() === "POST");
      await page.getByRole("button", { name: /^Upload/ }).click();
      const res = await resP;
      expect(res.status(), await res.text()).toBeLessThan(300);
      const body = (await res.json()) as { rowsTotal: number; rowsAccepted: number; rowsRejected: number; errors: Array<{ row: number; field: string }> };
      expect(body.rowsTotal).toBe(3);
      expect(body.rowsAccepted).toBe(2);
      expect(body.rowsRejected).toBe(1);
      expect(body.errors.some((e) => e.field === "url")).toBeTruthy();
      await expect(page.getByText(name).first()).toBeVisible();
    });
  });

  test.describe("analyst", () => {
    test.use({ storageState: authFile("seed-analyst") });
    test("can read admin pages but sees no write controls", async ({ page }) => {
      await page.goto("/admin/products");
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
      await expect(page.getByRole("button", { name: /new product/i })).toHaveCount(0);
    });
  });

  test.describe("consumer user", () => {
    test.use({ storageState: authFile("seed-user") });
    test("is forbidden from /admin and /merchant", async ({ page }) => {
      for (const path of ["/admin", "/merchant"]) {
        await page.goto(path);
        await page.waitForURL(/\/forbidden/);
        await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
      }
    });
  });
});
