import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { getCategory } from "@/lib/loaders";
import { first, type SearchParams } from "@/lib/nav";
import { hasFacetParams } from "@/lib/search-params";
import { getBrandCategory } from "@/lib/loaders";
import { MIN_REAL_PRODUCTS, collectionPageJsonLd, itemListJsonLd, listFacts, listingSeo, metaDescription, metaTitle, pageParam, usd } from "@/lib/seo";
import { CategoryCircle } from "@/components/catalog/category-circle";
import { ApiErrorPanel } from "@/components/api-error";
import { BrandMark } from "@/components/brand-mark";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { ProductCardRail } from "@/components/rail";
import { SearchResults } from "@/components/search/search-results";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getCategory(slug);
  const page = pageParam(sp);
  const name = res.ok ? res.data.category.name : slug.replace(/-/g, " ");
  // A single-brand filter has a curated equivalent (/brands/[brand]/[slug]) → canonical there.
  const brand = first(sp.brand);
  let curatedIndexable = false;
  if (brand && !brand.includes(",")) {
    const bc = await getBrandCategory(brand, slug).catch(() => null);
    curatedIndexable = Boolean(bc?.search.ok && listFacts(bc.search.data.items, bc.search.data.total).realCount >= MIN_REAL_PRODUCTS);
  }
  const seo = listingSeo(`/categories/${slug}`, sp, { brandPath: (b) => `/brands/${b}/${slug}`, indexable: curatedIndexable });
  const desc = res.ok && res.data.category.description ? res.data.category.description : `Compare ${name} prices across US stores: lowest price per store, shipping, estimated tax, price history and Deal Scores.`;
  return {
    title: metaTitle(`${name} — compare prices${page > 1 ? ` (page ${page})` : ""}`),
    description: metaDescription(desc),
    alternates: { canonical: seo.canonical, types: { "text/markdown": `/md/categories/${slug}` } },
    robots: !res.ok ? { index: false, follow: true } : seo.robots,
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
  const { category, breadcrumbs, children, siblings, topBrands, seoText } = res.data;
  const parents = breadcrumbs.filter((b) => b.slug !== slug);
  const crumbs = [{ label: "Home", href: "/" }, ...parents.map((b) => ({ label: b.name, href: `/categories/${b.slug}` })), { label: category.name }];
  const landing = !hasFacetParams(sp) && Number(first(sp.page) ?? "1") <= 1;
  const chips = children.length ? children : (siblings ?? []);
  const brandParam = first(sp.brand) ?? "";

  // Rails only on the unfiltered first page (they are discovery aids, not results).
  const api = await serverApi({ revalidate: 300 });
  const [popular, drops] = landing
    ? await Promise.all([
        load(() => api.search.search({ category: slug, sort: "popular", pageSize: 12 })),
        load(() => api.catalog.priceDrops({ category: slug, window: "7d", pageSize: 12 })),
      ])
    : [null, null];

  // Answer-first summary from the category-wide facets (price range, most-listed brands) — real counts only.
  const facets = popular?.ok ? popular.data.facets : null;
  const topFacetBrands = facets ? [...facets.brands].sort((a, b) => b.count - a.count).slice(0, 3).map((b) => b.label) : [];
  const summary =
    `${category.name}: ${category.productCount.toLocaleString("en-US")} products compared across US stores` +
    (facets?.price.minCents != null && facets.price.maxCents != null ? `, lowest prices from ${usd(facets.price.minCents)} to ${usd(facets.price.maxCents)}` : "") +
    "." +
    (topFacetBrands.length ? ` Most-listed brands: ${topFacetBrands.join(", ")}.` : "") +
    (drops?.ok && drops.data.items.length ? ` ${drops.data.total} with a price cut in the last 7 days.` : "");
  const related = (siblings ?? []).filter((c) => c.slug !== slug && c.productCount > 0).slice(0, 12);

  return (
    <div className="container-content py-6">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...parents.map((b) => ({ name: b.name, path: `/categories/${b.slug}` })),
          { name: category.name, path: `/categories/${slug}` },
        ])}
      />
      {landing ? <JsonLd data={collectionPageJsonLd({ name: `${category.name} prices`, path: `/categories/${slug}`, description: summary, dateModified: popular?.ok ? listFacts(popular.data.items, popular.data.total).lastUpdated : null, about: category.name })} /> : null}
      {landing && popular?.ok && popular.data.items.length ? <JsonLd data={itemListJsonLd(`Popular ${category.name}`, popular.data.items)} /> : null}
      <Crumbs items={crumbs} />

      <header className="mb-4 flex items-start gap-3">
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary sm:flex">
          <CategoryIcon category={parents[0]?.slug ?? slug} size={26} />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{category.name}</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            <span className="price font-semibold text-text">{category.productCount.toLocaleString("en-US")}</span> products compared across US stores — lowest price,
            store count and price history for each.
          </p>
          {landing ? (
            <p className="mt-1.5 max-w-3xl text-sm text-text" data-testid="answer-summary">
              {popular?.ok && popular.data.items.some((p) => p.hasDemoData) ? <span className="font-semibold">Demo data: </span> : null}
              {summary}
            </p>
          ) : null}
        </div>
      </header>

      {chips.length ? (
        <nav aria-label={children.length ? "Subcategories" : "Related categories"} className="mb-5" data-testid="subcategory-chips">
          <ul className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pt-1 md:mx-0 md:px-0">
            {chips.map((c) => {
              const current = c.slug === slug;
              return (
                <li key={c.id} className="w-28 shrink-0">
                  <Link href={`/categories/${c.slug}`} aria-current={current ? "page" : undefined} className="group flex flex-col items-center gap-2 text-center">
                    <CategoryCircle slug={c.slug} iconSlug={parents[0]?.slug ?? slug} size={80} className={cn(current && "ring-2 ring-primary")} />
                    <span className={cn("line-clamp-2 text-sm font-semibold leading-tight", current ? "text-primary" : "text-text group-hover:text-primary")}>{c.name}</span>
                    <span className="price -mt-1 text-xs text-text-muted">
                      {c.productCount} {c.productCount === 1 ? "product" : "products"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {(topBrands ?? []).length > 1 ? (
        <nav aria-label="Top brands" className="mb-5" data-testid="top-brands">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {topBrands.slice(0, 14).map((b) => {
              const on = brandParam.split(",").includes(b.slug);
              return (
                <li key={b.slug} className="shrink-0">
                  <Link
                    href={on ? `/categories/${slug}` : `/categories/${slug}?brand=${b.slug}`}
                    aria-pressed={on}
                    className={cn(
                      "flex h-12 min-w-24 flex-col items-center justify-center rounded-md border bg-surface px-3 text-center",
                      on ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary",
                    )}
                  >
                    {b.logoUrl ? <BrandMark name={b.name} logoUrl={b.logoUrl} size="sm" /> : <span className="text-sm font-bold">{b.name}</span>}
                    <span className="price text-2xs text-text-muted">
                      {b.productCount} {b.productCount === 1 ? "product" : "products"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {popular?.ok && popular.data.items.length >= 4 ? (
        <div className="mb-(--pc-section-gap)">
          <ProductCardRail
            title={`Popular in ${category.name}`}
            description="Ranked by how many stores carry it, then Deal Score — never by payment."
            seeAllHref={`/popular?category=${slug}`}
            products={popular.data.items}
            testId="rail-popular"
          />
        </div>
      ) : null}
      {drops?.ok && drops.data.items.length >= 3 ? (
        <div className="mb-(--pc-section-gap)">
          <ProductCardRail
            title={`Price drops in ${category.name}`}
            description="Real price cuts in the last 7 days."
            seeAllHref={`/price-drops?category=${slug}`}
            products={drops.data.items.map((d) => d.product)}
            testId="rail-drops"
          />
        </div>
      ) : null}

      <SearchResults basePath={`/categories/${slug}`} searchParams={sp} fixed={{ category: slug }} hide={{ category: true }} />

      {seoText && landing ? (
        <section aria-labelledby="cat-guide" className="mt-(--pc-section-gap) rounded-lg border border-border bg-surface p-5 sm:p-6" data-testid="category-seo">
          <h2 id="cat-guide" className="text-lg font-bold">
            Comparing {category.name.toLowerCase()} prices
          </h2>
          <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-text-muted">
            {seoText.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {(topBrands ?? []).length ? (
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm" data-testid="brand-category-links">
              <span className="font-semibold">By brand:</span>
              {topBrands.slice(0, 12).map((b) => (
                <Link key={b.slug} href={`/brands/${b.slug}/${slug}`} className="text-primary hover:underline">
                  {b.name} {category.name}
                </Link>
              ))}
            </p>
          ) : null}
          {related.length && children.length ? (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold">Related categories:</span>
              {related.map((c) => (
                <Link key={c.id} href={`/categories/${c.slug}`} className="text-primary hover:underline">
                  {c.name}
                </Link>
              ))}
            </p>
          ) : null}
          <p className="mt-2 text-sm">
            <Link href={`/best/${slug}`} className="font-semibold text-primary hover:underline">
              Best {category.name.toLowerCase()} deals right now
            </Link>
          </p>
          {children.length ? (
            <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold">Shop by type:</span>
              {children.map((c) => (
                <Link key={c.id} href={`/categories/${c.slug}`} className="text-primary hover:underline">
                  {c.name}
                </Link>
              ))}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
