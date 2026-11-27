import { expect, test } from "../helpers/fixtures";
import { API_URL, TEST_PASSWORD, uniqueEmail } from "../helpers/env";
import { uiLogin, waitForHydration } from "../helpers/ui";

test.describe("consumer auth", () => {
  test("signup → account → logout (session revoked) → login", async ({ page, context, request }) => {
    const email = uniqueEmail("signup");
    await page.goto("/signup?next=/account");
    await waitForHydration(page);
    const form = page.getByTestId("signup-form");
    await expect(form).toBeVisible();
    await page.getByTestId("signup-name").fill("E2E Signup");
    await page.getByTestId("signup-email").fill(email);
    await page.getByTestId("signup-password").fill(TEST_PASSWORD);
    // Click the checkbox itself: the label contains Terms/Privacy links.
    await form.locator("#terms").click();
    const regP = page.waitForResponse((r) => r.url().includes("/v1/auth/register"));
    await page.getByTestId("signup-submit").click();
    expect((await regP).status()).toBe(201);
    await page.waitForURL(/\/account(\?|$)/);
    await expect(page.getByText(email).or(page.getByText("E2E Signup")).first()).toBeVisible();

    // Cookie flags on the session cookie.
    const cookies = await context.cookies(API_URL);
    const session = cookies.find((c) => c.name === "pc_session");
    expect(session, "pc_session cookie").toBeTruthy();
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
    const csrf = cookies.find((c) => c.name === "pc_csrf");
    expect(csrf?.httpOnly).toBe(false);

    // Logout through the account menu.
    await page.getByTestId("account-menu").click();
    const outP = page.waitForResponse((r) => r.url().includes("/v1/auth/logout"));
    await page.getByTestId("logout").click();
    expect((await outP).status()).toBe(200);
    await expect(page.getByTestId("header-login")).toBeVisible();

    // The old session token must be revoked server-side (not just the cookie cleared).
    const me = await request.get(`${API_URL}/v1/auth/me`, { headers: { cookie: `pc_session=${session!.value}` } });
    expect(((await me.json()) as { user: unknown }).user, "revoked session resolves to anonymous").toBeNull();

    // Account is gated after logout.
    await page.goto("/account");
    await page.waitForURL(/\/login\?next=/);

    await uiLogin(page, email, TEST_PASSWORD, "/account");
    await page.waitForURL(/\/account(\?|$)/);
    await expect(page.getByText(email).or(page.getByText("E2E Signup")).first()).toBeVisible();
  });

  test("login form shows a generic error on wrong password", async ({ page }) => {
    await page.goto("/login");
    await waitForHydration(page);
    await page.getByTestId("login-email").fill("nobody-e2e@example.test");
    await page.getByTestId("login-password").fill("wrong-password-123");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("form-error").or(page.getByRole("alert")).first()).toContainText(/incorrect|invalid|too many/i);
  });

  test("forgot-password flow shows a non-enumerating confirmation", async ({ page }) => {
    await page.goto("/forgot-password");
    await waitForHydration(page);
    const form = page.getByTestId("forgot-form");
    await form.getByLabel("Email").fill(uniqueEmail("forgot"));
    const resP = page.waitForResponse((r) => r.url().includes("/v1/auth/forgot-password"));
    await form.getByRole("button").click();
    expect((await resP).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText(/check your email/i);
    await expect(page.getByRole("status")).toContainText(/if an account exists/i);
  });
});
