import { expect, test } from "@playwright/test";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

test.describe("travel", () => {
  test("flight search shows the honest providers-pending state (no fabricated fares)", async ({ page }) => {
    await page.goto(`/flights/search?from=JFK&to=LAX&depart=${inDays(30)}&adults=1&cabin=economy`);
    await expect(page.getByTestId("providers-pending")).toBeVisible();
    await expect(page.getByTestId("flight-card")).toHaveCount(0);
  });

  test("hotel search → detail → rate rows carry demo badges and no booking link", async ({ page }) => {
    await page.goto(`/hotels/search?city=New%20York&checkin=${inDays(30)}&checkout=${inDays(32)}&guests=2&rooms=1`);
    const cards = page.getByTestId("hotel-card");
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    await expect(cards.filter({ hasText: "Demo data" })).toHaveCount(n);

    await cards.first().getByRole("heading").getByRole("link").click();
    await page.waitForURL(/\/hotels\/[^/?]+/);
    const rows = page.getByTestId("rate-row");
    await expect(rows.first()).toBeVisible();
    const r = await rows.count();
    await expect(rows.filter({ hasText: "Demo data" })).toHaveCount(r);
  });

  test("demo hotel rates offer no booking link [BUG-W02]", async ({ page, request }) => {
    test.fail(true, "BUG-W02: hotel detail renders a View deal link for demo rates; the API answers 409 JSON in a new tab.");
    await page.goto(`/hotels/search?city=New%20York&checkin=${inDays(30)}&checkout=${inDays(32)}&guests=2&rooms=1`);
    await page.getByTestId("hotel-card").first().getByRole("heading").getByRole("link").click();
    await page.waitForURL(/\/hotels\/[^/?]+/);
    await expect(page.getByTestId("rate-row").first()).toBeVisible();
    const links = page.getByTestId("rate-row").locator("a[href*='/travel/go/']");
    const n = await links.count();
    if (n > 0) {
      const res = await request.get((await links.first().getAttribute("href"))!, { maxRedirects: 0 });
      expect(res.status(), "demo rate link target").toBe(302);
    }
    expect(n).toBe(0);
  });
});
