import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { CouponListQuery } from "@pricora/contracts";
import { EmptyState } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { BrandMark } from "@/components/brand-mark";
import { CouponCard, FollowStoreButton } from "@/components/coupons/coupon-card";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice } from "@/components/notices";
import { LinkTabs, UrlSelect } from "@/components/url-controls";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const facet = Boolean(first(sp.retailer) || first(sp.category) || first(sp.sort) || first(sp.page));
  return {
    title: "Coupons & promo codes",
    description: "Coupon codes and deals from US stores, with real success reports from shoppers. Expired codes are removed.",
    alternates: { canonical: "/coupons" },
    robots: facet ? { index: false, follow: true } : undefined,
  };
}

const sorts = [
  { value: "newest", label: "Newest" },
  { value: "expiring", label: "Expiring soon" },
  { value: "popular", label: "Most used" },
] as const;

export default async function CouponsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const parsed = CouponListQuery.safeParse({ retailer: first(sp.retailer) || undefined, category: first(sp.category) || undefined, sort: first(sp.sort) || undefined, page: first(sp.page), pageSize: 24 });
  const query = parsed.success ? parsed.data : CouponListQuery.parse({ pageSize: 24 });
  const api = await serverApi({ revalidate: 300 });
  const [res, stores, cats] = await Promise.all([load(() => api.coupons.list(query)), load(() => api.catalog.retailers()), load(() => api.catalog.categories())]);
  const href = (o: Record<string, string | number | undefined>) =>
    "/coupons" + toQueryString({ retailer: query.retailer, category: query.category, sort: query.sort === "newest" ? undefined : query.sort, ...o });
  const storeList = stores.ok ? stores.data.items.slice().sort((a, b) => b.offerCount - a.offerCount).slice(0, 14) : [];
  const selectedStore = stores.ok ? stores.data.items.find((s) => s.slug === query.retailer) : undefined;

  return (
    <div className="container-content py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Ticket aria-hidden className="size-6 text-primary" /> Coupons &amp; promo codes
          </h1>
          <p className="mt-1 text-sm text-text-muted">Success rates come only from real shopper reports — we never show made-up usage counts.</p>
        </div>
        {selectedStore ? <FollowStoreButton retailerSlug={selectedStore.slug} retailerName={selectedStore.name} /> : null}
      </div>

      {storeList.length ? (
        <nav aria-label="Filter by store" className="mt-5">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" data-testid="coupon-store-chips">
            <li className="shrink-0">
              <Link
                href={href({ retailer: undefined, page: undefined })}
                aria-current={!query.retailer ? "page" : undefined}
                className={cn("flex h-10 items-center rounded-full border px-4 text-sm font-semibold", !query.retailer ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface hover:border-border-strong")}
              >
                All stores
              </Link>
            </li>
            {storeList.map((s) => (
              <li key={s.id} className="shrink-0">
                <Link
                  href={href({ retailer: s.slug, page: undefined })}
                  aria-current={query.retailer === s.slug ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full border py-1 pl-1.5 pr-4 text-sm font-semibold",
                    query.retailer === s.slug ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <BrandMark name={s.name} logoUrl={s.logoUrl} brandColor={s.brandColor} size="xs" className="rounded-full" />
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <div className="my-5 flex flex-wrap items-center justify-between gap-3">
        <LinkTabs label="Sort coupons" items={sorts.map((s) => ({ href: href({ sort: s.value === "newest" ? undefined : s.value, page: undefined }), label: s.label, active: query.sort === s.value }))} />
        {cats.ok ? <UrlSelect name="category" label="Category" allLabel="All categories" options={cats.data.items.map((c) => ({ value: c.slug, label: c.name }))} /> : null}
      </div>

      {!res.ok ? (
        res.error.status === 404 ? (
          <EmptyState icon={<Ticket aria-hidden />} title="Coupons are coming soon" description="We're connecting coupon sources. Verified codes will appear here." />
        ) : (
          <ApiErrorPanel error={res.error} />
        )
      ) : res.data.items.length === 0 ? (
        <EmptyState
          icon={<Ticket aria-hidden />}
          title={selectedStore ? `No verified coupons for ${selectedStore.name} yet` : "No verified coupons yet"}
          description="We only list codes from trusted sources and shopper reports. Follow a store to hear when one appears."
          action={selectedStore ? <FollowStoreButton retailerSlug={selectedStore.slug} retailerName={selectedStore.name} /> : undefined}
        />
      ) : (
        <>
          {res.data.items.every((c) => c.source === "demo") ? <DemoNotice className="mb-4" /> : null}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="coupon-grid">
            {res.data.items.map((c) => (
              <li key={c.id}>
                <CouponCard coupon={c} />
              </li>
            ))}
          </ul>
          <LinkPagination page={res.data.page} pageCount={res.data.totalPages} hrefFor={(p) => href({ page: p > 1 ? p : undefined })} />
        </>
      )}
    </div>
  );
}
