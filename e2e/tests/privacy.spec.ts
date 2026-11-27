import { CONSENT_COOKIE, expect, test } from "../helpers/fixtures";
import { waitForHydration } from "../helpers/ui";

test.describe("cookie consent", () => {
  test("banner shows without a stored choice and 'Reject non-essential' hides it", async ({ page, context }) => {
    // The shared fixture pre-sets an essential-only choice; remove it to see what a first-time visitor sees.
    await context.clearCookies({ name: CONSENT_COOKIE });
    await page.goto("/");
    await waitForHydration(page);

    const banner = page.getByTestId("consent-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Reject non-essential" }).click();
    await expect(banner).toHaveCount(0);

    const cookie = (await context.cookies()).find((c) => c.name === CONSENT_COOKIE);
    expect(cookie?.value, "essential-only choice stored").toMatch(/^1\.0000\.\d{9,11}$/);

    // The choice sticks across a reload (server reads the cookie for SSR).
    await page.reload();
    await waitForHydration(page);
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
  });
});
