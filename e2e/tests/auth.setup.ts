import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test as setup } from "@playwright/test";
import { apiLogin, apiRegister, newApiContext } from "../helpers/api";
import { AUTH_DIR, SEED, SEED_PASSWORD, TEST_PASSWORD, authFile, uniqueEmail } from "../helpers/env";

/**
 * Creates reusable session states (cookies are scoped to `localhost`, so one API session is valid for web :3100,
 * admin :3001 and api :4400). Budget: auth routes allow 10 req/min per IP per route.
 */
setup("create session states", async () => {
  setup.setTimeout(300_000); // may wait out an auth rate-limit window on quick re-runs
  mkdirSync(fileURLToPath(AUTH_DIR), { recursive: true });

  // Fresh consumer users (one per browser project so parallel projects don't fight over favorites), plus a
  // second user for IDOR checks.
  for (const name of ["user-desktop-chromium", "user-mobile-chromium", "user-b"]) {
    const ctx = await newApiContext();
    const res = await apiRegister(ctx, uniqueEmail(name.replace(/-chromium$/, "")), TEST_PASSWORD);
    expect(res.status(), `register ${name}: ${await res.text()}`).toBe(201);
    await ctx.storageState({ path: authFile(name) });
    await ctx.dispose();
  }

  for (const role of ["admin", "analyst", "merchant", "user"] as const) {
    const ctx = await newApiContext();
    const res = await apiLogin(ctx, SEED[role], SEED_PASSWORD);
    expect(res.status(), `login seed ${role}: ${await res.text()}`).toBe(200);
    await ctx.storageState({ path: authFile(`seed-${role}`) });
    await ctx.dispose();
  }
});
