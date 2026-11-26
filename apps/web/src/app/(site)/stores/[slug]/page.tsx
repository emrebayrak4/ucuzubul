import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@pricora/ui";
import { BrandMark } from "@/components/brand-mark";
import { formatPrice } from "@pricora/ui/utils";
import { getRetailer } from "@/lib/loaders";
import { first, type SearchParams } from "@/lib/nav";
import { hasFacetParams } from "@/lib/search-params";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { SearchResults } from "@/components/search/search-results";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await getRetailer(slug);
  const page = Number(first(sp.page) ?? "1");
  const name = res.ok ? res.data.retailer.name : slug;
  return {
    title: `${name} prices compared${page > 1 ? ` (page ${page})` : ""}`,
    description: `Products sold at ${name}, compared with other US stores — price history, shipping and estimated tax.`,
    alternates: { canonical: `/stores/${slug}${page > 1 ? `?page=${page}` : ""}` },
    robots: !res.ok || hasFacetParams(sp) ? { index: false, follow: true } : undefined,
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
  const { retailer, topCategories } = res.data;
  const status = statusLabel[retailer.integrationStatus] ?? statusLabel.disabled!;
  return (
    <div className="container-content py-6">
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: retailer.name, path: `/stores/${slug}` }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Stores" }, { label: retailer.name }]} />
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
      {topCategories.length ? (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label="Top categories at this store">
          {topCategories.map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}?retailer=${slug}`} className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-sm hover:bg-surface-2">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <SearchResults basePath={`/stores/${slug}`} searchParams={sp} fixed={{ retailer: [slug] }} hide={{ retailer: true }} />
    </div>
  );
}
