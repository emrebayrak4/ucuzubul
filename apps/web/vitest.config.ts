import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["test/**/*.test.ts"],
    env: { NEXT_PUBLIC_SITE_URL: "https://whichless.test" },
    testTimeout: 60_000,
  },
});
