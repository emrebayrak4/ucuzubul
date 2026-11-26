export const WEB_URL = process.env.WEB_URL ?? "http://localhost:3100";
export const ADMIN_URL = process.env.ADMIN_URL ?? "http://localhost:3001";
export const API_URL = process.env.API_URL ?? "http://localhost:4400";

/** Dev-only seed password (packages/database seed). Never used outside local runs. */
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "PricoraDev!2026";
export const SEED = {
  admin: "admin@pricora.local",
  editor: "editor@pricora.local",
  analyst: "analyst@pricora.local",
  merchant: "merchant@pricora.local",
  user: "user@pricora.local",
} as const;

/** Password used for users the suite creates (all @example.test). */
export const TEST_PASSWORD = "E2e-Test-Passw0rd!";

export const AUTH_DIR = new URL("../.auth/", import.meta.url);
export const authFile = (name: string) => new URL(`${name}.json`, AUTH_DIR).pathname.replace(/^\/([A-Za-z]:)/, "$1");

export const uniqueEmail = (tag: string) => `e2e-${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@example.test`;
