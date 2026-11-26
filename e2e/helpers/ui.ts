import { expect, type Page } from "@playwright/test";

/** Parses "$1,234.56" → 123456 cents. Returns null if no price is found. */
export function parseCents(text: string | null | undefined): number | null {
  const m = (text ?? "").match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (!m?.[1]) return null;
  return Math.round(Number(m[1].replace(/,/g, "")) * 100);
}

export function allCents(text: string | null | undefined): number[] {
  return [...(text ?? "").matchAll(/\$\s?([\d,]+(?:\.\d{2})?)/g)].map((m) => Math.round(Number((m[1] ?? "0").replace(/,/g, "")) * 100));
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** Waits until Next.js has hydrated the page (client components respond to clicks). */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => document.readyState === "complete");
  // next-themes / react hydrate quickly after load; a short idle window avoids clicking dead SSR markup.
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
}

/**
 * Logs in through the web form. If the API rate-limits (10/min per route per IP), waits once and retries,
 * so suite re-runs inside a minute don't produce false failures.
 */
export async function uiLogin(page: Page, email: string, password: string, next = "/account"): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await waitForHydration(page);
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    const resP = page.waitForResponse((r) => r.url().includes("/v1/auth/login") && r.request().method() === "POST");
    await page.getByTestId("login-submit").click();
    const res = await resP;
    if (res.status() === 429 && attempt === 0) {
      await page.waitForTimeout(62_000);
      continue;
    }
    expect(res.status(), "login response").toBe(200);
    return;
  }
}

export async function dismissToasts(page: Page): Promise<void> {
  await page.keyboard.press("Escape").catch(() => undefined);
}
