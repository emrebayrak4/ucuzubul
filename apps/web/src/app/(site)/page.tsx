import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, ChevronRight } from "lucide-react";
import { brand } from "@pricora/config/brand";
import type { DealItem } from "@pricora/contracts";
import { CategoryIcon } from "@pricora/ui";
import { BrandMark } from "@/components/brand-mark";
import { cn, formatCount } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { absoluteUrl } from "@/lib/env";
import { ApiErrorPanel } from "@/components/api-error";
import { JsonLd } from "@/components/json-ld";
import { DemoNotice } from "@/components/notices";
import { ProductCardTile } from "@/components/product-card";
import { ProductCardRail, Rail, UnderPriceRail } from "@/components/rail";
import { PersonalBand } from "@/components/recently-viewed";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — Compare prices across US stores, track drops, find flights & hotels` },
  description: brand.description,
  alternates: { canonical: "/" },
  openGraph: { title: brand.name, description: brand.description, url: "/" },
};

/** Soft circle colours for the category icon row (token-based, AA for the dark icon/text). */
const circleTones = [
  "bg-primary-soft",
  "bg-warning-soft",
  "bg-info-soft",
  "bg-success-soft",
  "bg-travel-soft",
  "bg-deal-good",
  "bg-deal-average",
  "bg-sponsored",
];

const promoTiles = [
  { href: "/deals", title: "Today's best deals", sub: "Ranked by real price history, not hype", cta: "Shop deals", cls: "bg-primary text-primary-fg", ctaCls: "bg-accent text-accent-fg" },
  { href: "/price-drops", title: "Biggest price drops", sub: "Prices that actually fell this week", cta: "See drops", cls: "bg-accent text-accent-fg", ctaCls: "bg-primary text-primary-fg" },
  { href: "/search?maxPrice=2500&sort=best_deal", title: "Under $25", sub: "Small prices, compared across stores", cta: "Browse", cls: "bg-warning-soft text-text", ctaCls: "bg-warning text-warning-fg" },
  { href: "/travel", title: "Flights & Hotels", sub: "Compare fares and rates in one search", cta: "Go to travel", cls: "bg-travel-soft text-travel-soft-fg", ctaCls: "bg-travel text-travel-fg" },
  { href: "/basket", title: "Smart Basket", sub: "Cheapest way to buy several items", cta: "Try it", cls: "bg-primary-soft text-primary-soft-fg", ctaCls: "bg-primary text-primary-fg" },
];

const discountTiles = [
  { href: "/search?minDiscount=0.1&sort=biggest_drop", big: "10%", small: "or more off" },
  { href: "/search?minDiscount=0.25&sort=biggest_drop", big: "25%", small: "or more off" },
  { href: "/search?minDiscount=0.5&sort=biggest_drop", big: "50%", small: "or more off" },
  { href: "/deals", big: "All", small: "deals" },
];

function nearLow(d: DealItem): boolean {
  const r = d.dealScore.reasons.find((x) => x.factor === "near_all_time_low");
  return Boolean(r && r.weight > 0 && r.points / r.weight >= 0.8);
}

function Band({ tone, children, testId }: { tone: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className={cn("py-6", tone)} data-testid={testId}>
      <div className="container-content">{children}</div>
    </section>
  );
}

export default async function HomePage() {
  const api = await serverApi({ revalidate: 300 });
  const [home, cats] = await Promise.all([load(() => api.catalog.home()), load(() => api.catalog.categories())]);
  const categories = cats.ok ? cats.data.items : [];
  const lowestAll = home.ok ? home.data.bestDeals.filter(nearLow) : [];
  // Show the "near lowest" band only when it has enough items, and never repeat them in "Today's best deals".
  const lowest = lowestAll.length >= 4 ? lowestAll : [];
  const lowestIds = new Set(lowest.map((d) => d.product.id));
  const bestDeals = home.ok ? home.data.bestDeals.filter((d) => !lowestIds.has(d.product.id)) : [];
  // Popular brands: top brands by product count (global search facet), logos from the brand endpoint.
  const facet = await load(() => api.search.search({ pageSize: 1 }));
  const topBrandSlugs = facet.ok ? facet.data.facets.brands.slice(0, 12) : [];
  const brandDetails = await Promise.all(topBrandSlugs.map((b) => load(() => api.catalog.brand(b.value))));
  const brands = topBrandSlugs.map((b, i) => {
    const d = brandDetails[i];
    return { slug: b.value, name: d?.ok ? d.data.brand.name : b.label, logoUrl: d?.ok ? d.data.brand.logoUrl : null, count: b.count };
  });

  return (
    <div className="flex flex-col gap-8 pb-4 pt-5">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: brand.name,
          url: absoluteUrl("/"),
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/search?q={search_term_string}") },
            "query-input": "required name=search_term_string",
          },
        }}
      />
      {home.ok && home.data.hasDemoData ? (
        <div className="container-content -mb-3">
          <DemoNotice />
        </div>
      ) : null}

      {/* Promo tiles */}
      <section aria-label="Featured" className="container-content">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {promoTiles.map((t, i) => (
            <li key={t.href} className={i === 0 ? "col-span-2 md:col-span-1" : undefined}>
              <Link href={t.href} className={cn("group flex h-full min-h-40 flex-col justify-between gap-4 rounded-lg p-4 transition-shadow hover:shadow-md", t.cls)} data-testid="promo-tile">
                <span>
                  <span className="block text-lg font-bold leading-tight tracking-tight lg:text-xl">{t.title}</span>
                  <span className="mt-1 block text-sm opacity-90">{t.sub}</span>
                </span>
                <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold", t.ctaCls)}>
                  {t.cta} <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Category icon circles */}
      {categories.length ? (
        <nav aria-label="Shop by category" className="container-content">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-8 md:gap-y-4 md:px-0" data-testid="category-circles">
            {categories.slice(0, 16).map((c, i) => (
              <li key={c.id} className="w-20 shrink-0 md:w-auto">
                <Link href={`/categories/${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
                  <span className={cn("flex size-16 items-center justify-center rounded-full transition-transform group-hover:scale-105", circleTones[i % circleTones.length])}>
                    <CategoryIcon category={c.slug} size={28} className="text-text opacity-100" />
                  </span>
                  <span className="line-clamp-2 text-xs font-medium leading-tight text-text group-hover:text-primary">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {!home.ok ? (
        <div className="container-content">
          <ApiErrorPanel error={home.error} />
        </div>
      ) : (
        <>
          {lowest.length ? (
            <Band tone="bg-primary-soft" testId="band-lowest-90">
              <Rail title="Near the lowest price we've tracked" description="Current price within reach of the all-time low in our history" seeAllHref="/deals" testId="rail-lowest">
                {lowest.map((d) => (
                  <ProductCardTile key={d.product.id} product={{ ...d.product, dealScore: d.dealScore.score }} storeName={d.offer.retailer.name} storeLogoUrl={d.offer.retailer.logoUrl} />
                ))}
              </Rail>
            </Band>
          ) : null}

          {bestDeals.length ? (
            <Band tone="bg-success-soft" testId="band-best-deals">
              <Rail title="Today's best deals" description="Ranked by Deal Score — price vs. its own history and other stores" seeAllHref="/deals" testId="rail-best-deals">
                {bestDeals.map((d) => (
                  <ProductCardTile key={d.product.id} product={{ ...d.product, dealScore: d.dealScore.score }} storeName={d.offer.retailer.name} storeLogoUrl={d.offer.retailer.logoUrl} />
                ))}
              </Rail>
            </Band>
          ) : null}

          {/* Discount buckets + alerts CTA */}
          <section className="container-content grid gap-4 lg:grid-cols-12">
            <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-7">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Shop by discount</h2>
                <Link href="/deals" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
                  All deals <ChevronRight aria-hidden className="size-4" />
                </Link>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="discount-tiles">
                {discountTiles.map((t) => (
                  <li key={t.href}>
                    <Link href={t.href} className="flex aspect-[4/3] flex-col items-center justify-center rounded-md bg-accent text-accent-fg ring-1 ring-inset ring-border transition-shadow hover:shadow-md">
                      <span className="price text-3xl font-bold leading-none">{t.big}</span>
                      <span className="mt-1 text-sm font-medium">{t.small}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-text-muted">Discounts are measured against each product&apos;s own tracked price history — never an invented “was” price.</p>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-lg bg-primary p-5 text-primary-fg lg:col-span-5">
              <div>
                <BellRing aria-hidden className="size-6" />
                <h2 className="mt-2 text-xl font-bold">Get notified when prices drop</h2>
                <p className="mt-1 text-sm opacity-90">Set a target price on any product. We email you when a store hits it — free.</p>
              </div>
              <Link href="/account/alerts" className="inline-flex w-fit items-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
                Set a price alert <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </section>

          {home.data.priceDrops.length ? (
            <Band tone="bg-warning-soft" testId="band-price-drops">
              <Rail title="Biggest price drops" description="Previous vs. current price at the same store" seeAllHref="/price-drops" testId="rail-price-drops">
                {home.data.priceDrops.map((d) => (
                  <ProductCardTile
                    key={d.product.id + d.retailer.slug}
                    product={{ ...d.product, lowestPriceCents: d.currentPriceCents }}
                    dropPercent={Math.round(d.dropRatio * 100)}
                    previousPriceCents={d.previousPriceCents}
                    storeName={d.retailer.name}
                    storeIsLowest={false}
                  />
                ))}
              </Rail>
            </Band>
          ) : null}

          <div className="container-content flex flex-col gap-8">
            <ProductCardRail title="Trending now" description="Most viewed and searched this week" seeAllHref="/search?sort=popular" products={home.data.trending} testId="rail-trending" />
            <UnderPriceRail
              groups={[
                { key: "25", label: "$25", maxCents: 2500, products: home.data.under25 },
                { key: "50", label: "$50", maxCents: 5000, products: home.data.under50 },
                { key: "100", label: "$100", maxCents: 10000, products: home.data.under100 },
              ]}
            />
          </div>

          <PersonalBand />

          {home.data.topCategories.length ? (
            <section aria-labelledby="popular-cats" className="container-content">
              <h2 id="popular-cats" className="mb-3 text-xl font-semibold tracking-tight">
                Popular categories
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8">
                {home.data.topCategories.map((c, i) => (
                  <li key={c.id}>
                    <Link href={`/categories/${c.slug}`} className="flex h-full flex-col items-center gap-2 rounded-md border border-border bg-surface p-4 text-center transition-shadow hover:shadow-md">
                      <span className={cn("flex size-12 items-center justify-center rounded-full", circleTones[i % circleTones.length])}>
                        <CategoryIcon category={c.slug} size={24} className="text-text opacity-100" />
                      </span>
                      <span className="text-sm font-medium leading-tight">{c.name}</span>
                      <span className="price text-xs text-text-muted">{formatCount(c.productCount)} products</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {brands.length ? (
            <section aria-labelledby="popular-brands" className="container-content">
              <h2 id="popular-brands" className="mb-3 text-xl font-semibold tracking-tight">
                Popular brands
              </h2>
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" data-testid="brand-row">
                {brands.map((b) => (
                  <li key={b.slug}>
                    <Link href={`/brands/${b.slug}`} className="flex h-full flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-surface p-3 text-center transition-shadow hover:shadow-md">
                      <BrandMark name={b.name} logoUrl={b.logoUrl} size="md" />
                      <span className="w-full truncate text-xs font-medium">{b.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {home.data.retailers.length ? (
            <Band tone="bg-surface-2">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="popular-stores" className="text-xl font-semibold tracking-tight">
                  Popular stores
                </h2>
                <span className="text-xs text-text-muted">Offer counts are live from our catalog</span>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-labelledby="popular-stores">
                {home.data.retailers.map((r) => (
                  <li key={r.id}>
                    <Link href={`/stores/${r.slug}`} className="flex h-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-surface p-4 text-center transition-shadow hover:shadow-md" data-testid="store-card">
                      <BrandMark name={r.name} logoUrl={r.logoUrl} brandColor={r.brandColor} size="lg" />
                      <span className="w-full truncate text-sm font-semibold">{r.name}</span>
                      <span className="price text-xs text-text-muted">{formatCount(r.offerCount)} offers</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Band>
          ) : null}

          {home.data.trending.length === 0 && home.data.bestDeals.length === 0 && home.data.priceDrops.length === 0 && home.data.under100.length === 0 ? (
            <p className="container-content rounded-md border border-border bg-surface p-6 text-center text-sm text-text-muted">
              No products have been added yet. Once stores are connected, trending products and deals will appear here.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
