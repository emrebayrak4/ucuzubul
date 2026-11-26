// Builds loadable unpacked extensions:
//   dist/chrome-mv3   (Chrome / Edge, MV3 service worker)
//   dist/firefox-mv3  (Firefox ≥ 128, MV3 background scripts)
// Usage: node scripts/build.mjs [--target=chrome|firefox|all] [--outDir=<dir>]
//
// Plain Vite (already the repo's bundler) instead of WXT/CRXJS: three small builds (extension pages + background as
// ES modules; each content script as a self-contained IIFE, which MV3 content scripts require) and a generated manifest.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, loadEnv } from "vite";
import { generateAssets, ICON_SIZES } from "./assets.mjs";
import { BUILT_IN_RETAILERS, retailerMatchPatterns } from "../src/shared/retailers.ts";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(appDir, "src");
const publicDir = join(appDir, "public");
const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));

const outRootArg = process.argv.find((a) => a.startsWith("--outDir="))?.split("=").slice(1).join("=");
const outRoot = outRootArg ? resolve(outRootArg) : join(appDir, "dist");
const targetArg = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? "all";
const targets = targetArg === "all" ? ["chrome", "firefox"] : [targetArg];
for (const t of targets) {
  if (t !== "chrome" && t !== "firefox") throw new Error(`Unknown target "${t}"`);
}

const mode = process.env.NODE_ENV === "development" ? "development" : "production";
const env = loadEnv(mode, appDir, "VITE_");
function originOf(raw, fallback) {
  try {
    return new URL((raw ?? "").trim() || fallback).origin;
  } catch {
    return fallback;
  }
}
const apiOrigin = originOf(env.VITE_PRICORA_API_URL, "http://localhost:4400");

// Brand identity comes only from @pricora/config (packages/config/src/brand.ts); it must be built first.
const { brand } = await import("@pricora/config/brand");
const brandName = brand.name;

function manifest(target) {
  const retailerMatches = retailerMatchPatterns(BUILT_IN_RETAILERS);
  const icons = Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icons/icon-${s}.png`]));
  const base = {
    manifest_version: 3,
    name: `${brandName} — Price & Coupon Finder`,
    short_name: brandName,
    version: pkg.version,
    description: `${brandName} compares prices and finds coupons on supported US stores. No browsing history collection.`,
    icons,
    action: {
      default_title: brandName,
      default_popup: "popup/index.html",
      default_icon: Object.fromEntries(ICON_SIZES.slice(0, 3).map((s) => [String(s), `icons/icon-${s}.png`])),
    },
    options_ui: { page: "options/index.html", open_in_tab: true },
    permissions: ["storage", "activeTab"],
    host_permissions: [...retailerMatches, `${apiOrigin}/*`],
    content_scripts: [
      { matches: retailerMatches, js: ["content/product.js"], run_at: "document_idle", all_frames: false },
      { matches: retailerMatches, js: ["content/checkout.js"], run_at: "document_idle", all_frames: false },
    ],
    web_accessible_resources: [{ resources: ["fonts/*.woff2", "icons/icon-32.png", "icons/icon-48.png"], matches: retailerMatches }],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  if (target === "chrome") {
    return {
      ...base,
      minimum_chrome_version: "116",
      background: { service_worker: "background.js", type: "module" },
      web_accessible_resources: [{ ...base.web_accessible_resources[0], use_dynamic_url: true }],
    };
  }
  return {
    ...base,
    background: { scripts: ["background.js"], type: "module" },
    browser_specific_settings: {
      gecko: {
        // Placeholder add-on id; replace with the AMO id before publishing.
        id: `extension@${brand.domain}`,
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["browsingActivity"], optional: ["technicalAndInteraction"] },
      },
    },
  };
}

const sharedConfig = {
  configFile: false,
  envDir: appDir,
  mode,
  logLevel: "warn",
  define: { "process.env.NODE_ENV": JSON.stringify(mode) },
};

async function buildTarget(target) {
  const outDir = join(outRoot, `${target}-mv3`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 1) Extension pages + background (ES modules; MV3 allows module service workers / background scripts).
  await build({
    ...sharedConfig,
    root: srcDir,
    base: "/",
    publicDir,
    css: { postcss: appDir },
    build: {
      outDir,
      emptyOutDir: false,
      target: "es2022",
      sourcemap: false,
      modulePreload: { polyfill: false },
      rollupOptions: {
        // lucide-react ships "use client" directives (RSC hint, irrelevant here).
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
        input: {
          popup: join(srcDir, "popup", "index.html"),
          options: join(srcDir, "options", "index.html"),
          background: join(srcDir, "background", "index.ts"),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  });

  // 2) Content scripts: one self-contained IIFE each (no imports allowed in classic content scripts).
  for (const name of ["product", "checkout"]) {
    await build({
      ...sharedConfig,
      root: srcDir,
      publicDir: false,
      build: {
        outDir: join(outDir, "content"),
        emptyOutDir: false,
        target: "es2022",
        sourcemap: false,
        lib: {
          entry: join(srcDir, "content", `${name}.ts`),
          formats: ["iife"],
          name: `pricora_${name}`,
          fileName: () => `${name}.js`,
        },
      },
    });
  }

  const m = manifest(target);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");

  // Sanity check: every file the manifest references exists.
  const referenced = [
    ...Object.values(m.icons),
    m.action.default_popup,
    m.options_ui.page,
    ...(m.background.service_worker ? [m.background.service_worker] : m.background.scripts),
    ...m.content_scripts.flatMap((c) => c.js),
  ];
  const missing = referenced.filter((f) => !existsSync(join(outDir, f)));
  if (missing.length) throw new Error(`[extension] ${target}: missing files referenced by manifest: ${missing.join(", ")}`);
  console.log(`[extension] ${target}: ${outDir}`);
}

await generateAssets(publicDir);
for (const t of targets) await buildTarget(t);
console.log(`[extension] API origin baked into host_permissions: ${apiOrigin}`);
