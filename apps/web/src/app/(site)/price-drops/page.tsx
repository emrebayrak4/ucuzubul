import type { Metadata } from "next";
import { TrendingDown } from "lucide-react";
import { PriceDropsQuery } from "@pricora/contracts";
import { EmptyState } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { relative } from "@/lib/format";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice } from "@/components/notices";
import { ProductCardTile } from "@/components/product-card";
import { LinkTabs, UrlSelect } from "@/components/url-controls";
import { JsonLd } from "@/components/json-ld";
import { absolute } from "@/lib/format";
import { collectionPageJsonLd, itemListJsonLd, pageParam } from "@/lib/seo";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const page = pageParam(sp);
  return {
    title: "Biggest price drops this week",
    description: "Real price drops from tracked store prices in the last 24 hours, 7 days and 30 days.",
    alternates: { canonical: page > 1 ? `/price-drops?page=${page}` : "/price-drops" },
    robots: first(sp.window) || first(sp.category) ? { index: false, follow: true } : undefined,
  };
}

const windows = [
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;

export default async function PriceDropsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = PriceDropsQuery.safeParse({ window: first(sp.window), category: first(sp.category) || undefined, condition: first(sp.condition) || undefined, page: first(sp.page), pageSize: 30 });
  const query = parsed.success ? parsed.data : PriceDropsQuery.parse({ pageSize: 30 });
  const api = await serverApi({ revalidate: 300 });
  const [res, cats] = await Promise.all([load(() => api.catalog.priceDrops(query)), load(() => api.catalog.categories())]);
  const href = (o: Record<string, string | number | undefined>) =>
    "/price-drops" + toQueryString({ window: query.window === "7d" ? undefined : query.window, category: query.category, condition: query.condition === "new" ? undefined : query.condition, ...o });

  const freshest = res.ok ? res.data.items.reduce<string | null>((m, d) => (!m || d.droppedAt > m ? d.droppedAt : m), null) : null;
  return (
    <div className="container-content py-6">
      {res.ok && res.data.items.length ? (
        <>
          <JsonLd data={collectionPageJsonLd({ name: "Biggest price drops", path: "/price-drops", description: "Real price drops from tracked store prices.", dateModified: freshest })} />
          <JsonLd data={itemListJsonLd("Biggest price drops", res.data.items.map((d) => d.product), (res.data.page - 1) * res.data.pageSize + 1)} />
        </>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">Biggest price drops</h1>
      {freshest ? (
        <p className="mt-1 text-xs text-text-muted" data-testid="freshness">
          Latest drop <time dateTime={freshest} title={absolute(freshest)}>{relative(freshest)}</time>
        </p>
      ) : null}
      <p className="mt-1 text-sm text-text-muted">Computed from real price observations — previous vs. current price at the same store.</p>
      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs label="Time window" items={windows.map((w) => ({ href: href({ window: w.value === "7d" ? undefined : w.value }), label: w.label, active: query.window === w.value }))} />
        <UrlSelect
          name="condition"
          label="Condition"
          allLabel="New only"
          options={[
            { value: "open_box", label: "Open-box deals" },
            { value: "refurbished", label: "Refurbished deals" },
            { value: "used", label: "Used deals" },
          ]}
        />
        {cats.ok ? <UrlSelect name="category" label="Category" allLabel="All categories" options={cats.data.items.flatMap((c) => [{ value: c.slug, label: c.name }, ...c.children.filter((x) => x.productCount > 0).map((x) => ({ value: x.slug, label: `– ${x.name}` }))])} /> : null}
      </div>
      {!res.ok ? (
        <ApiErrorPanel error={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState icon={<TrendingDown aria-hidden />} title="No price drops in this window" description="Try a longer time window." />
      ) : (
        <>
          {res.data.items.every((d) => d.source === "demo") ? <DemoNotice className="mb-4" /> : null}
          <ul className="grid-products" data-testid="drops-grid">
            {res.data.items.map((d) => (
              <li key={d.product.id + d.retailer.slug + d.droppedAt}>
                <ProductCardTile
                  product={{ ...d.product, lowestPriceCents: d.currentPriceCents }}
                  dropPercent={Math.round(d.dropRatio * 100)}
                  previousPriceCents={d.previousPriceCents}
                  storeName={d.retailer.name}
                  storeIsLowest={false}
                  storeNote={relative(d.droppedAt)}
                />
              </li>
            ))}
          </ul>
          <LinkPagination page={res.data.page} pageCount={res.data.totalPages} hrefFor={(p) => href({ page: p > 1 ? p : undefined })} />
        </>
      )}
    </div>
  );
}
