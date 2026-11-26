// Prepend "use client" to the client entry (esbuild drops module-level directives when bundling),
// shift its source map by one line, and verify the server-safe entry has no directive.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const DIRECTIVE = '"use client";';

const indexPath = resolve(dist, "index.js");
const index = readFileSync(indexPath, "utf8");
if (!index.startsWith(DIRECTIVE)) {
  writeFileSync(indexPath, `${DIRECTIVE}\n${index}`);
  const mapPath = `${indexPath}.map`;
  if (existsSync(mapPath)) {
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    map.mappings = `;${map.mappings}`;
    writeFileSync(mapPath, JSON.stringify(map));
  }
}

if (!readFileSync(indexPath, "utf8").startsWith(DIRECTIVE)) {
  console.error('post-build: failed to add "use client" to dist/index.js');
  process.exit(1);
}
for (const f of ["utils.js"]) {
  if (/^\s*['"]use client['"]/.test(readFileSync(resolve(dist, f), "utf8"))) {
    console.error(`post-build: dist/${f} must stay server-safe (no "use client")`);
    process.exit(1);
  }
}
console.log('ui: dist/index.js starts with "use client"; dist/utils.js is server-safe');
