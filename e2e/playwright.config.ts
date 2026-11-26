import { defineConfig, devices } from "@playwright/test";
import { WEB_URL } from "./helpers/env";

/**
 * Runs against the already-running local stack (web :3100, admin :3001, api :4400). No webServer block on purpose:
 * the dev servers belong to other agents and must not be started/stopped by the suite.
 *
 * Browser: Playwright's bundled Chromium if installed for this Playwright version, otherwise the system Chrome
 * (`PW_CHANNEL=chrome`, the default here because the bundled revision is not downloaded on this machine).
 */
const channel = process.env.PW_CHANNEL === "bundled" ? undefined : (process.env.PW_CHANNEL ?? "chrome");

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Next dev servers compile on demand; keep concurrency low so we test the app, not the laptop.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "playwright-report/results.json" }], ["html", { open: "never", outputFolder: "playwright-report/html" }]],
  use: {
    baseURL: WEB_URL,
    channel,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/, use: { channel } },
    {
      name: "desktop-chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      dependencies: ["setup"],
      // Admin/merchant portal and the API-level security checks are desktop-only (viewport-independent).
      testIgnore: [/admin\.spec\.ts/, /a11y\.spec\.ts/, /security\.spec\.ts/],
      use: {
        ...devices["Pixel 7"],
        channel,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
