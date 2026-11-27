import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, ChevronRight } from "lucide-react";
import { brand } from "@pricora/config/brand";
import type { DealItem } from "@pricora/contracts";
import { CategoryIcon } from "@pricora/ui";
import { BrandMark } from "@/components/brand-mark";
import { cn, formatCount } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import promoRaw from "@pricora/content/promo-photos.json";
import { CategoryCircle } from "@/components/catalog/category-circle";
import { PhotoCredit } from "@/components/photo-credit";
import { ApiErrorPanel } from "@/components/api-error";
import { JsonLd } from "@/components/json-ld";
import { DemoNotice } from "@/components/notices";
import { ProductCardTile } from "@/components/product-card";
import { ProductCardRail, Rail, UnderPriceRail } from "@/components/rail";
import { PersonalBand } from "@/components/recently-viewed";

const SHOP_DESCRIPTION = "Compare prices across US stores with shipping and estimated tax, real price history, honest Deal Scores, coupons and price alerts.";

export const metadata: Metadata = {
  title: { absolute: `${brand.name} — Compare US store prices & track price drops` },
  description: SHOP_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: brand.name, description: SHOP_DESCRIPTION, url: "/" },
};

/** Soft circle colours for the category icon row (token-based, AA for the dark icon/text). */
const circleTones = [
  "bg-primary-soft",
  "bg-warning-soft",
  "bg-info-soft",
  "bg-success-soft",
  "bg-error-soft",
  "bg-deal-good",
  "bg-deal-average",
  "bg-sponsored",
];

type PromoPhoto = { url: string; color?: string; alt?: string; photographer: string; photographerUrl: string; unsplashUrl: string };
const PROMO_PHOTOS = promoRaw as unknown as Record<string, PromoPhoto | undefined>;

const promoTiles = [
  { photo: "deals", href: "/deals", title: "Today's best deals", sub: "Ranked by real price history, not hype", cta: "Shop deals", cls: "bg-primary text-primary-fg", ctaCls: "bg-accent text-accent-fg" },
  { photo: "price-drops", href: "/price-drops", title: "Biggest price drops", sub: "Prices that actually fell this week", cta: "See drops", cls: "bg-accent text-accent-fg", ctaCls: "bg-primary text-primary-fg" },
  { photo: "under-25", href: "/search?maxPrice=2500&sort=best_deal", title: "Under $25", sub: "Small prices, compared across stores", cta: "Browse", cls: "bg-warning-soft text-text", ctaCls: "bg-warning text-warning-fg" },
  { photo: "coupons", href: "/coupons", title: "Coupons", sub: "Promo codes with real success reports", cta: "Get codes", cls: "bg-success-soft text-text", ctaCls: "bg-success text-success-fg" },
  { photo: "smart-basket", href: "/basket", title: "Smart Basket", sub: "Cheapest way to buy several items", cta: "Try it", cls: "bg-primary-soft text-primary-soft-fg", ctaCls: "bg-primary text-primary-fg" },
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
  // Cap it so "Today's best deals" (backfilled from the rest of the ranked list) keeps 10–20 items.
  const allDeals = home.ok ? home.data.bestDeals : [];
  const lowestCap = Math.max(0, Math.min(16, allDeals.length - 10));
  const lowest = lowestAll.length >= 4 ? lowestAll.slice(0, Math.max(4, lowestCap)) : [];
  const lowestIds = new Set(lowest.map((d) => d.product.id));
  const bestRest = allDeals.filter((d) => !lowestIds.has(d.product.id)).slice(0, 20);
  const bestDeals = bestRest.length >= 4 ? bestRest : [];

  return (
    <div className="section-stack pb-4 pt-6">
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
      {home.ok && home.data.hasDemoData ? (
        <div className="container-content -mb-3">
          <DemoNotice />
        </div>
      ) : null}

      {/* Promo tiles */}
      <section aria-label="Featured" className="container-content">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {promoTiles.map((t, i) => {
            const photo = PROMO_PHOTOS[t.photo];
            return (
              <li key={t.href} className={cn("relative", i === 0 && "col-span-2 md:col-span-1")}>
                <Link
                  href={t.href}
                  className={cn("hover-tilt group flex h-full min-h-40 flex-col overflow-hidden rounded-lg transition-shadow hover:shadow-md lg:flex-row", t.cls)}
                  data-testid="promo-tile"
                >
                  {photo ? (
                    <span className="relative order-first block h-24 shrink-0 overflow-hidden lg:order-last lg:my-2 lg:mr-2 lg:h-auto lg:w-[36%] lg:rounded-md" style={{ backgroundColor: photo.color }}>
                      <img
                        src={`${photo.url}&w=360&h=320&fit=crop&auto=format&q=70`}
                        alt={photo.alt ?? ""}
                        loading={i < 2 ? "eager" : "lazy"}
                        fetchPriority={i === 0 ? "high" : undefined}
                        decoding="async"
                        className="group-hover-zoom size-full object-cover"
                      />
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 lg:pr-2">
                    <span>
                      <span className="block text-lg font-bold leading-tight tracking-tight lg:text-xl">{t.title}</span>
                      <span className="mt-1 block text-sm opacity-90">{t.sub}</span>
                    </span>
                    <span className={cn("inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold lg:px-2.5", t.ctaCls)}>
                      {t.cta} <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
                {photo ? <PhotoCredit photo={photo} side="bottom-end" className="right-2 top-2" /> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Category icon circles */}
      {categories.length ? (
        <nav aria-label="Shop by category" className="container-content">
          <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1 md:mx-0 md:grid md:grid-cols-8 md:gap-y-4 md:px-0" data-testid="category-circles">
            {categories.slice(0, 16).map((c, i) => (
              <li key={c.id} className="w-24 shrink-0 md:w-auto">
                <Link href={`/categories/${c.slug}`} className="hover-bounce-icon group flex flex-col items-center gap-2 text-center">
                  <CategoryCircle slug={c.slug} size={76} className={circleTones[i % circleTones.length]} />
                  <span className="line-clamp-2 text-sm font-medium leading-tight text-text group-hover:text-primary">{c.name}</span>
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
              <Rail title="Today's best deals" description="Ranked by Deal Score — price vs. its own history and other stores" seeAllHref="/deals" testId="rail-best-deals" autoAdvance>
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

          <div className="container-content section-stack">
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
              <h2 id="popular-cats" className="section-head text-xl font-semibold tracking-tight">
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

          {home.data.retailers.length ? (
            <Band tone="bg-surface-2">
              <div className="section-head flex items-baseline justify-between gap-4">
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
