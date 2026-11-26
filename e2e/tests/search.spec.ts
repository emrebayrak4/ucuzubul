import { expect, test } from "@playwright/test";
import { isMobile, parseCents, waitForHydration } from "../helpers/ui";

test.describe("search", () => {
  test('"best laptop under $800" shows price-capped laptop results', async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    const box = page.getByTestId("search-input").or(page.getByTestId("search-input-mobile")).filter({ visible: true }).first();
    await box.click();
    await box.fill("best laptop under $800");
    await box.press("Enter");
    await page.waitForURL(/\/search\?/);
    const results = page.getByTestId("search-results");
    await expect(results).toBeVisible();
    const tiles = results.getByTestId("product-tile");
    const n = await tiles.count();
    expect(n, "at least one result").toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const text = await tiles.nth(i).innerText();
      const cents = parseCents(text);
      expect(cents, `tile ${i} shows a price: ${text}`).not.toBeNull();
      expect(cents!, `tile ${i} price <= $800: ${text}`).toBeLessThanOrEqual(80_000);
    }
    // The parsed price cap is reflected in the URL or as a visible chip.
    const url = new URL(page.url());
    const chips = page.getByTestId("parsed-chips");
    const capInUrl = url.searchParams.get("maxPrice") === "80000";
    const capChip = (await chips.count()) > 0 && /800/.test(await chips.innerText());
    expect(capInUrl || capChip, "price cap visible in URL or chips").toBeTruthy();
  });

  test("filters and sort persist in the URL across reload and back", async ({ page }) => {
    await page.goto("/search?q=laptop");
    await waitForHydration(page);
    await expect(page.getByTestId("search-results")).toBeVisible();

    const sort = page.getByTestId("sort-select").filter({ visible: true }).first();
    await sort.selectOption("price_asc");
    await page.waitForURL(/sort=price_asc/);

    // Toggle the first brand facet (desktop sidebar or mobile sheet).
    if (isMobile(page)) {
      await page.getByRole("button", { name: /^filters$/i }).click();
    }
    const scope = isMobile(page) ? page.getByRole("dialog") : page.getByTestId("search-filters");
    const brandGroup = scope.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^brand/i }) });
    const firstBrand = brandGroup.getByRole("checkbox").first();
    await firstBrand.click();
    await page.waitForURL(/brand=/);
    if (isMobile(page)) await page.getByRole("button", { name: /show results/i }).click();
    const withBrand = page.url();
    const brandValue = new URL(withBrand).searchParams.get("brand");
    expect(brandValue).toBeTruthy();

    // Prices ascending after sort.
    const tiles = page.getByTestId("search-results").getByTestId("product-tile");
    await expect(tiles.first()).toBeVisible();
    const prices = (await tiles.allInnerTexts()).map(parseCents).filter((c): c is number => c !== null);
    expect([...prices].sort((a, b) => a - b), "sorted price low→high").toEqual(prices);

    await page.reload();
    await waitForHydration(page);
    expect(page.url()).toBe(withBrand);
    await expect(page.getByTestId("sort-select").filter({ visible: true }).first()).toHaveValue("price_asc");

    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("brand")).toBeNull();
    expect(new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBeNull();
    await page.goForward();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("price_asc");
  });
});
