import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@pricora/ui";
import { getCategory } from "@/lib/loaders";
import { first, type SearchParams } from "@/lib/nav";
import { hasFacetParams } from "@/lib/search-params";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { SearchResults } from "@/components/search/search-results";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getCategory(slug);
  const page = Number(first(sp.page) ?? "1");
  const name = res.ok ? res.data.category.name : slug.replace(/-/g, " ");
  return {
    title: `${name} — compare prices${page > 1 ? ` (page ${page})` : ""}`,
    description: res.ok && res.data.category.description ? res.data.category.description : `Compare ${name} prices across US stores, with price history and Deal Scores.`,
    alternates: { canonical: `/categories/${slug}${page > 1 ? `?page=${page}` : ""}` },
    robots: !res.ok || hasFacetParams(sp) ? { index: false, follow: true } : undefined,
    openGraph: { title: `${name} prices`, url: `/categories/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getCategory(slug);

  if (!res.ok) {
    return (
      <div className="container-content py-6">
        <ApiErrorPanel error={res.error} />
      </div>
    );
  }
  const { category, breadcrumbs, children, topBrands } = res.data;
  const crumbs = [{ label: "Home", href: "/" }, ...breadcrumbs.filter((b) => b.slug !== slug).map((b) => ({ label: b.name, href: `/categories/${b.slug}` })), { label: category.name }];

  return (
    <div className="container-content py-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...breadcrumbs.filter((b) => b.slug !== slug).map((b) => ({ name: b.name, path: `/categories/${b.slug}` })),
          { name: category.name, path: `/categories/${slug}` },
        ])}
      />
      <Crumbs items={crumbs} />
      <div className="mb-5 flex items-start gap-3">
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-md bg-surface-2 sm:flex">
          <CategoryIcon category={slug} size={26} />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
          {category.description ? <p className="mt-1 max-w-3xl text-sm text-text-muted">{category.description}</p> : null}
        </div>
      </div>
      {children.length || topBrands.length ? (
        <div className="mb-6 flex flex-col gap-3">
          {children.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Subcategories">
              {children.map((c) => (
                <li key={c.id}>
                  <Link href={`/categories/${c.slug}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm hover:bg-surface-2">
                    {c.name} <span className="price text-xs text-text-muted">{c.productCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {topBrands.length ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-text-muted">Top brands:</span>
              {topBrands.slice(0, 10).map((b) => (
                <Link key={b.slug} href={`/brands/${b.slug}`} className="text-primary underline underline-offset-2">
                  {b.name}
                </Link>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
      <SearchResults basePath={`/categories/${slug}`} searchParams={sp} fixed={{ category: slug }} hide={{ category: true }} />
    </div>
  );
}
