import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../helpers/fixtures";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

/**
 * Travel (flights, hotels, guides) is behind NEXT_PUBLIC_TRAVEL_ENABLED (apps/web/src/lib/features.ts, default off).
 * When off, the web proxy 307-redirects /travel* to "/". Detect that once per worker instead of guessing from env,
 * since the flag belongs to the running dev server, not to this process.
 */
async function travelEnabled(request: APIRequestContext): Promise<boolean> {
  const res = await request.get("/travel/flights", { maxRedirects: 0 });
  if (res.status() >= 300 && res.status() < 400) {
    const location = res.headers()["location"] ?? "";
    return new URL(location, "http://placeholder.invalid").pathname !== "/";
  }
  return true;
}

test.describe("travel disabled (feature flag off)", () => {
  test.beforeAll(async ({ request }) => {
    test.skip(await travelEnabled(request), "NEXT_PUBLIC_TRAVEL_ENABLED=true on the running web server");
  });

  test("/travel/flights redirects to / and the header has no vertical switcher", async ({ page, request }) => {
    const res = await request.get("/travel/flights", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers()["location"] ?? "", "http://placeholder.invalid").pathname).toBe("/");

    await page.goto("/travel/flights");
    await expect(page).toHaveURL((u) => u.pathname === "/");
    await expect(page.getByRole("banner").first()).toBeVisible();
    await expect(page.getByTestId("vertical-switcher")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /switch between shopping and travel/i })).toHaveCount(0);
  });
});

test.describe("travel", () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!(await travelEnabled(request)), "travel is disabled (NEXT_PUBLIC_TRAVEL_ENABLED is not true): /travel/flights redirects to /");
  });

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

  test("demo hotel rates offer no booking link (BUG-W02 fixed)", async ({ page, request }) => {
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
