import { expect, test } from "@playwright/test";
import { API_URL, authFile } from "../helpers/env";
import { waitForHydration } from "../helpers/ui";

// Each browser project has its own freshly registered user (see auth.setup.ts).
test.use({ storageState: async ({}, use, testInfo) => use(authFile(`user-${testInfo.project.name}`)) });

let products: Array<{ id: string; slug: string; title: string }> = [];

test.beforeAll(async ({ request }, testInfo) => {
  const res = await request.get(`${API_URL}/v1/search?q=laptop&pageSize=24`);
  const items = ((await res.json()) as { items: Array<{ id: string; slug: string; title: string }> }).items;
  // Different products per project to avoid cross-project interference on shared state.
  const offset = testInfo.project.name.startsWith("mobile") ? 3 : 0;
  products = items.slice(offset, offset + 3);
  expect(products.length).toBe(3);
});

test.describe("signed-in features", () => {
  test("favorite add and remove", async ({ page }) => {
    const p = products[0]!;
    await page.goto(`/products/${p.slug}`);
    await waitForHydration(page);
    const fav = page.getByTestId("favorite-button");
    await expect(fav).toHaveAttribute("aria-pressed", "false");
    const add = page.waitForResponse((r) => r.url().includes("/v1/me/favorites") && r.request().method() === "POST");
    await fav.click();
    expect((await add).status()).toBeLessThan(300);
    await expect(fav).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account/saved");
    await expect(page.getByRole("link", { name: p.title }).first()).toBeVisible();

    await page.goto(`/products/${p.slug}`);
    await waitForHydration(page);
    await expect(fav).toHaveAttribute("aria-pressed", "true");
    const del = page.waitForResponse((r) => r.url().includes("/v1/me/favorites/") && r.request().method() === "DELETE");
    await fav.click();
    expect((await del).status()).toBe(200);
    await expect(fav).toHaveAttribute("aria-pressed", "false");
  });

  test("create a price alert", async ({ page }) => {
    const p = products[1]!;
    await page.goto(`/products/${p.slug}`);
    await waitForHydration(page);
    await page.getByTestId("alert-button").filter({ visible: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Price alert" })).toBeVisible();
    await expect(dialog.locator("#alert-target")).not.toHaveValue("");
    const resP = page.waitForResponse((r) => r.url().endsWith("/v1/me/alerts") && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create alert" }).click();
    expect((await resP).status()).toBeLessThan(300);
    await expect(dialog).toBeHidden();

    await page.goto("/account/alerts");
    await expect(page.getByTestId("alerts-list")).toContainText(p.title.slice(0, 25));
  });

  test("smart basket optimize returns scenarios", async ({ page }) => {
    for (const p of products.slice(0, 2)) {
      await page.goto(`/products/${p.slug}`);
      await waitForHydration(page);
      await page.getByTestId("basket-button").click();
      await expect(page.getByText("Added to smart basket").first()).toBeVisible();
    }
    await page.goto("/basket");
    await waitForHydration(page);
    await expect(page.getByTestId("basket-items").locator(":scope > li")).toHaveCount(2);
    const resP = page.waitForResponse((r) => r.url().includes("/v1/basket/optimize"));
    await page.getByTestId("basket-optimize").click();
    expect((await resP).status()).toBe(200);
    const scenarios = page.getByTestId("basket-scenario");
    await expect(scenarios.first()).toBeVisible();
    expect(await scenarios.count()).toBeGreaterThanOrEqual(1);
    await expect(scenarios.first()).toContainText("$");
  });

  test("compare two products side by side", async ({ page }) => {
    const [a, b] = products;
    for (const p of [a!, b!]) {
      await page.goto(`/products/${p.slug}`);
      await waitForHydration(page);
      const btn = page.getByTestId("compare-button");
      await btn.click();
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
    const ids = await page.evaluate(() => (JSON.parse(localStorage.getItem("pc_compare") ?? "[]") as Array<{ id: string }>).map((i) => i.id));
    expect(ids).toEqual([a!.id, b!.id]);
    await page.goto(`/compare?ids=${ids.join(",")}`);
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    await expect(table).toContainText(a!.title.slice(0, 20));
    await expect(table).toContainText(b!.title.slice(0, 20));
  });
});
