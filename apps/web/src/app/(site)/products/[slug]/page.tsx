import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Info, PackageX } from "lucide-react";
import type { ProductDetailResponse } from "@pricora/contracts";
import { Badge, DealScoreBadge, DemoDataBadge, EmptyState, PriceTag } from "@pricora/ui";
import { getZip, hasSessionCookie } from "@/lib/api-server";
import { absoluteUrl } from "@/lib/env";
import { absolute, conditionLabel, formatPrice, isStale, relative } from "@/lib/format";
import { getProduct } from "@/lib/loaders";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { DemoNotice, Notice } from "@/components/notices";
import { ProductCardRail } from "@/components/rail";
import { Gallery } from "@/components/product/gallery";
import { OfferTable, goHref, outboundRel } from "@/components/product/offer-table";
import { PriceHistory } from "@/components/product/price-history";
import { AlertDialogButton, ProductIconActions, type ActionProduct } from "@/components/product/product-actions";
import { SetZipButton } from "@/components/zip-provider";

type Props = { params: Promise<{ slug: string }> };

async function fetchProduct(slug: string) {
  const [zip, session] = await Promise.all([getZip(), hasSessionCookie()]);
  return { res: await getProduct(slug, zip, session), zip };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { res } = await fetchProduct(slug);
  if (!res.ok) return { title: "Product", robots: { index: false, follow: true } };
  const { product, storeCount } = res.data;
  const img = product.images[0];
  const desc =
    product.description?.slice(0, 155) ??
    `Compare ${product.title} prices${storeCount ? ` across ${storeCount} stores` : ""}, with price history, shipping and estimated tax.`;
  return {
    title: `${product.title} — price comparison`,
    description: desc,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      title: product.title,
      description: desc,
      url: `/products/${product.slug}`,
      images: img ? [{ url: img.url, alt: img.alt || product.title }] : undefined,
    },
  };
}

function productJsonLd(d: ProductDetailResponse): Record<string, unknown> {
  const p = d.product;
  const gtin = p.identifiers.find((i) => i.type === "GTIN" || i.type === "UPC" || i.type === "EAN");
  // Only real (non-demo) offers are exposed to search engines. No Review / AggregateRating (we have none).
  const real = d.offers.filter((o) => o.source !== "demo");
  const prices = real.map((o) => o.priceCents);
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    url: absoluteUrl(`/products/${p.slug}`),
    image: p.images.map((i) => i.url),
    description: p.description ?? undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand.name } : undefined,
    mpn: p.mpn ?? undefined,
    model: p.model ?? undefined,
    gtin: gtin?.value,
    itemCondition: `https://schema.org/${p.condition === "new" ? "NewCondition" : p.condition === "used" ? "UsedCondition" : "RefurbishedCondition"}`,
  };
  if (prices.length) {
    data.offers = {
      "@type": "AggregateOffer",
      priceCurrency: real[0]!.currency,
      lowPrice: (Math.min(...prices) / 100).toFixed(2),
      highPrice: (Math.max(...prices) / 100).toFixed(2),
      offerCount: real.length,
    };
  }
  return data;
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const { res, zip } = await fetchProduct(slug);
  if (!res.ok) {
    return (
      <div className="container-content py-6">
        <ApiErrorPanel error={res.error} />
      </div>
    );
  }
  const d = res.data;
  const p = d.product;
  const lowest = d.offers.find((o) => o.id === d.lowestOfferId) ?? null;
  const currency = lowest?.currency ?? "USD";
  const crumbs = [
    { label: "Home", href: "/" },
    ...p.breadcrumbs.map((b) => ({ label: b.name, href: `/categories/${b.slug}` })),
    { label: p.title },
  ];
  const upc = p.identifiers.find((i) => i.type === "UPC" || i.type === "GTIN" || i.type === "EAN");
  const actionProduct: ActionProduct = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    imageUrl: p.images[0]?.url ?? null,
    lowestPriceCents: lowest?.priceCents ?? d.priceStats.currentLowestCents,
    currency,
    hasDemoData: d.hasDemoData,
  };
  const allDemo = d.offers.length > 0 && d.offers.every((o) => o.source === "demo");
  const stale = isStale(d.lastUpdatedAt);
  const attrGroups = new Map<string, typeof p.attributes>();
  for (const a of p.attributes) {
    const g = a.group ?? "Specifications";
    attrGroups.set(g, [...(attrGroups.get(g) ?? []), a]);
  }
  const variantGroups = new Map<string, typeof p.variants>();
  for (const v of p.variants) {
    const key = Object.keys(v.attributes)[0] ?? "Variant";
    variantGroups.set(key, [...(variantGroups.get(key) ?? []), v]);
  }

  return (
    <div className="container-content py-6">
      <JsonLd data={productJsonLd(d)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          ...p.breadcrumbs.map((b) => ({ name: b.name, path: `/categories/${b.slug}` })),
          { name: p.title, path: `/products/${p.slug}` },
        ])}
      />
      <Crumbs items={crumbs} />
      {allDemo ? <DemoNotice className="mb-4" /> : null}

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Gallery images={p.images} title={p.title} category={p.category?.slug ?? null} slug={p.slug} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <div>
            {p.brand ? (
              <Link href={`/brands/${p.brand.slug}`} className="text-xs font-medium uppercase tracking-wide text-text-muted hover:text-text">
                {p.brand.name}
              </Link>
            ) : null}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text" data-testid="product-title">
              {p.title}
            </h1>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              {p.model ? (
                <span>
                  Model <span className="font-mono text-text">{p.model}</span>
                </span>
              ) : null}
              {p.mpn ? (
                <span>
                  MPN <span className="font-mono text-text">{p.mpn}</span>
                </span>
              ) : null}
              {upc ? (
                <span>
                  {upc.type} <span className="font-mono text-text">{upc.value}</span>
                </span>
              ) : null}
              <Badge size="sm" variant="outline">
                {conditionLabel[p.condition]}
              </Badge>
            </p>
          </div>

          {variantGroups.size ? (
            <div className="flex flex-col gap-2">
              {Array.from(variantGroups.entries()).map(([key, list]) => (
                <div key={key}>
                  <p className="mb-1 text-xs font-medium capitalize text-text-muted">{key}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {list.map((v) => (
                      <li key={v.slug}>
                        <Link
                          href={`/products/${v.slug}`}
                          aria-current={v.current ? "page" : undefined}
                          className={
                            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm " +
                            (v.current ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface hover:bg-surface-2")
                          }
                        >
                          {v.label}
                          {v.lowestPriceCents !== null && !v.current ? <PriceTag cents={v.lowestPriceCents} size="sm" className="text-xs" /> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-surface p-4" data-testid="price-summary">
            {lowest ? (
              <>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                  <div>
                    <p className="text-xs text-text-muted">Lowest price</p>
                    <PriceTag cents={lowest.priceCents} currency={currency} size="xl" tone="primary" data-testid="lowest-price" />
                  </div>
                  <div className="pb-1 text-sm text-text-muted">
                    at <span className="price font-medium text-text">{d.storeCount}</span> {d.storeCount === 1 ? "store" : "stores"} · lowest at{" "}
                    <span className="font-medium text-text">{lowest.retailer.name}</span>
                  </div>
                  {d.dealScore ? <DealScoreBadge score={d.dealScore.score} tier={d.dealScore.tier} className="mb-1.5" /> : null}
                  {d.hasDemoData ? <DemoDataBadge className="mb-1.5" /> : null}
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  Est. total <span className="price font-semibold text-text">{formatPrice(lowest.estimatedTotalCents, { currency })}</span>{" "}
                  {lowest.tax.status === "unknown_set_zip" ? (
                    <>
                      (excl. tax · <SetZipButton label="set ZIP for tax" />)
                    </>
                  ) : zip ? (
                    <>incl. est. tax for ZIP {zip}</>
                  ) : null}
                </p>
                <p className={"mt-1 text-xs " + (stale ? "text-warning" : "text-text-muted")} title={absolute(d.lastUpdatedAt)}>
                  Updated {relative(d.lastUpdatedAt)}
                  {stale ? " · Price may have changed" : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-muted">No store currently lists this product.</p>
            )}

            {d.dealScore ? (
              <div className="mt-4 border-t border-border pt-3" data-testid="deal-score">
                <p className="text-sm font-medium">Why this Deal Score</p>
                {d.dealScore.confidence < 0.5 ? <p className="text-xs text-text-muted">Limited price history — score confidence is low.</p> : null}
                <ul className="mt-1.5 space-y-1">
                  {d.dealScore.reasons.map((r) => (
                    <li key={r.factor} className="flex items-start justify-between gap-3 text-sm">
                      <span>{r.message}</span>
                      <span className="price shrink-0 text-xs text-text-muted">
                        {Math.round(r.points)}/{Math.round(r.weight)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {d.fakeDiscount.flag && d.fakeDiscount.message ? (
              <Notice tone="warning" className="mt-3" testId="fake-discount">
                {d.fakeDiscount.message}
              </Notice>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {lowest ? (
                <a
                  href={goHref(lowest, "pdp_summary")}
                  target="_blank"
                  rel={outboundRel}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  data-testid="visit-lowest"
                >
                  Visit {lowest.retailer.name} <ExternalLink aria-hidden className="size-4" />
                </a>
              ) : null}
              <AlertDialogButton product={actionProduct} />
              <ProductIconActions product={actionProduct} />
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="offers-title" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="offers-title" className="text-xl font-semibold tracking-tight">
            Compare {d.offers.length} {d.offers.length === 1 ? "offer" : "offers"}
          </h2>
          <p className="flex items-center gap-1 text-xs text-text-muted">
            <Info aria-hidden className="size-3.5" /> Sorted by lowest estimated total
          </p>
        </div>
        {d.offers.length ? (
          <OfferTable offers={d.offers} lowestOfferId={d.lowestOfferId} />
        ) : (
          <EmptyState icon={<PackageX aria-hidden />} title="No offers right now" description="Set a price alert and we'll tell you when a store lists it." action={<AlertDialogButton product={actionProduct} variant="secondary" />} />
        )}
      </section>

      <div className="mt-10">
        <PriceHistory slug={p.slug} initialStats={d.priceStats} currency={currency} hasDemoData={d.hasDemoData} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        <section aria-labelledby="specs-title" className="lg:col-span-7">
          <h2 id="specs-title" className="mb-3 text-xl font-semibold tracking-tight">
            Specifications
          </h2>
          {attrGroups.size ? (
            Array.from(attrGroups.entries()).map(([group, attrs]) => (
              <div key={group} className="mb-5">
                <h3 className="mb-1.5 text-sm font-semibold text-text-muted">{group}</h3>
                <dl className="divide-y divide-border rounded-md border border-border bg-surface">
                  {attrs.map((a) => (
                    <div key={a.name} className="grid grid-cols-2 gap-4 px-3 py-2 text-sm">
                      <dt className="text-text-muted">{a.name}</dt>
                      <dd>
                        {a.value}
                        {a.unit ? ` ${a.unit}` : ""}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))
          ) : (
            <p className="text-sm text-text-muted">No specifications available yet.</p>
          )}
        </section>
        <aside className="flex flex-col gap-6 lg:col-span-5">
          {p.description ? (
            <section aria-labelledby="desc-title">
              <h2 id="desc-title" className="mb-2 text-xl font-semibold tracking-tight">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-text">{p.description}</p>
            </section>
          ) : null}
          {p.identifiers.length ? (
            <section aria-labelledby="ids-title">
              <h2 id="ids-title" className="mb-2 text-lg font-semibold tracking-tight">
                Identifiers
              </h2>
              <dl className="divide-y divide-border rounded-md border border-border bg-surface text-sm">
                {p.identifiers.map((i) => (
                  <div key={i.type + i.value + (i.retailerSlug ?? "")} className="grid grid-cols-2 gap-4 px-3 py-2">
                    <dt className="text-text-muted">
                      {i.type}
                      {i.retailerSlug ? ` (${i.retailerSlug})` : ""}
                    </dt>
                    <dd className="font-mono text-xs">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </aside>
      </div>

      {d.related.length ? (
        <div className="mt-10">
          <ProductCardRail title="Similar products" products={d.related} />
        </div>
      ) : null}
    </div>
  );
}
