import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBrandCategory } from "@/lib/loaders";
import type { SearchParams } from "@/lib/nav";
import { MIN_REAL_PRODUCTS, collectionPageJsonLd, itemListJsonLd, listFacts, listSummary, listingSeo, metaDescription, metaTitle, pageParam } from "@/lib/seo";
import { ApiErrorPanel } from "@/components/api-error";
import { BrandMark } from "@/components/brand-mark";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { SearchResults } from "@/components/search/search-results";

/**
 * Programmatic "<brand> <category>" page. Indexable only when ≥ MIN_REAL_PRODUCTS products are backed by real
 * (non-demo) offers; otherwise it renders for users but is noindex and left out of the sitemap.
 */
type Props = { params: Promise<{ slug: string; category: string }>; searchParams: Promise<SearchParams> };

async function data(slug: string, category: string) {
  const d = await getBrandCategory(slug, category);
  if (!d.brand.ok || !d.category.ok) return { ...d, facts: null };
  if (d.search.ok && d.search.data.total === 0) notFound();
  return { ...d, facts: d.search.ok ? listFacts(d.search.data.items, d.search.data.total) : null };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, category } = await params;
  const sp = await searchParams;
  const d = await data(slug, category);
  if (!d.brand.ok || !d.category.ok || !d.facts) return { title: "Brand category", robots: { index: false, follow: true } };
  const b = d.brand.data.brand.name;
  const c = d.category.data.category.name;
  const path = `/brands/${slug}/${category}`;
  const seo = listingSeo(path, sp);
  const page = pageParam(sp);
  const indexable = d.facts.realCount >= MIN_REAL_PRODUCTS && !seo.noindex;
  return {
    title: metaTitle(`${b} ${c} — compare prices${page > 1 ? ` (page ${page})` : ""}`),
    description: metaDescription(listSummary(`${b} ${c.toLowerCase()}`, d.facts)),
    alternates: { canonical: seo.canonical },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: { title: `${b} ${c} prices`, url: path },
  };
}

export default async function BrandCategoryPage({ params, searchParams }: Props) {
  const { slug, category } = await params;
  const sp = await searchParams;
  const d = await data(slug, category);
  if (!d.brand.ok) return <div className="container-content py-6"><ApiErrorPanel error={d.brand.error} /></div>;
  if (!d.category.ok) return <div className="container-content py-6"><ApiErrorPanel error={d.category.error} /></div>;
  const brand = d.brand.data.brand;
  const cat = d.category.data.category;
  const path = `/brands/${slug}/${category}`;
  const subject = `${brand.name} ${cat.name.toLowerCase()}`;
  const otherCats = (d.brand.data.categoryBreakdown ?? []).filter((c) => c.slug !== category).slice(0, 10);
  const otherBrands = (d.category.data.topBrands ?? []).filter((b) => b.slug !== slug).slice(0, 10);
  const items = d.search.ok ? d.search.data.items : [];

  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: brand.name, path: `/brands/${slug}` }, { name: cat.name, path }])} />
      <JsonLd data={collectionPageJsonLd({ name: `${brand.name} ${cat.name}`, path, description: d.facts ? listSummary(subject, d.facts) : subject, dateModified: d.facts?.lastUpdated, about: `${brand.name} ${cat.name}` })} />
      {items.length ? <JsonLd data={itemListJsonLd(`${brand.name} ${cat.name}`, items.slice(0, 24))} /> : null}
      <Crumbs items={[{ label: "Home", href: "/" }, { label: brand.name, href: `/brands/${slug}` }, { label: cat.name }]} />
      <header className="mb-4 flex items-center gap-4">
        <BrandMark name={brand.name} logoUrl={brand.logoUrl} size="lg" className="border border-border" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {brand.name} {cat.name}
          </h1>
          {d.facts ? (
            <p className="mt-1 max-w-3xl text-sm text-text-muted" data-testid="answer-summary">
              {items.some((p) => p.hasDemoData) ? <span className="font-semibold text-text">Demo data: </span> : null}
              {listSummary(subject, d.facts)}
            </p>
          ) : null}
        </div>
      </header>

      <SearchResults basePath={path} searchParams={sp} fixed={{ brand: [slug], category }} hide={{ brand: true, category: true }} />

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {otherCats.length ? (
          <nav aria-labelledby="more-cats" className="rounded-lg border border-border bg-surface p-4">
            <h2 id="more-cats" className="mb-2 text-base font-bold">More from {brand.name}</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {otherCats.map((c) => (
                <li key={c.slug}>
                  <Link href={`/brands/${slug}/${c.slug}`} className="text-primary hover:underline">
                    {brand.name} {c.name}
                  </Link>{" "}
                  <span className="price text-xs text-text-muted">({c.count})</span>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {otherBrands.length ? (
          <nav aria-labelledby="more-brands" className="rounded-lg border border-border bg-surface p-4">
            <h2 id="more-brands" className="mb-2 text-base font-bold">Other {cat.name.toLowerCase()} brands</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {otherBrands.map((b) => (
                <li key={b.slug}>
                  <Link href={`/brands/${b.slug}/${category}`} className="text-primary hover:underline">
                    {b.name} {cat.name}
                  </Link>{" "}
                  <span className="price text-xs text-text-muted">({b.productCount})</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href={`/categories/${category}`} className="font-semibold text-primary hover:underline">All {cat.name.toLowerCase()}</Link>
              {" · "}
              <Link href={`/best/${category}`} className="font-semibold text-primary hover:underline">Best {cat.name.toLowerCase()} deals</Link>
            </p>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
