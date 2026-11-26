/**
 * City travel guides: Markdown files in packages/content/guides/<slug>.md with YAML frontmatter.
 * Node-only loader (uses fs). Typed frontmatter schema shared with the API/admin.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const isoDate = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v.trim()))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"));

export const GuideFrontmatter = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  city: z.string().min(1).max(120),
  country: z.string().min(1).max(120),
  countryIso2: z.string().regex(/^[A-Z]{2}$/),
  /** IATA city/metro code (NYC, LON) or main airport code (LAX). */
  iataCityCode: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(400),
  bestTimeToVisit: z.string().max(200).nullable().optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(30).default([]),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(20).default([]),
  lastReviewed: isoDate,
});
export type GuideFrontmatter = z.infer<typeof GuideFrontmatter>;

export interface GuideFile {
  frontmatter: GuideFrontmatter;
  /** Markdown body (without frontmatter). */
  body: string;
  file: string;
}

export interface GuideHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Default guides directory (packages/content/guides), resolved from this module's location. */
export function defaultGuidesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "guides");
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseGuide(source: string, file = "<inline>"): GuideFile {
  const m = FRONTMATTER.exec(source.replace(/^﻿/, ""));
  if (!m) throw new Error(`${file}: missing YAML frontmatter`);
  const data: unknown = parseYaml(m[1] ?? "");
  const r = GuideFrontmatter.safeParse(data);
  if (!r.success) throw new Error(`${file}: invalid frontmatter — ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const expected = path.basename(file, ".md");
  if (file !== "<inline>" && r.data.slug !== expected) throw new Error(`${file}: slug "${r.data.slug}" does not match file name`);
  return { frontmatter: r.data, body: (m[2] ?? "").trim() + "\n", file };
}

export interface LoadResult {
  guides: GuideFile[];
  errors: { file: string; message: string }[];
}

/** Loads every *.md guide; invalid files are reported, not thrown. */
export function loadGuides(dir = defaultGuidesDir()): LoadResult {
  const guides: GuideFile[] = [];
  const errors: { file: string; message: string }[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { guides, errors: [{ file: dir, message: "guides directory not found" }] };
  }
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      guides.push(parseGuide(readFileSync(full, "utf8"), full));
    } catch (err) {
      errors.push({ file: full, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return { guides, errors };
}

export const slugifyHeading = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** H2/H3 headings for a table of contents (ids unique within the document). */
export function extractHeadings(markdown: string): GuideHeading[] {
  const seen = new Map<string, number>();
  const out: GuideHeading[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = (m[2] ?? "").replace(/[*_`]/g, "").trim();
    let id = slugifyHeading(text) || "section";
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n + 1}`;
    out.push({ id, text, level: (m[1] ?? "##").length as 2 | 3 });
  }
  return out;
}

/**
 * Makes guide Markdown safe to render: removes raw HTML (tags, comments), and neutralises
 * javascript:/data:/vbscript: link targets. Renderers should still escape HTML.
 */
export function sanitizeMarkdown(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[a-zA-Z][^>]*>/g, "")
    .replace(/\]\(\s*(javascript|data|vbscript):[^)]*\)/gi, "](#)")
    .replace(/^\s*\[[^\]]+\]:\s*(javascript|data|vbscript):.*$/gim, "");
}
