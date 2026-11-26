import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getBrand } from "@/lib/loaders";
import { BrandMark } from "@/components/brand-mark";
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
  const res = await getBrand(slug);
  const page = Number(first(sp.page) ?? "1");
  const name = res.ok ? res.data.brand.name : slug;
  return {
    title: `${name} prices & deals${page > 1 ? ` (page ${page})` : ""}`,
    description: res.ok && res.data.brand.description ? res.data.brand.description : `Compare prices on ${name} products across US stores.`,
    alternates: { canonical: `/brands/${slug}${page > 1 ? `?page=${page}` : ""}` },
    robots: !res.ok || hasFacetParams(sp) ? { index: false, follow: true } : undefined,
  };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getBrand(slug);
  if (!res.ok) {
    return (
      <div className="container-content py-6">
        <ApiErrorPanel error={res.error} />
      </div>
    );
  }
  const { brand, categories } = res.data;
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: brand.name, path: `/brands/${slug}` }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Brands" }, { label: brand.name }]} />
      <div className="mb-5 flex items-center gap-4">
        <BrandMark name={brand.name} logoUrl={brand.logoUrl} size="lg" className="border border-border" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{brand.name}</h1>
          <p className="text-sm text-text-muted">
            <span className="price">{brand.productCount}</span> products tracked
            {brand.website ? (
              <>
                {" · "}
                <a href={brand.website} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                  Official site <ExternalLink aria-hidden className="size-3" />
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>
      {brand.description ? <p className="mb-4 max-w-3xl text-sm text-text-muted">{brand.description}</p> : null}
      {categories.length ? (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label="Categories for this brand">
          {categories.map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}?brand=${slug}`} className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-surface-2">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <SearchResults basePath={`/brands/${slug}`} searchParams={sp} fixed={{ brand: [slug] }} hide={{ brand: true }} />
    </div>
  );
}
