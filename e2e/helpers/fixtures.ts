import { test as base, type BrowserContext } from "@playwright/test";

/**
 * Consent cookie written by apps/web/src/lib/privacy/consent.ts (`pc_consent`).
 * Format: `1.<functional><analytics><advertising><gpc>.<unix seconds>`. `0000` = "Reject non-essential"
 * (essential only), which is also how the site behaves before a visitor chooses — so pre-setting it only hides the
 * fixed-position cookie banner (which otherwise intercepts clicks near the bottom of mobile viewports).
 */
export const CONSENT_COOKIE = "pc_consent";

export function essentialOnlyConsent(): string {
  return `1.0000.${Math.floor(Date.now() / 1000)}`;
}

/** Host-only cookie on `localhost`: shared by web :3100, admin :3001 and api :4400 (cookies ignore ports). */
export async function setEssentialConsent(context: BrowserContext): Promise<void> {
  await context.addCookies([{ name: CONSENT_COOKIE, value: essentialOnlyConsent(), domain: "localhost", path: "/", sameSite: "Lax" }]);
}

/**
 * Shared `test`: every browser context starts with an essential-only consent choice so the banner never renders.
 * Tests that need the banner (privacy.spec.ts) clear the cookie explicitly.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await setEssentialConsent(context);
    await use(context);
  },
});

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
