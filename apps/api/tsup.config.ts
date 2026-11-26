import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  sourcemap: true,
  clean: true,
  // Bundle workspace TS sources that are not prebuilt (e.g. @pricora/api/core for the worker); keep npm deps external.
  noExternal: [/^@pricora\/api/],
});
