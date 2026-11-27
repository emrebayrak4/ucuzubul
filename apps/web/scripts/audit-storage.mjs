/* global console, process */
// Storage audit: every first-party cookie / storage key literal ("pc_*", "pc-*") in the web app must be registered in
// src/lib/privacy/storage-registry.ts (which generates the Cookie Policy table), and every registered key must still be used.
// Run: pnpm -C apps/web audit:storage   (also part of `lint`)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../..");
const registryFile = path.join(root, "src/lib/privacy/storage-registry.ts");
const registry = [...readFileSync(registryFile, "utf8").matchAll(/name: "([^"]+)",\s*\n\s*kind: "(cookie|localStorage|sessionStorage)"/g)].map((m) => m[1]);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs)$/.test(f)) out.push(p);
  }
  return out;
}

const sources = [...walk(path.join(root, "src")), path.join(repo, "packages/config/src/brand.ts"), path.join(repo, "apps/api/src/common/auth.ts")].filter((f) => f !== registryFile);
const KEY = /["'`](pc[_-][a-z][a-z0-9_-]*)/g;
const matches = (key, name) => (name.endsWith("*") ? key.startsWith(name.slice(0, -1)) : key === name);
const used = new Set();
const problems = [];
for (const file of sources) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(KEY)) {
    const key = m[1];
    if (key === "pc:consent") continue; // DOM event name, not storage
    const hit = registry.find((n) => matches(key, n) || (n.endsWith("*") && n.slice(0, -1) === key));
    if (hit) used.add(hit);
    else problems.push(`${path.relative(repo, file)}: "${key}" is not in storage-registry.ts`);
  }
}
for (const n of registry) if (!used.has(n)) problems.push(`storage-registry.ts: "${n}" is registered but no longer used in code`);

if (problems.length) {
  console.error("Storage audit failed:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log(`Storage audit OK — ${registry.length} registered keys, all referenced; no unregistered keys.`);
