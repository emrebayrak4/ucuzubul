import { PackageSearch } from "lucide-react";
import type { SearchSort } from "@pricora/contracts";
import { EmptyState } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice } from "@/components/notices";
import { ProductGrid } from "@/components/product-card";
import { UrlSelect } from "@/components/url-controls";

/** Shared body for ranked lists (/new, /popular): category picker + ranked grid + pagination, all URL-driven. */
export async function RankedListPage({
  basePath,
  searchParams,
  sort,
  title,
  description,
}: {
  basePath: string;
  searchParams: SearchParams;
  sort: SearchSort;
  title: (categoryName: string | null) => string;
  description: string;
}) {
  const category = first(searchParams.category) || undefined;
  const page = Math.max(1, Math.min(100, Number(first(searchParams.page) ?? "1") || 1));
  const api = await serverApi({ revalidate: 300 });
  const [res, cats] = await Promise.all([load(() => api.search.search({ category, sort, page, pageSize: 30 })), load(() => api.catalog.categories())]);
  const options = cats.ok
    ? cats.data.items.flatMap((c) => [{ value: c.slug, label: c.name }, ...c.children.filter((x) => x.productCount > 0).map((x) => ({ value: x.slug, label: `– ${x.name}` }))])
    : [];
  const catName = category ? (options.find((o) => o.value === category)?.label.replace(/^– /, "") ?? null) : null;
  const href = (p: number) => basePath + toQueryString({ category, page: p > 1 ? p : undefined });
  return (
    <div className="container-content py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title(catName)}</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">{description}</p>
        </div>
        {options.length ? <UrlSelect name="category" label="Category" allLabel="All categories" options={options} /> : null}
      </div>
      {!res.ok ? (
        <ApiErrorPanel error={res.error} />
      ) : res.data.items.length === 0 ? (
        <EmptyState icon={<PackageSearch aria-hidden />} title="Nothing here yet" description="Try another category." />
      ) : (
        <>
          {res.data.items.some((p) => p.hasDemoData) ? <DemoNotice className="mb-4" /> : null}
          <ProductGrid products={res.data.items} testId="ranked-grid" />
          <LinkPagination page={res.data.page} pageCount={Math.min(res.data.totalPages, 100)} hrefFor={href} />
        </>
      )}
    </div>
  );
}
