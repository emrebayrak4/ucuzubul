import Link from "next/link";
import { SearchX, Sparkles } from "lucide-react";
import type { SearchQueryInput } from "@pricora/contracts";
import { Badge, Button, CategoryIcon } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";
import { getZip, load, serverApi } from "@/lib/api-server";
import type { SearchParams } from "@/lib/nav";
import { hrefWith, parseSearchParams, viewMode } from "@/lib/search-params";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice, Notice } from "@/components/notices";
import { ProductResults } from "@/components/product-card";
import { ProductCardRail } from "@/components/rail";
import { AppliedFilters, MobileFilters, SearchFilters, SortSelect, ViewToggle } from "./filters";

/**
 * Shared results block for /search, /categories/[slug], /brands/[slug], /stores/[slug].
 * All state lives in the URL (filters, sort, page, view) → back/refresh safe and shareable.
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
  const zip = await getZip();
  // Shopper ZIP (cookie) enables "Near me", distance sort and the nearest-store line on cards.
  const query = { ...parseSearchParams(searchParams, fixed), ...(zip ? { zip } : {}) };
  const view = viewMode(searchParams);
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
  const anyDemo = data.items.some((p) => p.hasDemoData);
  const didYouMean = data.didYouMean;

  return (
    <div className="flex gap-6">
      <SearchFilters facets={data.facets} hide={hide} />
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-3">
          {data.degraded ? (
            <Notice tone="warning" testId="degraded-notice">
              Search is running in reduced mode (our search index is offline), so typo tolerance and relevance ranking are limited. Results
              are still real.
            </Notice>
          ) : null}
          {anyDemo ? <DemoNotice /> : null}
          {didYouMean && query.q ? (
            <p className="text-sm" data-testid="did-you-mean">
              Did you mean{" "}
              <Link href={`/search?q=${encodeURIComponent(didYouMean)}`} className="font-semibold text-primary underline underline-offset-2">
                {didYouMean}
              </Link>
              ?
            </p>
          ) : null}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-sm text-text-muted" aria-live="polite" data-testid="result-count">
              <span className="price font-bold text-text">{data.total.toLocaleString("en-US")}</span> {data.total === 1 ? "product" : "products"}
              {query.q ? (
                <>
                  {" "}
                  for <span className="font-medium text-text">“{query.q}”</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <MobileFilters facets={data.facets} hide={hide} total={data.total} />
              <SortSelect />
              <ViewToggle />
            </div>
          </div>
          <AppliedFilters facets={data.facets} hide={hide} />
        </div>

        {data.items.length === 0 ? (
          <ZeroResults q={query.q ?? null} basePath={basePath} didYouMean={didYouMean} hasFilters={Boolean(Object.keys(searchParams).some((k) => k !== "q" && k !== "page" && k !== "view"))} />
        ) : (
          <ProductResults products={data.items} view={view} testId="search-results" />
        )}

        <LinkPagination page={data.page} pageCount={data.totalPages} hrefFor={(p) => hrefWith(basePath, searchParams, { page: p })} />
      </div>
    </div>
  );
}

/** Zero-results page: spelling fix, filter reset, popular categories and trending products as alternatives. */
async function ZeroResults({ q, basePath, didYouMean, hasFilters }: { q: string | null; basePath: string; didYouMean: string | null; hasFilters: boolean }) {
  const api = await serverApi({ revalidate: 300 });
  const [cats, trending] = await Promise.all([load(() => api.catalog.categories()), load(() => api.search.trending())]);
  const topCats = cats.ok ? cats.data.items.filter((c) => c.productCount > 0).slice(0, 8) : [];
  return (
    <div className="flex flex-col gap-8" data-testid="zero-results">
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <SearchX aria-hidden className="mx-auto size-10 text-text-muted" />
        <h2 className="mt-3 text-lg font-bold">{q ? `No products match “${q}”` : "No products match these filters"}</h2>
        <ul className="mx-auto mt-2 max-w-md space-y-1 text-sm text-text-muted">
          {didYouMean ? (
            <li>
              Try{" "}
              <Link href={`/search?q=${encodeURIComponent(didYouMean)}`} className="font-semibold text-primary underline">
                {didYouMean}
              </Link>
            </li>
          ) : null}
          {q ? <li>Use fewer or more general words (e.g. “oled tv” instead of a full model number).</li> : null}
          {hasFilters ? <li>Remove some filters — the counts next to each option show what&apos;s available.</li> : null}
        </ul>
        <div className="mt-4 flex justify-center gap-2">
          {hasFilters ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={q ? `/search?q=${encodeURIComponent(q)}` : basePath}>Clear filters</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <Link href="/deals">Browse today&apos;s deals</Link>
          </Button>
        </div>
      </div>
      {topCats.length ? (
        <section aria-labelledby="zr-cats">
          <h2 id="zr-cats" className="mb-3 text-lg font-bold">
            Popular categories
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {topCats.map((c) => (
              <li key={c.id}>
                <Link href={`/categories/${c.slug}`} className="flex items-center gap-2 rounded-md border border-border bg-surface p-3 text-sm font-medium hover:border-primary">
                  <CategoryIcon category={c.slug} size={20} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="price text-xs text-text-muted">{c.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {trending.ok && trending.data.products.length ? <ProductCardRail title="Popular right now" products={trending.data.products} /> : null}
    </div>
  );
}
