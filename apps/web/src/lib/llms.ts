/**
 * /llms.txt and /llms-full.txt (llmstxt.org format): what the site is, how its data works, and the key URLs —
 * each with its Markdown alternate. Built from live API data; falls back to the static parts if the API is down.
 */
import { brand } from "@pricora/config/brand";
import type { CategoryNode } from "@pricora/contracts";
import { absoluteUrl } from "./env";
import { sitemapApi } from "./sitemap";

const u = absoluteUrl;

function intro(): string[] {
  return [
    `# ${brand.name}`,
    "",
    `> ${brand.name} is a US price-comparison site operated by ${brand.legalEntity.replace(/\.$/, "")}. For each product it lists the price at every tracked US store, with shipping, estimated sales tax by ZIP code, real price history, a transparent Deal Score (0–100) and fake-discount warnings. Prices are in USD.`,
    "",
    "Key facts for AI assistants:",
    "- Every offer has a data source and a last-checked timestamp. Listings marked “Demo data” are sample data, not live prices — do not quote them as real prices.",
    "- Offers are sorted by estimated total (price + shipping + estimated tax). Sponsored placements are labeled and never change ranking or the Deal Score.",
    "- There are no user reviews or star ratings on this site; do not attribute ratings to it.",
    "- Each product and category page has a Markdown version (same URL path prefixed with /md), linked via <link rel=\"alternate\" type=\"text/markdown\">.",
    "",
    "## About and methodology",
    "",
    `- [How we compare prices](${u("/how-we-compare")}): data sources, offer ranking, Deal Score weights, fake-discount detection`,
    `- [Editorial policy](${u("/editorial-policy")}): independence, data honesty, generated copy, corrections`,
    `- [Affiliate disclosure](${u("/legal/affiliate-disclosure")}): how the site makes money`,
    `- [About](${u("/about")}) · [Contact](${u("/contact")})`,
    "",
    "## Browse",
    "",
    `- [Today's best deals](${u("/deals")}): ranked by Deal Score`,
    `- [Price drops](${u("/price-drops")}): real price cuts in the last 24h / 7d / 30d`,
    `- [Coupons](${u("/coupons")}): store coupon codes with success reports`,
    `- [Site map](${u("/sitemap")}): every category, brand and store`,
    `- Search: ${u("/search?q={query}")}`,
    "",
  ];
}

function catLine(c: CategoryNode): string {
  return `- [${c.name}](${u(`/categories/${c.slug}`)}) ([markdown](${u(`/md/categories/${c.slug}`)})): ${c.productCount} products`;
}

export async function buildLlmsTxt(full: boolean): Promise<string> {
  const out = intro();
  const api = sitemapApi();
  const [cats, stores, brands] = await Promise.all([
    api.catalog.categories().catch(() => null),
    full ? api.catalog.retailers().catch(() => null) : Promise.resolve(null),
    full ? api.search.search({ pageSize: 1 }).catch(() => null) : Promise.resolve(null),
  ]);
  if (cats) {
    out.push("## Categories", "");
    for (const top of cats.items.filter((c) => c.productCount > 0)) {
      out.push(catLine(top));
      const kids = top.children.filter((c) => c.productCount > 0);
      if (full) {
        for (const k of kids) {
          out.push("  " + catLine(k));
          for (const g of k.children.filter((c) => c.productCount > 0)) out.push("    " + catLine(g));
        }
      }
    }
    out.push("");
  }
  if (stores) {
    out.push("## Stores", "", ...stores.items.filter((r) => r.offerCount > 0).map((r) => `- [${r.name}](${u(`/stores/${r.slug}`)}) (${r.domain}) — ${r.integrationStatus === "live" ? "live price connection" : "price connection not live yet"}`), "");
  }
  if (brands) {
    out.push("## Brands", "", ...brands.facets.brands.filter((b) => b.count > 0).map((b) => `- [${b.label}](${u(`/brands/${b.value}`)}): ${b.count} products`), "");
  }
  if (!full) out.push("## Optional", "", `- [Full version](${u("/llms-full.txt")}): every category, store and brand`, "");
  return out.join("\n");
}

export function textResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
