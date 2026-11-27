/**
 * Markdown renderings for AI agents / LLM crawlers (GEO). Served from /md/products/[slug] and /md/categories/[slug],
 * linked from the HTML via <link rel="alternate" type="text/markdown">. Same data as the HTML page — demo data is
 * labeled the same way, prices carry source + last-checked timestamps.
 */
import { brand } from "@pricora/config/brand";
import type { CategoryDetailResponse, ProductDetailResponse, SearchResponse } from "@pricora/contracts";
import { absoluteUrl } from "./env";
import { listFacts, listSummary, usd } from "./seo";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

const SOURCE: Record<string, string> = {
  api: "retailer API",
  feed: "retailer feed",
  merchant_upload: "merchant upload",
  affiliate: "affiliate feed",
  demo: "DEMO DATA (not a live price)",
};

const STOCK: Record<string, string> = { in_stock: "In stock", low_stock: "Low stock", out_of_stock: "Out of stock", preorder: "Pre-order", unknown: "Unknown" };

export const DEMO_BANNER = "> **Demo data:** some or all prices on this page are sample data used before live store connections. They are not real offers.";

function footer(htmlPath: string): string {
  return `\n---\nCanonical page: ${absoluteUrl(htmlPath)}\nPublisher: ${brand.name} (${brand.legalEntity}) — methodology: ${absoluteUrl("/how-we-compare")}\nGenerated: ${new Date().toISOString()}\n`;
}

export function productMarkdown(d: ProductDetailResponse): string {
  const p = d.product;
  const lowest = d.offers.find((o) => o.id === d.lowestOfferId) ?? null;
  const cur = lowest?.currency ?? "USD";
  const out: string[] = [`# ${p.title}`, ""];
  if (d.hasDemoData) out.push(DEMO_BANNER, "");
  const facts = [
    p.brand ? `- Brand: [${p.brand.name}](${absoluteUrl(`/brands/${p.brand.slug}`)})` : null,
    p.breadcrumbs.length ? `- Category: ${p.breadcrumbs.map((b) => `[${b.name}](${absoluteUrl(`/categories/${b.slug}`)})`).join(" > ")}` : null,
    p.model ? `- Model: ${p.model}` : null,
    p.mpn ? `- MPN: ${p.mpn}` : null,
    ...p.identifiers.filter((i) => ["UPC", "EAN", "GTIN"].includes(i.type)).map((i) => `- ${i.type}: ${i.value}`),
    `- Condition: ${p.condition}`,
  ].filter(Boolean);
  out.push(...(facts as string[]), "");
  out.push("## Summary", "");
  if (lowest) {
    let s = `Lowest price: **${usd(lowest.priceCents, cur)}** at ${lowest.retailer.name} (${d.storeCount} ${d.storeCount === 1 ? "store" : "stores"} compared), last updated ${d.lastUpdatedAt}.`;
    if (d.priceStats.allTimeLowCents !== null) s += ` Lowest recorded price: ${usd(d.priceStats.allTimeLowCents, cur)}${d.priceStats.allTimeLowAt ? ` (${d.priceStats.allTimeLowAt.slice(0, 10)})` : ""}.`;
    if (d.priceStats.median90Cents !== null) s += ` 90-day median: ${usd(d.priceStats.median90Cents, cur)}.`;
    if (d.dealScore) s += ` Deal Score: ${d.dealScore.score}/100 (${d.dealScore.tier}).`;
    out.push(s, "");
  } else {
    out.push("No store we track lists this product right now.", "");
  }
  if (d.fakeDiscount.flag && d.fakeDiscount.message) out.push(`> Fake-discount warning: ${d.fakeDiscount.message}`, "");
  if (d.offers.length) {
    out.push(`## Prices (${cur}, sorted by estimated total)`, "");
    out.push("| Store | Price | Shipping | Est. total (excl. tax) | Stock | Condition | Source | Last checked |", "|---|---:|---|---:|---|---|---|---|");
    for (const o of [...d.offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents)) {
      const ship = o.shipping.kind === "free" ? "Free" : o.shipping.costCents !== null ? usd(o.shipping.costCents, o.currency) : "Unknown";
      const totalExTax = o.priceCents + (o.shipping.kind === "free" ? 0 : (o.shipping.costCents ?? 0));
      out.push(
        `| ${esc(o.retailer.name)}${o.sponsored ? " (Sponsored)" : ""} | ${usd(o.priceCents, o.currency)} | ${ship} | ${usd(totalExTax, o.currency)} | ${STOCK[o.stock] ?? o.stock} | ${o.condition} | ${SOURCE[o.source] ?? o.source} | ${o.lastCheckedAt} |`,
      );
    }
    out.push("", "Sales tax depends on the buyer's ZIP code and is not included above.", "");
  }
  if (d.dealScore?.reasons.length) {
    out.push("## Why this Deal Score", "", ...d.dealScore.reasons.map((r) => `- ${r.message} (${Math.round(r.points)}/${Math.round(r.weight)})`), "");
  }
  if (p.attributes.length) {
    out.push("## Specifications", "", "| Spec | Value |", "|---|---|", ...p.attributes.map((a) => `| ${esc(a.name)} | ${esc(a.value + (a.unit ? ` ${a.unit}` : ""))} |`), "");
  }
  if (p.description) out.push("## Description", "", p.description, "");
  if (p.variants.length > 1) {
    out.push("## Variants", "", ...p.variants.map((v) => `- [${v.label}](${absoluteUrl(`/products/${v.slug}`)})${v.current ? " (this page)" : ""}`), "");
  }
  return out.join("\n") + footer(`/products/${p.slug}`);
}

export function categoryMarkdown(c: CategoryDetailResponse, list: Pick<SearchResponse, "items" | "total"> | null): string {
  const cat = c.category;
  const out: string[] = [`# ${cat.name} — price comparison`, ""];
  const anyDemo = Boolean(list?.items.some((p) => p.hasDemoData));
  if (anyDemo) out.push(DEMO_BANNER, "");
  const parents = c.breadcrumbs.filter((b) => b.slug !== cat.slug);
  if (parents.length) out.push(`Category path: ${parents.map((b) => `[${b.name}](${absoluteUrl(`/categories/${b.slug}`)})`).join(" > ")} > ${cat.name}`, "");
  if (list) out.push(listSummary(cat.name.toLowerCase(), listFacts(list.items, list.total)), "");
  if (cat.description) out.push(cat.description, "");
  if (c.children.length) out.push("## Subcategories", "", ...c.children.filter((x) => x.productCount > 0).map((x) => `- [${x.name}](${absoluteUrl(`/categories/${x.slug}`)}) — ${x.productCount} products`), "");
  if (c.topBrands.length) out.push("## Top brands", "", ...c.topBrands.slice(0, 15).map((b) => `- [${b.name} ${cat.name}](${absoluteUrl(`/brands/${b.slug}/${cat.slug}`)}) — ${b.productCount} products`), "");
  if (list?.items.length) {
    out.push("## Popular products", "", "| Product | Brand | Lowest price | Stores | Deal Score | Data | Updated |", "|---|---|---:|---:|---:|---|---|");
    for (const p of list.items) {
      out.push(
        `| [${esc(p.title)}](${absoluteUrl(`/products/${p.slug}`)}) | ${esc(p.brand?.name ?? "")} | ${p.lowestPriceCents !== null ? usd(p.lowestPriceCents, p.currency) : "—"} | ${p.storeCount} | ${p.dealScore ?? "—"} | ${p.hasDemoData ? "Demo" : "Live"} | ${p.updatedAt} |`,
      );
    }
    out.push("");
  }
  if (c.seoText) out.push("## Buying notes", "", c.seoText, "");
  return out.join("\n") + footer(`/categories/${cat.slug}`);
}

export function markdownResponse(md: string, htmlPath: string, status = 200): Response {
  return new Response(md, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // The HTML page is the indexable original; this is an alternate representation.
      link: `<${absoluteUrl(htmlPath)}>; rel="canonical"`,
      "x-robots-tag": "noindex, follow",
      "cache-control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
