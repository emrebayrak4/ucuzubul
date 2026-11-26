import { defineConfig } from "tsup";

// Two entries:
//  - index: every component; scripts/post-build.mjs prepends "use client" to dist/index.js
//    (esbuild drops module-level directives when bundling, so we re-add it deterministically).
//  - utils: server-safe helpers (cn, formatPrice) with NO directive, callable from RSC.
export default defineConfig({
  entry: { index: "src/index.ts", utils: "src/utils.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  treeshake: true,
  target: "es2022",
});
