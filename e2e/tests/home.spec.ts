import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test("renders rails and the demo-data notice", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("demo-notice").first()).toBeVisible();
    // "Today's best deals" is hidden when it would repeat "Near the lowest price" — accept either.
    const deals = page.getByTestId("rail-lowest").or(page.getByTestId("rail-best-deals")).first();
    await expect(deals).toBeVisible();
    for (const rail of ["rail-trending", "rail-price-drops"]) {
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

  test("unknown product/category/brand/store slugs return HTTP 404 (BUG-W01 fixed)", async ({ request }) => {
    for (const p of ["/products/no-such-product-e2e-zzz", "/categories/nope-e2e", "/brands/nope-e2e", "/stores/nope-e2e"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.status(), p).toBe(404);
    }
  });

  test("site stays light by default even when the OS prefers dark", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
    await ctx.close();
  });
});
