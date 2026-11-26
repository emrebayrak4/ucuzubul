import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { decorator: { legacy: true } },
  test: {
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
