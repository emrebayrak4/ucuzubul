import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getBrand } from "@/lib/loaders";
import { BrandMark } from "@/components/brand-mark";
import type { SearchParams } from "@/lib/nav";
import { listingSeo, metaDescription, metaTitle, pageParam } from "@/lib/seo";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { CategoryBreakdown } from "@/components/catalog/category-breakdown";
import { SearchResults } from "@/components/search/search-results";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getBrand(slug);
  const page = pageParam(sp);
  const name = res.ok ? res.data.brand.name : slug;
  const seo = listingSeo(`/brands/${slug}`, sp);
  return {
    title: metaTitle(`${name} prices & deals${page > 1 ? ` (page ${page})` : ""}`),
    description: metaDescription(
      res.ok && res.data.brand.description
        ? res.data.brand.description
        : `Compare prices on ${name} products across US stores: ${res.ok ? `${res.data.brand.productCount} products tracked, ` : ""}price history, shipping and Deal Scores.`,
    ),
    alternates: { canonical: seo.canonical },
    robots: !res.ok ? { index: false, follow: true } : seo.robots,
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
  const { brand } = res.data;
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: brand.name, path: `/brands/${slug}` }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Brands", href: "/sitemap#brands" }, { label: brand.name }]} />
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
      <CategoryBreakdown items={res.data.categoryBreakdown ?? []} param="brand" value={slug} name={brand.name} />
      <SearchResults basePath={`/brands/${slug}`} searchParams={sp} fixed={{ brand: [slug] }} hide={{ brand: true }} />
    </div>
  );
}
