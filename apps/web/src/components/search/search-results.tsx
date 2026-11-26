import Link from "next/link";
import { SearchX, Sparkles } from "lucide-react";
import type { SearchQueryInput } from "@pricora/contracts";
import { Badge, Button, EmptyState } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import type { SearchParams } from "@/lib/nav";
import { hrefWith, parseSearchParams } from "@/lib/search-params";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice, Notice } from "@/components/notices";
import { ProductGrid } from "@/components/product-card";
import { MobileFilters, SearchFilters, SortSelect } from "./filters";

/**
 * Shared results block for /search, /categories/[slug], /brands/[slug], /stores/[slug].
 * All state lives in the URL; filters/sort/pagination are links or router pushes.
 */
export async function SearchResults({
  basePath,
  searchParams,
  fixed = {},
  hide = {},
}: {
  basePath: string;
  searchParams: SearchParams;
  fixed?: Partial<SearchQueryInput>;
  hide?: Partial<Record<"category" | "brand" | "retailer", boolean>>;
}) {
  const query = parseSearchParams(searchParams, fixed);
  const api = await serverApi({ revalidate: 120 });
  const res = await load(() => api.search.search(query));

  if (!res.ok) return <ApiErrorPanel error={res.error} />;
  const data = res.data;
  const parsed = data.parsed;
  const parsedChips: string[] = [];
  if (parsed) {
    if (parsed.category) parsedChips.push(`Category: ${parsed.category.name}`);
    if (parsed.brand) parsedChips.push(`Brand: ${parsed.brand.name}`);
    if (parsed.minPriceCents !== null) parsedChips.push(`Over ${formatPrice(parsed.minPriceCents, { trimZeroCents: true })}`);
    if (parsed.maxPriceCents !== null) parsedChips.push(`Under ${formatPrice(parsed.maxPriceCents, { trimZeroCents: true })}`);
    if (parsed.identifier) parsedChips.push(`${parsed.identifier.type}: ${parsed.identifier.value}`);
    if (parsed.url) parsedChips.push("Product URL");
  }
  const allDemo = data.items.length > 0 && data.items.every((p) => p.hasDemoData);

  return (
    <div className="flex gap-8">
      <SearchFilters facets={data.facets} hide={hide} />
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-3">
          {data.degraded ? (
            <Notice tone="warning" testId="degraded-notice">
              Search is running in reduced mode (our search index is offline), so typo tolerance and relevance ranking are limited. Results
              are still real.
            </Notice>
          ) : null}
          {allDemo ? <DemoNotice /> : null}
          {parsedChips.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="parsed-chips">
              <span className="inline-flex items-center gap-1 text-text-muted">
                <Sparkles aria-hidden className="size-4" /> We understood:
              </span>
              {parsedChips.map((c) => (
                <Badge key={c} variant="primary" pill>
                  {c}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-muted" aria-live="polite">
              <span className="price font-semibold text-text">{data.total.toLocaleString("en-US")}</span> {data.total === 1 ? "product" : "products"}
              {query.q ? (
                <>
                  {" "}
                  for <span className="font-medium text-text">“{query.q}”</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <MobileFilters facets={data.facets} hide={hide} />
              <SortSelect />
            </div>
          </div>
        </div>

        {data.items.length === 0 ? (
          <EmptyState
            icon={<SearchX aria-hidden />}
            title="No products match"
            description={query.q ? "Try fewer words, check the spelling, or remove some filters." : "Try removing some filters."}
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={query.q ? `/search?q=${encodeURIComponent(query.q)}` : basePath}>Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <ProductGrid products={data.items} withSidebar testId="search-results" />
        )}

        <LinkPagination page={data.page} pageCount={data.totalPages} hrefFor={(p) => hrefWith(basePath, searchParams, { page: p })} />
      </div>
    </div>
  );
}
