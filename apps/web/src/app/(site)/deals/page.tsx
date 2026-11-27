import type { Metadata } from "next";
import { Percent } from "lucide-react";
import { DealsQuery } from "@pricora/contracts";
import { EmptyState } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice, Notice } from "@/components/notices";
import { ProductCardTile } from "@/components/product-card";
import { LinkTabs, UrlSelect } from "@/components/url-controls";
import { JsonLd } from "@/components/json-ld";
import { absolute, relative } from "@/lib/format";
import { collectionPageJsonLd, itemListJsonLd, pageParam } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const facet = Boolean(first(sp.sort) || first(sp.category));
  const page = pageParam(sp);
  return {
    title: "Today's best deals — ranked by Deal Score",
    description: "Deals ranked by an honest Deal Score: price vs. its own 90-day history, all-time low and other stores. Fake discounts flagged.",
    alternates: { canonical: page > 1 ? `/deals?page=${page}` : "/deals" },
    robots: facet ? { index: false, follow: true } : undefined,
  };
}

const sorts = [
  { value: "score", label: "Best score" },
  { value: "drop", label: "Biggest drop" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Lowest price" },
] as const;

export default async function DealsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = DealsQuery.safeParse({ sort: first(sp.sort), category: first(sp.category) || undefined, page: first(sp.page), pageSize: 30 });
  const query = parsed.success ? parsed.data : DealsQuery.parse({ pageSize: 30 });
  const api = await serverApi({ revalidate: 300 });
  const [res, cats] = await Promise.all([load(() => api.catalog.deals(query)), load(() => api.catalog.categories())]);
  const href = (o: Record<string, string | number | undefined>) =>
    "/deals" + toQueryString({ sort: query.sort === "score" ? undefined : query.sort, category: query.category, ...o });

  const freshest = res.ok ? res.data.items.reduce<string | null>((m, d) => (!m || d.offer.lastCheckedAt > m ? d.offer.lastCheckedAt : m), null) : null;
  return (
    <div className="container-content py-6">
      {res.ok && res.data.items.length ? (
        <>
          <JsonLd data={collectionPageJsonLd({ name: "Today's best deals", path: "/deals", description: "Deals ranked by Deal Score from real price history.", dateModified: freshest })} />
          <JsonLd data={itemListJsonLd("Today's best deals", res.data.items.map((d) => d.product), (res.data.page - 1) * res.data.pageSize + 1)} />
        </>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s best deals</h1>
      {freshest ? (
        <p className="mt-1 text-xs text-text-muted" data-testid="freshness">
          Updated <time dateTime={freshest} title={absolute(freshest)}>{relative(freshest)}</time>
        </p>
      ) : null}
      <p className="mt-1 max-w-3xl text-sm text-text-muted">
        Ranked by Deal Score (0–100): how today&apos;s price compares with its own 90-day median, its all-time low and other stores. Sponsored
        placements never change the score.
      </p>
      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs label="Sort deals" items={sorts.map((s) => ({ href: href({ sort: s.value === "score" ? undefined : s.value }), label: s.label, active: query.sort === s.value }))} />
        {cats.ok ? <UrlSelect name="category" label="Category" allLabel="All categories" options={cats.data.items.map((c) => ({ value: c.slug, label: c.name }))} /> : null}
      </div>
      {!res.ok ? (
        <ApiErrorPanel error={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState icon={<Percent aria-hidden />} title="No deals right now" description="When prices fall below their usual range, they'll show up here." />
      ) : (
        <>
          {res.data.items.every((d) => d.offer.source === "demo") ? <DemoNotice className="mb-4" /> : null}
          <ul className="grid-products" data-testid="deals-grid">
            {res.data.items.map((d) => (
              <li key={d.product.id + d.offer.id} className="flex flex-col gap-1.5">
                <ProductCardTile product={{ ...d.product, dealScore: d.dealScore.score }} storeName={d.offer.retailer.name} />
                <p className="px-0.5 text-2xs text-text-muted">
                  Best at <span className="font-medium text-text">{d.offer.retailer.name}</span>
                  {d.dealScore.reasons[0] ? ` · ${d.dealScore.reasons[0].message}` : ""}
                </p>
                {d.fakeDiscount.flag && d.fakeDiscount.message ? (
                  <Notice tone="warning" className="px-2 py-1 text-2xs">
                    {d.fakeDiscount.message}
                  </Notice>
                ) : null}
              </li>
            ))}
          </ul>
          <LinkPagination page={res.data.page} pageCount={res.data.totalPages} hrefFor={(p) => href({ page: p > 1 ? p : undefined })} />
        </>
      )}
    </div>
  );
}
