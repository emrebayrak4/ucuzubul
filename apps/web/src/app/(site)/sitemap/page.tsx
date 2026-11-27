import type { Metadata } from "next";
import Link from "next/link";
import type { CategoryNode } from "@pricora/contracts";
import { load, serverApi } from "@/lib/api-server";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";

/** HTML sitemap: every category (3 levels), brand and store one click from here → max crawl depth ≈ 3 from the home page. */
export const metadata: Metadata = {
  title: "Site map — all categories, brands and stores",
  description: "Every category, brand and store we compare prices for, plus deals, price drops, coupons and how we compare.",
  alternates: { canonical: "/sitemap" },
};

const KEY_PAGES = [
  { href: "/deals", label: "Today's best deals" },
  { href: "/price-drops", label: "Price drops" },
  { href: "/coupons", label: "Coupons" },
  { href: "/popular", label: "Popular products" },
  { href: "/new", label: "New products" },
  { href: "/how-we-compare", label: "How we compare prices" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
  { href: "/legal/affiliate-disclosure", label: "Affiliate disclosure" },
];

function Tree({ nodes, depth = 0 }: { nodes: CategoryNode[]; depth?: number }) {
  const list = nodes.filter((n) => n.productCount > 0);
  if (!list.length) return null;
  return (
    <ul className={depth === 0 ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "ml-3 mt-1 space-y-0.5 border-l border-border pl-3"}>
      {list.map((n) => (
        <li key={n.id} className="text-sm">
          <Link href={`/categories/${n.slug}`} className={depth === 0 ? "font-bold text-text hover:text-primary" : "text-text-muted hover:text-primary hover:underline"}>
            {n.name}
          </Link>{" "}
          <span className="price text-2xs text-text-muted">({n.productCount})</span>
          <Tree nodes={n.children} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

export default async function HtmlSitemapPage() {
  const api = await serverApi({ revalidate: 3600 });
  const [cats, stores, brands] = await Promise.all([
    load(() => api.catalog.categories()),
    load(() => api.catalog.retailers()),
    load(() => api.search.search({ pageSize: 1 })),
  ]);
  const brandList = brands.ok ? [...brands.data.facets.brands].filter((b) => b.count > 0).sort((a, b) => a.label.localeCompare(b.label)) : [];
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Site map", path: "/sitemap" }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Site map" }]} />
      <h1 className="text-2xl font-extrabold tracking-tight">Site map</h1>
      <section aria-labelledby="sm-key" className="mt-6">
        <h2 id="sm-key" className="mb-2 text-lg font-bold">Start here</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {KEY_PAGES.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="text-primary hover:underline">{p.label}</Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="categories" className="mt-8">
        <h2 id="categories" className="mb-3 text-lg font-bold">Categories</h2>
        {cats.ok ? <Tree nodes={cats.data.items} /> : <p className="text-sm text-text-muted">Categories are temporarily unavailable.</p>}
      </section>
      <section aria-labelledby="brands" className="mt-8">
        <h2 id="brands" className="mb-3 text-lg font-bold">Brands</h2>
        <ul className="columns-2 gap-6 text-sm sm:columns-3 lg:columns-5">
          {brandList.map((b) => (
            <li key={b.value} className="break-inside-avoid py-0.5">
              <Link href={`/brands/${b.value}`} className="hover:text-primary hover:underline">{b.label}</Link>{" "}
              <span className="price text-2xs text-text-muted">({b.count})</span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="stores" className="mt-8">
        <h2 id="stores" className="mb-3 text-lg font-bold">Stores</h2>
        <ul className="columns-2 gap-6 text-sm sm:columns-3 lg:columns-5">
          {(stores.ok ? stores.data.items : []).filter((r) => r.offerCount > 0).map((r) => (
            <li key={r.slug} className="break-inside-avoid py-0.5">
              <Link href={`/stores/${r.slug}`} className="hover:text-primary hover:underline">{r.name}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
