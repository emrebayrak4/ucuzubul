import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test("renders rails and the demo-data notice", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("demo-notice").first()).toBeVisible();
    for (const rail of ["rail-trending", "rail-best-deals", "rail-price-drops"]) {
      const r = page.getByTestId(rail);
      await expect(r, rail).toBeVisible();
      await expect(r.locator("a[href^='/products/']").first(), `${rail} has product links`).toBeVisible();
    }
    await expect(page.getByTestId("api-error")).toHaveCount(0);
  });
});

test.describe("misc pages", () => {
  test("unknown route renders 404 page", async ({ page }) => {
    const res = await page.goto("/this-route-does-not-exist-e2e");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  });

  test("unknown product slug renders not-found UI (noindex)", async ({ page }) => {
    await page.goto("/products/no-such-product-e2e-zzz");
    await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
    await expect(page.locator("meta[name=robots]").first()).toHaveAttribute("content", /noindex/);
  });

  test("unknown product/category/brand/store slugs return HTTP 404 [BUG-W01 soft 404]", async ({ request }) => {
    test.fail(true, "BUG-W01: dynamic routes stream a not-found page with HTTP 200 (soft 404). Remove test.fail when fixed.");
    for (const p of ["/products/no-such-product-e2e-zzz", "/categories/nope-e2e", "/brands/nope-e2e", "/stores/nope-e2e"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.status(), p).toBe(404);
    }
  });

  test("dark mode toggle switches theme and persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const group = page.getByRole("radiogroup", { name: "Color theme" });
    await group.scrollIntoViewIfNeeded();
    await group.getByRole("radio", { name: "Dark" }).click();
    const html = page.locator("html");
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(group.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.reload();
    await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.getByRole("radiogroup", { name: "Color theme" }).getByRole("radio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
    const bgLight = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgLight, "body background changes between themes").not.toBe(bgDark);
  });
});
