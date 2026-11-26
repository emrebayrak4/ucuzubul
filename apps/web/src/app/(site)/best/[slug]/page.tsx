import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, EmptyState } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { Crumbs } from "@/components/crumbs";
import { ApiErrorPanel } from "@/components/api-error";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { DemoNotice } from "@/components/notices";
import { ProductGrid } from "@/components/product-card";

/** Minimum number of real (non-demo) products for a "best of" page to be indexable (no thin pages). */
const MIN_REAL_PRODUCTS = 6;

type Props = { params: Promise<{ slug: string }> };

const getBest = cache(async (slug: string) => {
  const api = await serverApi({ revalidate: 3600 });
  const cat = await load(() => api.catalog.category(slug));
  const name = cat.ok ? cat.data.category.name : slug.replace(/-/g, " ");
  const query = cat.ok ? { category: slug, sort: "best_deal" as const, pageSize: 24 } : { q: slug.replace(/-/g, " "), sort: "best_deal" as const, pageSize: 24 };
  const res = await load(() => api.search.search(query));
  // Not a category and the free-text match is too thin (fuzzy search can match 1–2 unrelated items) → real HTTP 404.
  if (!cat.ok && cat.error.status === 404 && res.ok && res.data.total < MIN_REAL_PRODUCTS) notFound();
  return { name, res, isCategory: cat.ok };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { name, res } = await getBest(slug);
  const realCount = res.ok ? res.data.items.filter((p) => !p.hasDemoData).length : 0;
  const title = `Best ${name.toLowerCase()} deals right now`;
  return {
    title,
    description: `The best-value ${name.toLowerCase()} right now, ranked by Deal Score from real price history across US stores.`,
    alternates: { canonical: `/best/${slug}` },
    robots: realCount < MIN_REAL_PRODUCTS ? { index: false, follow: true } : undefined,
  };
}

export default async function BestPage({ params }: Props) {
  const { slug } = await params;
  const { name, res, isCategory } = await getBest(slug);
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: `Best ${name}`, path: `/best/${slug}` }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: `Best ${name}` }]} />
      <h1 className="text-2xl font-semibold tracking-tight">Best {name.toLowerCase()} deals right now</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-muted">
        Ranked by Deal Score — today&apos;s price vs. each product&apos;s own 90-day median, all-time low and other stores. No paid ranking, no
        invented ratings.
      </p>
      <div className="mt-5">
        {!res.ok ? (
          <ApiErrorPanel error={res.error} />
        ) : res.data.items.length === 0 ? (
          <EmptyState
            icon={<Trophy aria-hidden />}
            title="Not enough products yet"
            description="We don't have enough tracked products to build this list."
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href="/deals">See all deals</Link>
              </Button>
            }
          />
        ) : (
          <>
            {res.data.items.every((p) => p.hasDemoData) ? <DemoNotice className="mb-4" /> : null}
            <ProductGrid products={res.data.items} testId="best-grid" />
            <p className="mt-6 text-sm">
              <Link href={isCategory ? `/categories/${slug}` : `/search?q=${encodeURIComponent(slug.replace(/-/g, " "))}`} className="text-primary underline underline-offset-2">
                Browse all {name.toLowerCase()}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
