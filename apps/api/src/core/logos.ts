/**
 * Store/brand logos: persistence and fetching each site's OWN published icon from its official domain.
 * Logos are trademarks of their owners, used nominatively to identify the store/brand.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@pricora/database";
import { validateLogo, type ValidLogo } from "./images";
import type { ObjectStorage } from "./storage";

export type LogoOwner = "retailer" | "brand";
export type LogoSourceValue = "official_site" | "admin_upload" | "logo_provider";

export async function saveLogo(
  prisma: PrismaClient,
  storage: ObjectStorage,
  owner: LogoOwner,
  id: string,
  logo: ValidLogo,
  source: LogoSourceValue,
): Promise<{ logoUrl: string; logoSource: LogoSourceValue; logoUpdatedAt: Date }> {
  const row = owner === "retailer" ? await prisma.retailer.findUniqueOrThrow({ where: { id } }) : await prisma.brand.findUniqueOrThrow({ where: { id } });
  const hash = createHash("sha256").update(logo.body).digest("hex").slice(0, 12);
  const key = `logos/${owner}s/${row.slug}-${hash}.${logo.type}`;
  const url = await storage.put(key, logo.body, logo.contentType);
  const now = new Date();
  const data = { logoUrl: url, logoSource: source, logoUpdatedAt: now };
  if (owner === "retailer") await prisma.retailer.update({ where: { id }, data });
  else await prisma.brand.update({ where: { id }, data });
  if (row.logoUrl && row.logoUrl !== url) await storage.deleteByUrl(row.logoUrl).catch(() => undefined);
  return { logoUrl: url, logoSource: source, logoUpdatedAt: now };
}

export async function removeLogo(prisma: PrismaClient, storage: ObjectStorage, owner: LogoOwner, id: string): Promise<boolean> {
  const row = owner === "retailer" ? await prisma.retailer.findUnique({ where: { id } }) : await prisma.brand.findUnique({ where: { id } });
  if (!row) return false;
  const data = { logoUrl: null, logoSource: null, logoUpdatedAt: null };
  if (owner === "retailer") await prisma.retailer.update({ where: { id }, data });
  else await prisma.brand.update({ where: { id }, data });
  if (row.logoUrl) await storage.deleteByUrl(row.logoUrl).catch(() => undefined);
  return true;
}

// ───────────────────────── fetching from official sites ─────────────────────────

const UA = "PricoraLogoFetcher/1.0 (+https://pricora.com/bot)";
const TIMEOUT_MS = 8000;

async function get(url: string, fetchImpl: typeof fetch, accept: string): Promise<Response | null> {
  try {
    return await fetchImpl(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
}

/** Registrable-ish base: "www.bestbuy.com" → "bestbuy.com"; "store.google.com" → "google.com". */
export function baseDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

/** True when `url` is served from the official domain (or one of its subdomains). */
export function onOfficialDomain(url: URL, officialBase: string): boolean {
  const h = url.hostname.toLowerCase();
  return url.protocol === "https:" && (h === officialBase || h.endsWith(`.${officialBase}`));
}

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

/** Minimal robots.txt parser for the `*` group and our user agent. */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  let applies = false;
  let sawRule = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = (m[1] ?? "").toLowerCase();
    const v = (m[2] ?? "").trim();
    if (k === "user-agent") {
      if (sawRule) {
        applies = false;
        sawRule = false;
      }
      if (v === "*" || /pricoralogofetcher/i.test(v)) applies = true;
    } else if (k === "disallow" || k === "allow") {
      sawRule = true;
      if (applies && v) (k === "disallow" ? rules.disallow : rules.allow).push(v);
    }
  }
  return rules;
}

export function robotsAllows(rules: RobotsRules, pathname: string): boolean {
  const match = (p: string) => {
    const re = new RegExp("^" + p.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$"));
    return re.test(pathname);
  };
  const longest = (list: string[]) => list.filter(match).reduce((n, p) => Math.max(n, p.length), -1);
  const d = longest(rules.disallow);
  return d < 0 || longest(rules.allow) >= d;
}

interface IconCandidate {
  url: URL;
  rank: number;
}

/** Parses <link rel="apple-touch-icon|icon|shortcut icon"> candidates, best first. */
export function iconCandidates(html: string, pageUrl: URL): IconCandidate[] {
  const out: IconCandidate[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
    const relM = attr("rel");
    const hrefM = attr("href");
    const rel = (relM?.[2] ?? relM?.[3] ?? relM?.[4] ?? "").toLowerCase();
    const href = hrefM?.[2] ?? hrefM?.[3] ?? hrefM?.[4];
    if (!href || !/(^|\s)(apple-touch-icon(-precomposed)?|icon|shortcut icon|mask-icon)(\s|$)/.test(rel) || rel.includes("mask-icon")) continue;
    let url: URL;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), pageUrl);
    } catch {
      continue;
    }
    const sizesM = attr("sizes");
    const size = Math.max(0, ...((sizesM?.[2] ?? sizesM?.[3] ?? sizesM?.[4] ?? "").match(/\d+/g) ?? []).map(Number));
    const typeM = attr("type");
    const type = (typeM?.[2] ?? typeM?.[3] ?? "").toLowerCase();
    const isSvg = type.includes("svg") || url.pathname.endsWith(".svg");
    const isApple = rel.includes("apple-touch-icon");
    const rank = (isApple ? 2000 : 0) + (isSvg ? 1500 : 0) + (size || (isApple ? 180 : 32));
    out.push({ url, rank });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

export interface FetchIconResult {
  logo: ValidLogo | null;
  from: string | null;
  reason: string;
}

/**
 * Downloads the site's own icon from its official domain only: robots.txt respected, 8 s timeouts,
 * icons hosted on third-party CDNs are skipped (falls back to /favicon.ico on the official host).
 */
export async function fetchOfficialIcon(siteUrl: string, fetchImpl: typeof fetch = fetch): Promise<FetchIconResult> {
  let site: URL;
  try {
    site = new URL(siteUrl);
  } catch {
    return { logo: null, from: null, reason: "invalid site URL" };
  }
  const official = baseDomain(site.hostname);
  const robotsRes = await get(`${site.origin}/robots.txt`, fetchImpl, "text/plain");
  const rules = robotsRes?.ok ? parseRobots(await robotsRes.text()) : { disallow: [], allow: [] };

  const candidates: URL[] = [];
  if (robotsAllows(rules, "/")) {
    const page = await get(`${site.origin}/`, fetchImpl, "text/html");
    if (page?.ok) {
      const finalUrl = new URL(page.url || site.origin);
      if (onOfficialDomain(finalUrl, official)) {
        const html = (await page.text()).slice(0, 500_000);
        for (const c of iconCandidates(html, finalUrl)) if (onOfficialDomain(c.url, official)) candidates.push(c.url);
      }
    }
  }
  candidates.push(new URL("/favicon.ico", site.origin));

  const tried: string[] = [];
  for (const url of candidates.slice(0, 5)) {
    if (!robotsAllows(rules, url.pathname)) {
      tried.push(`${url.pathname}: robots.txt disallows`);
      continue;
    }
    const res = await get(url.toString(), fetchImpl, "image/png,image/svg+xml,image/webp,image/x-icon,image/*;q=0.8");
    if (!res?.ok) {
      tried.push(`${url.pathname}: ${res ? `HTTP ${res.status}` : "network error/timeout"}`);
      continue;
    }
    const finalUrl = new URL(res.url || url.toString());
    if (!onOfficialDomain(finalUrl, official)) {
      tried.push(`${url.pathname}: redirected off the official domain`);
      continue;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 512 * 1024) {
      tried.push(`${url.pathname}: too large`);
      continue;
    }
    const v = validateLogo(Buffer.from(await res.arrayBuffer()));
    if ("error" in v) {
      tried.push(`${url.pathname}: ${v.error}`);
      continue;
    }
    return { logo: v, from: finalUrl.toString(), reason: "ok" };
  }
  return { logo: null, from: null, reason: tried.join("; ") || "no icon candidates" };
}

/** Logo provider fallback (e.g. logo.dev) — only used when an admin configured a token. */
export async function fetchProviderLogo(domain: string, token: string, fetchImpl: typeof fetch = fetch): Promise<ValidLogo | null> {
  const res = await get(`https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(token)}&format=png&size=256`, fetchImpl, "image/png");
  if (!res?.ok) return null;
  const v = validateLogo(Buffer.from(await res.arrayBuffer()));
  return "error" in v ? null : v;
}
