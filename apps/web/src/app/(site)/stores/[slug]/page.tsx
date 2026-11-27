import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@pricora/ui";
import { BrandMark } from "@/components/brand-mark";
import { formatPrice } from "@pricora/ui/utils";
import { getRetailer } from "@/lib/loaders";
import type { SearchParams } from "@/lib/nav";
import { listingSeo, metaDescription, metaTitle, pageParam } from "@/lib/seo";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { CategoryBreakdown } from "@/components/catalog/category-breakdown";
import { StorePaymentOptions } from "@/components/catalog/store-payment-options";
import { SearchResults } from "@/components/search/search-results";
import { CouponCard, FollowStoreButton } from "@/components/coupons/coupon-card";
import { load, serverApi } from "@/lib/api-server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getRetailer(slug);
  const page = pageParam(sp);
  const name = res.ok ? res.data.retailer.name : slug;
  const seo = listingSeo(`/stores/${slug}`, sp);
  return {
    title: metaTitle(`${name} prices compared${page > 1 ? ` (page ${page})` : ""}`),
    description: metaDescription(`Products sold at ${name}, compared with other US stores — price history, shipping, estimated tax and ${name} coupons.`),
    alternates: { canonical: seo.canonical },
    robots: !res.ok ? { index: false, follow: true } : seo.robots,
  };
}

const statusLabel: Record<string, { label: string; variant: "success" | "neutral" | "warning" }> = {
  live: { label: "Live prices", variant: "success" },
  pending_configuration: { label: "Not connected", variant: "neutral" },
  error: { label: "Connection issue", variant: "warning" },
  disabled: { label: "Disabled", variant: "neutral" },
};

export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getRetailer(slug);
  if (!res.ok) {
    return (
      <div className="container-content py-6">
        <ApiErrorPanel error={res.error} />
      </div>
    );
  }
  const { retailer } = res.data;
  const couponApi = await serverApi({ revalidate: 300 });
  const coupons = await load(() => couponApi.coupons.forRetailer(slug, { pageSize: 6, sort: "popular" }));
  const status = statusLabel[retailer.integrationStatus] ?? statusLabel.disabled!;
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: retailer.name, path: `/stores/${slug}` }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Stores", href: "/sitemap#stores" }, { label: retailer.name }]} />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <BrandMark name={retailer.name} logoUrl={retailer.logoUrl} brandColor={retailer.brandColor} size="lg" className="border border-border" />
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {retailer.name} <Badge variant={status.variant}>{status.label}</Badge>
          </h1>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-text-muted">
            <span>
              <span className="price">{retailer.offerCount.toLocaleString("en-US")}</span> offers tracked
            </span>
            {retailer.freeShippingThresholdCents !== null ? (
              <span>
                Free shipping over <span className="price">{formatPrice(retailer.freeShippingThresholdCents, { trimZeroCents: true })}</span>
              </span>
            ) : null}
            {retailer.membershipName ? <span>Membership: {retailer.membershipName}</span> : null}
            <a href={retailer.websiteUrl} target="_blank" rel="noopener nofollow" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
              {retailer.domain} <ExternalLink aria-hidden className="size-3" />
            </a>
            {retailer.returnPolicyUrl ? (
              <a href={retailer.returnPolicyUrl} target="_blank" rel="noopener nofollow" className="text-primary underline underline-offset-2">
                Return policy
              </a>
            ) : null}
          </p>
        </div>
      </div>
      {retailer.affiliateDisclosure ? <p className="mb-4 max-w-3xl text-xs text-text-muted">{retailer.affiliateDisclosure}</p> : null}
      <CategoryBreakdown items={res.data.categoryBreakdown ?? []} param="retailer" value={slug} name={retailer.name} />
      <StorePaymentOptions storeName={retailer.name} options={res.data.paymentOptions ?? []} />
      {coupons.ok ? (
        <section aria-labelledby="store-coupons" className="mb-(--pc-section-gap) rounded-lg border border-border bg-surface-2 p-4" data-testid="store-coupons">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="store-coupons" className="text-lg font-bold">
              {retailer.name} coupons
            </h2>
            <div className="flex items-center gap-3">
              {coupons.data.total > coupons.data.items.length ? (
                <Link href={`/coupons?retailer=${slug}`} className="text-sm font-semibold text-primary hover:underline">
                  All {coupons.data.total} coupons
                </Link>
              ) : null}
              <FollowStoreButton retailerSlug={slug} retailerName={retailer.name} />
            </div>
          </div>
          {coupons.data.items.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {coupons.data.items.map((c) => (
                <li key={c.id}>
                  <CouponCard coupon={c} showStore={false} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No verified coupons for this store yet. Follow the store to get notified when one appears.</p>
          )}
        </section>
      ) : null}
      <SearchResults basePath={`/stores/${slug}`} searchParams={sp} fixed={{ retailer: [slug] }} hide={{ retailer: true }} />
    </div>
  );
}
