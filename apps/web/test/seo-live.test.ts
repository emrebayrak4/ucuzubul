/**
 * Live SEO crawl of every template against a running web server. Skipped unless SEO_LIVE_URL is set:
 *   SEO_LIVE_URL=http://localhost:3100 pnpm -C apps/web test
 * Checks: status codes, <title>/description length, canonical, robots, markdown alternates, and that every
 * JSON-LD block on the page validates (lib/seo-validate.ts).
 */
import { describe, expect, it } from "vitest";
import { extractJsonLd, validateJsonLd } from "@/lib/seo-validate";

const BASE = process.env.SEO_LIVE_URL?.replace(/\/+$/, "");
const live = BASE ? describe : describe.skip;

async function get(path: string, redirect: RequestRedirect = "manual") {
  const res = await fetch(BASE + path, { redirect });
  return { res, html: res.status === 200 ? await res.text() : "" };
}

const meta = (html: string, re: RegExp) => re.exec(html)?.[1] ?? null;
const title = (h: string) => meta(h, /<title>([^<]*)<\/title>/)?.replace(/&amp;/g, "&") ?? null;
const desc = (h: string) => meta(h, /<meta name="description" content="([^"]*)"/);
const canonical = (h: string) => meta(h, /<link rel="canonical" href="([^"]*)"/);
const robots = (h: string) => meta(h, /<meta name="robots" content="([^"]*)"/);

async function firstLoc(file: string, re: RegExp): Promise<string | null> {
  const xml = await (await fetch(`${BASE}/sitemaps/${file}`)).text();
  const m = re.exec(xml);
  return m ? new URL(m[1]!).pathname : null;
}

live("live SEO crawl", () => {
  it("every template: 200, sane title/description, canonical, valid JSON-LD", async () => {
    const product = await firstLoc("products-1.xml", /<loc>([^<]*\/products\/[^<]*)<\/loc>/);
    const category = await firstLoc("categories.xml", /<loc>([^<]*\/categories\/[^<]*)<\/loc>/);
    const store = await firstLoc("stores.xml", /<loc>([^<]*\/stores\/[^<]*)<\/loc>/);
    const brand = await firstLoc("brands.xml", /<loc>([^<]*\/brands\/[^<]*)<\/loc>/);
    expect(product && category && store && brand).toBeTruthy();
    const pages = ["/", product!, category!, store!, brand!, "/deals", "/price-drops", "/coupons", "/best/laptops", "/best/laptops-under-1000", `${brand!}/${category!.split("/").pop()}`, "/about", "/how-we-compare", "/editorial-policy", "/contact", "/sitemap"];
    const problems: string[] = [];
    for (const path of pages) {
      const { res, html } = await get(path);
      if (res.status !== 200) {
        problems.push(`${path}: HTTP ${res.status}`);
        continue;
      }
      const t = title(html);
      const d = desc(html);
      if (!t || t.length < 15 || t.length > 75) problems.push(`${path}: title length ${t?.length} "${t}"`);
      if (!d || d.length < 50 || d.length > 165) problems.push(`${path}: description length ${d?.length}`);
      if (!canonical(html)) problems.push(`${path}: no canonical`);
      const blocks = extractJsonLd(html);
      if (!blocks.length) problems.push(`${path}: no JSON-LD`);
      for (const b of blocks) for (const i of validateJsonLd(b)) if (i.level === "error") problems.push(`${path}: ${i.path} ${i.message}`);
    }
    expect(problems).toEqual([]);
  });

  it("canonical / robots policy on facets, sort and pagination", async () => {
    const category = (await firstLoc("categories.xml", /<loc>([^<]*\/categories\/[^<]*)<\/loc>/))!;
    const sorted = await get(`${category}?sort=price_asc`);
    expect(canonical(sorted.html)).toMatch(new RegExp(`${category}$`));
    expect(robots(sorted.html)).toBeNull();
    const faceted = await get(`${category}?minPrice=1000&inStock=true`);
    expect(robots(faceted.html)).toMatch(/noindex/);
    const paged = await get(`${category}?page=2`);
    expect(canonical(paged.html)).toMatch(/\?page=2$/);
  });

  it("status codes: unknown → 404, hidden travel → temporary redirect", async () => {
    for (const p of ["/products/does-not-exist-xyz", "/categories/does-not-exist-xyz", "/brands/does-not-exist-xyz", "/best/zzzz-not-a-thing"]) {
      expect((await get(p)).res.status, p).toBe(404);
    }
    const travel = await get("/travel");
    expect([200, 307]).toContain(travel.res.status);
  });

  it("GEO: llms.txt, markdown alternates, robots + sitemaps", async () => {
    const llms = await get("/llms.txt");
    expect(llms.res.headers.get("content-type")).toMatch(/text\/plain/);
    expect(llms.html).toMatch(/^# /);
    const product = (await firstLoc("products-1.xml", /<loc>([^<]*\/products\/[^<]*)<\/loc>/))!;
    const page = await get(product);
    expect(page.html).toMatch(/<link rel="alternate" type="text\/markdown"/);
    const og = meta(page.html, /<meta property="og:image" content="([^"]*)"/);
    expect(og).toBeTruthy();
    const ogRes = await fetch(BASE + new URL(og!).pathname + new URL(og!).search);
    expect(ogRes.status).toBe(200);
    expect(ogRes.headers.get("content-type")).toMatch(/image\/png/);
    const md = await fetch(`${BASE}/md${product}`);
    expect(md.headers.get("content-type")).toMatch(/text\/markdown/);
    expect(md.headers.get("link")).toMatch(/rel="canonical"/);
    expect(await md.text()).toMatch(/\| Store \| Price \|/);
    const robotsTxt = await (await fetch(`${BASE}/robots.txt`)).text();
    expect(robotsTxt).toMatch(/Sitemap: /);
    const index = await (await fetch(`${BASE}/sitemap.xml`)).text();
    expect(index).not.toMatch(/guides\.xml/);
  });
});
