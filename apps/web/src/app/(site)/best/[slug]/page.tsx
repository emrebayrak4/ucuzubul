import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trophy } from "lucide-react";
import { Button, EmptyState } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { BEST_UNDER_CAPS, MIN_REAL_PRODUCTS, collectionPageJsonLd, itemListJsonLd, listFacts, listSummary, metaDescription, metaTitle, usd } from "@/lib/seo";
import { Crumbs } from "@/components/crumbs";
import { ApiErrorPanel } from "@/components/api-error";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { DemoNotice } from "@/components/notices";
import { ProductGrid } from "@/components/product-card";

/**
 * Programmatic "best <category>" and "best <category> under $X" pages:
 *   /best/laptops            → best-value laptops by Deal Score
 *   /best/laptops-under-800  → same, capped at $800 (whole dollars, 10–100000)
 * Indexable only with ≥ MIN_REAL_PRODUCTS products backed by real (non-demo) offers; intro copy is built from
 * the live result set (counts, price range, top brands, recent drops). Unknown slugs / thin free-text → 404.
 */
type Props = { params: Promise<{ slug: string }> };

function parseSlug(slug: string): { base: string; capDollars: number | null } {
  const m = /^(.+)-under-(\d{2,6})$/.exec(slug);
  if (!m) return { base: slug, capDollars: null };
  const cap = Number(m[2]);
  return cap >= 10 && cap <= 100_000 ? { base: m[1]!, capDollars: cap } : { base: slug, capDollars: null };
}

const getBest = cache(async (slug: string) => {
  const { base, capDollars } = parseSlug(slug);
  const api = await serverApi({ revalidate: 3600 });
  const cat = await load(() => api.catalog.category(base));
  const name = cat.ok ? cat.data.category.name : base.replace(/-/g, " ");
  const maxPrice = capDollars ? capDollars * 100 : undefined;
  const query = cat.ok
    ? { category: base, maxPrice, sort: "best_deal" as const, pageSize: 24 }
    : { q: base.replace(/-/g, " "), maxPrice, sort: "best_deal" as const, pageSize: 24 };
  const res = await load(() => api.search.search(query));
  // Not a category and the free-text match is too thin (fuzzy search can match 1–2 unrelated items) → real HTTP 404.
  if (!cat.ok && cat.error.status === 404 && res.ok && res.data.total < MIN_REAL_PRODUCTS) notFound();
  // A price cap with nothing under it is a dead end, not a page.
  if (capDollars && res.ok && res.data.total === 0) notFound();
  const facts = res.ok ? listFacts(res.data.items, res.data.total) : null;
  return { base, capDollars, name, res, facts, isCategory: cat.ok };
});

function heading(name: string, capDollars: number | null) {
  return `Best ${name.toLowerCase()}${capDollars ? ` under ${usd(capDollars * 100)}` : ""}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { name, capDollars, facts } = await getBest(slug);
  const h = heading(name, capDollars);
  return {
    title: metaTitle(`${h} — today's top deals`),
    description: metaDescription(
      facts ? `${h}, ranked by Deal Score. ${listSummary(name.toLowerCase(), facts)}` : `The best-value ${name.toLowerCase()} right now, ranked by Deal Score from real price history.`,
    ),
    alternates: { canonical: `/best/${slug}` },
    robots: (facts?.realCount ?? 0) < MIN_REAL_PRODUCTS ? { index: false, follow: true } : undefined,
  };
}

export default async function BestPage({ params }: Props) {
  const { slug } = await params;
  const { base, capDollars, name, res, facts, isCategory } = await getBest(slug);
  const h = heading(name, capDollars);
  const summary = facts ? listSummary(`${name.toLowerCase()}${capDollars ? ` under ${usd(capDollars * 100)}` : ""}`, facts) : null;
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, ...(isCategory ? [{ name, path: `/categories/${base}` }] : []), { name: h, path: `/best/${slug}` }])} />
      {res.ok && res.data.items.length ? (
        <>
          <JsonLd data={collectionPageJsonLd({ name: h, path: `/best/${slug}`, description: summary ?? h, dateModified: facts?.lastUpdated, about: name })} />
          <JsonLd data={itemListJsonLd(h, res.data.items)} />
        </>
      ) : null}
      <Crumbs items={[{ label: "Home", href: "/" }, ...(isCategory ? [{ label: name, href: `/categories/${base}` }] : []), { label: h }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{h} — deals right now</h1>
      {summary ? (
        <p className="mt-1 max-w-3xl text-sm text-text" data-testid="answer-summary">
          {res.ok && res.data.items.some((p) => p.hasDemoData) ? <span className="font-semibold">Demo data: </span> : null}
          {summary}
        </p>
      ) : null}
      <p className="mt-1 max-w-3xl text-sm text-text-muted">
        Ranked by Deal Score — today&apos;s price vs. each product&apos;s own 90-day median, all-time low and other stores. No paid ranking, no
        invented ratings. <Link href="/how-we-compare" className="underline underline-offset-2">How we compare</Link>
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
            {isCategory ? (
              <nav aria-label="Price caps" className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">By budget:</span>
                {BEST_UNDER_CAPS.filter((c) => c !== capDollars).map((c) => (
                  <Link key={c} href={`/best/${base}-under-${c}`} className="text-primary hover:underline">
                    {name} under {usd(c * 100)}
                  </Link>
                ))}
                {capDollars ? (
                  <Link href={`/best/${base}`} className="text-primary hover:underline">
                    All {name.toLowerCase()}
                  </Link>
                ) : null}
              </nav>
            ) : null}
            <p className="mt-4 text-sm">
              <Link href={isCategory ? `/categories/${base}` : `/search?q=${encodeURIComponent(base.replace(/-/g, " "))}`} className="text-primary underline underline-offset-2">
                Browse all {name.toLowerCase()}
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
