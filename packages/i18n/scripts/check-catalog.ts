/**
 * Checks a locale catalog against en-US: same keys (unless --partial), every value parses as ICU,
 * same placeholder arguments and rich-text tags as the English message.
 *   pnpm -C packages/i18n exec tsx scripts/check-catalog.ts src/messages/de-DE.ts [--partial]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse, isTagElement, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { enUS } from "../src/messages/en-US";
import { messageArguments } from "../src/translate";

function tags(msg: string): string[] {
  const out = new Set<string>();
  const walk = (els: MessageFormatElement[]): void => {
    for (const el of els) {
      if (isTagElement(el)) {
        out.add(el.value);
        walk(el.children);
      } else if ("options" in el) for (const o of Object.values(el.options)) walk(o.value);
    }
  };
  walk(parse(msg));
  return [...out].sort();
}

const file = process.argv[2];
const partial = process.argv.includes("--partial");
if (!file) throw new Error("usage: check-catalog.ts <file> [--partial]");
const mod = (await import(pathToFileURL(path.resolve(file)).href)) as Record<string, unknown>;
const catalog = Object.values(mod).find((v) => v && typeof v === "object") as Record<string, string> | undefined;
if (!catalog) throw new Error("no exported catalog object in " + file);

const errors: string[] = [];
const base = enUS as Record<string, string>;
for (const key of Object.keys(catalog)) {
  if (!(key in base)) errors.push(`unknown key: ${key}`);
}
if (!partial) for (const key of Object.keys(base)) if (!(key in catalog)) errors.push(`missing key: ${key}`);
for (const [key, msg] of Object.entries(catalog)) {
  const en = base[key];
  if (en === undefined) continue;
  try {
    const a = messageArguments(msg).join(",");
    const b = messageArguments(en).join(",");
    if (a !== b) errors.push(`${key}: arguments {${a}} ≠ en-US {${b}}`);
    const ta = tags(msg).join(",");
    const tb = tags(en).join(",");
    if (ta !== tb) errors.push(`${key}: tags <${ta}> ≠ en-US <${tb}>`);
  } catch (e) {
    errors.push(`${key}: ICU parse error — ${(e as Error).message}`);
  }
}
console.log(`${file}: ${Object.keys(catalog).length} keys, ${errors.length} problems`);
for (const e of errors.slice(0, 200)) console.log("  " + e);
process.exitCode = errors.length ? 1 : 0;
