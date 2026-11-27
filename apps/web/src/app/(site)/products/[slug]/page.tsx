import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Info, PackageX } from "lucide-react";
import { Badge, CountUp, DealScoreBadge, DemoDataBadge, EmptyState, LiveDot, PriceDropBadge, PriceTag } from "@pricora/ui";
import { getZip, hasSessionCookie } from "@/lib/api-server";
import { TITLE_MAX, clampText, metaDescription, productJsonLd, realOffers, usd } from "@/lib/seo";
import { absolute, conditionLabel, formatPrice, isStale, relative } from "@/lib/format";
import { getProduct } from "@/lib/loaders";
import { ApiErrorPanel } from "@/components/api-error";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { DemoNotice, Notice } from "@/components/notices";
import { ProductCardRail } from "@/components/rail";
import { Gallery } from "@/components/product/gallery";
import { OfferTable } from "@/components/product/offer-table";
import { goHref, outboundRel } from "@/components/product/outbound";
import { PriceHistory } from "@/components/product/price-history";
import { AlertDialogButton, InlinePriceAlert, ProductIconActions, type ActionProduct } from "@/components/product/product-actions";
import { CompareWithList } from "@/components/product/alternatives";
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
  const { product, storeCount, offers } = res.data;
  const real = realOffers(offers);
  const low = real.length ? Math.min(...real.map((o) => o.priceCents)) : null;
  // Prices only appear in snippets when they come from real (non-demo) offers.
  const lead =
    low !== null
      ? `${product.title}: lowest price ${usd(low, real[0]!.currency)} across ${real.length} US ${real.length === 1 ? "store" : "stores"}.`
      : `Compare ${product.title} prices${storeCount ? ` across ${storeCount} US stores` : " across US stores"}.`;
  const desc = metaDescription(`${lead} Price history, shipping, estimated tax and an honest Deal Score.${product.description ? " " + product.description : ""}`);
  const path = `/products/${product.slug}`;
  return {
    // Keep the full product name (the entity) whenever possible; the "compare prices" suffix goes first.
    title: `${product.title} — compare prices`.length <= TITLE_MAX ? `${product.title} — compare prices` : clampText(product.title, 70),
    description: desc,
    alternates: { canonical: path, types: { "text/markdown": `/md${path}` } },
    openGraph: { type: "website", title: product.title, description: desc, url: path },
  };
}

const SOURCE_LABEL: Record<string, string> = {
  api: "retailer API",
  feed: "retailer product feed",
  merchant_upload: "merchant upload",
  affiliate: "affiliate network feed",
  demo: "demo data (not live prices)",
};

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
    conditions: (d.conditionSummary ?? []).map((c) => c.condition),
    defaultCondition: d.defaultCondition ?? "new",
    id: p.id,
    slug: p.slug,
    title: p.title,
    imageUrl: p.images[0]?.url ?? null,
    lowestPriceCents: lowest?.priceCents ?? d.priceStats.currentLowestCents,
    currency,
    hasDemoData: d.hasDemoData,
  };
  const allDemo = d.offers.length > 0 && d.offers.every((o) => o.source === "demo");
  const allOutOfStock = d.offers.length > 0 && d.offers.every((o) => o.stock === "out_of_stock");
  const sources = Array.from(new Set(d.offers.map((o) => o.source)));
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
      {allOutOfStock ? (
        <Notice tone="warning" className="mb-4" testId="out-of-stock">
          Out of stock at every store we track. Prices below are the last ones we saw — set an alert to hear when it&apos;s back.
        </Notice>
      ) : null}

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
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text" data-testid="answer-summary">
              {d.hasDemoData ? <span className="font-semibold">Demo data: </span> : null}
              {lowest ? (
                <>
                  {p.title} is listed at {d.storeCount} US {d.storeCount === 1 ? "store" : "stores"} we track. The lowest price right now is{" "}
                  <strong>{formatPrice(lowest.priceCents, { currency })}</strong> at {lowest.retailer.name}, last checked{" "}
                  <time dateTime={d.lastUpdatedAt}>{relative(d.lastUpdatedAt)}</time>.
                  {d.priceStats.allTimeLowCents !== null ? <> The lowest price we have recorded is {formatPrice(d.priceStats.allTimeLowCents, { currency })}.</> : null}
                  {d.dealScore ? <> Deal Score: {d.dealScore.score}/100 ({d.dealScore.tier}).</> : null}
                  {allOutOfStock ? <> It is currently out of stock at every store we track.</> : null}
                </>
              ) : (
                <>{p.title} isn&apos;t listed by any store we track right now. Set a price alert to hear when it is.</>
              )}
            </p>
          </div>

          {variantGroups.size ? (
            <div className="flex flex-col gap-2">
              {Array.from(variantGroups.entries()).map(([key, list]) => (
                <div key={key}>
                  <p className="mb-1 text-xs font-semibold capitalize text-text-muted">{key === "configuration" ? "Configuration" : key}</p>
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
                    <p className="text-xs text-text-muted" data-testid="lowest-price-label">
                      {(d.defaultCondition ?? "new") === "new" ? "Lowest new price" : `Lowest ${d.defaultCondition === "open_box" ? "open-box" : d.defaultCondition} price — no new offers`}
                    </p>
                    {d.previousLowestPriceCents && d.previousLowestPriceCents > lowest.priceCents ? (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <PriceTag cents={lowest.priceCents} previousCents={d.previousLowestPriceCents} currency={currency} size="xl" className="[&>.price]:text-price-drop" data-testid="lowest-price" />
                        <s className="price text-base text-text-muted">
                          <span className="sr-only">Previously </span>
                          {formatPrice(d.previousLowestPriceCents, { currency })}
                        </s>
                        <PriceDropBadge percent={Math.round(((d.previousLowestPriceCents - lowest.priceCents) / d.previousLowestPriceCents) * 100)} context="this week" />
                      </span>
                    ) : (
                      <PriceTag cents={lowest.priceCents} currency={currency} size="xl" tone="primary" data-testid="lowest-price" />
                    )}
                  </div>
                  <div className="pb-1 text-sm text-text-muted">
                    at <CountUp value={d.storeCount} className="price font-medium text-text" /> {d.storeCount === 1 ? "store" : "stores"} · lowest at{" "}
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
                <p className={"mt-1 flex flex-wrap items-center gap-2 text-sm " + (stale ? "text-warning" : "text-text-muted")} title={absolute(d.lastUpdatedAt)}>
                  <LiveDot updatedAt={d.lastUpdatedAt} showLabel={false} />
                  <span>
                    Updated {relative(d.lastUpdatedAt)}
                    {stale ? " · Price may have changed" : ""}
                  </span>
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
                  className="inline-flex h-9.5 items-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  data-testid="visit-lowest"
                >
                  Visit {lowest.retailer.name} <ExternalLink aria-hidden className="size-4" />
                </a>
              ) : null}
              <AlertDialogButton product={actionProduct} />
              <ProductIconActions product={actionProduct} />
            </div>
            <div className="mt-4">
              <InlinePriceAlert product={actionProduct} />
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="offers-title" className="mt-(--pc-section-gap)">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="offers-title" className="text-xl font-semibold tracking-tight">
            Compare {d.offers.length} {d.offers.length === 1 ? "offer" : "offers"}
          </h2>
          <p className="flex items-center gap-1 text-xs text-text-muted">
            <Info aria-hidden className="size-3.5" /> Sorted by lowest estimated total — click a column to re-sort
          </p>
        </div>
        {d.offers.length ? (
          <p className="mb-2 text-xs text-text-muted" data-testid="price-sources">
            Sources: {sources.map((src) => SOURCE_LABEL[src] ?? src).join(", ")} · prices in {currency}, last updated{" "}
            <time dateTime={d.lastUpdatedAt}>{absolute(d.lastUpdatedAt)}</time> ·{" "}
            <Link href="/how-we-compare" className="underline underline-offset-2">
              how we compare
            </Link>{" "}
            ·{" "}
            <a href={`/md/products/${p.slug}`} type="text/markdown" className="underline underline-offset-2">
              Markdown
            </a>
          </p>
        ) : null}
        {d.offers.length ? (
          <OfferTable offers={d.offers} lowestOfferId={d.lowestOfferId} coupons={d.coupons ?? []} defaultCondition={d.defaultCondition ?? "new"} conditionNote={d.conditionNote ?? null} />
        ) : (
          <EmptyState icon={<PackageX aria-hidden />} title="No offers right now" description="Set a price alert and we'll tell you when a store lists it." action={<AlertDialogButton product={actionProduct} variant="secondary" />} />
        )}
      </section>

      <div className="mt-(--pc-section-gap)">
        <PriceHistory
          slug={p.slug}
          initialStats={d.priceStats}
          currency={currency}
          hasDemoData={d.hasDemoData}
          defaultCondition={d.defaultCondition ?? "new"}
          conditions={(d.conditionSummary ?? []).map((c) => c.condition)}
        />
      </div>

      <div className="mt-(--pc-section-gap) grid gap-8 lg:grid-cols-12">
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

      {(d.alternatives ?? []).length ? (
        <div className="mt-(--pc-section-gap)">
          <CompareWithList current={{ id: p.id, title: p.title }} currentPriceCents={lowest?.priceCents ?? null} items={d.alternatives} />
        </div>
      ) : null}

      {d.related.length ? (
        <div className="mt-(--pc-section-gap)">
          <ProductCardRail title="Similar products" description="Same category, closest specs and price." products={d.related} testId="rail-similar" />
        </div>
      ) : null}
    </div>
  );
}
