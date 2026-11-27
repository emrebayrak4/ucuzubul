"use client";

import * as React from "react";
import { ViewTransition } from "react";
import Link from "next/link";
import { Check, GitCompareArrows } from "lucide-react";
import type { ProductCard } from "@pricora/contracts";
import { CategoryIcon, CountUp, DealScoreBadge, DemoDataBadge, PriceDropBadge, PriceTag, SponsoredLabel, Skeleton, cn, formatPrice } from "@pricora/ui";
import { ratioToPercent } from "@/lib/format";
import { COMPARE_MAX, compareStore, toggleCompare } from "@/lib/compare-store";
import { BrandMark } from "./brand-mark";

/** "+ Compare" toggle for tiles/list rows (local selection, floating tray opens the comparison). */
export function CompareToggle({ product, className }: { product: Pick<ProductCard, "id" | "slug" | "title">; className?: string }) {
  const items = compareStore.use();
  const on = items.some((i) => i.id === product.id);
  const full = !on && items.length >= COMPARE_MAX;
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={full}
      title={full ? `You can compare up to ${COMPARE_MAX} products` : on ? "Remove from comparison" : "Add to comparison"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCompare({ id: product.id, slug: product.slug, title: product.title });
      }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-2xs font-semibold shadow-xs transition-colors duration-fast disabled:opacity-50",
        on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface/95 text-text hover:border-primary hover:text-primary",
        className,
      )}
      data-testid="compare-toggle"
    >
      {on ? <Check aria-hidden className="size-3.5" /> : <GitCompareArrows aria-hidden className="size-3.5" />}
      {on ? "Comparing" : "Compare"}
      <span className="sr-only"> {product.title}</span>
    </button>
  );
}

/**
 * Marketplace product tile: white card, square light-grey image well (category icon when no image),
 * 2-line title, big bold price, real strike-through only when a real previous price is known,
 * drop chip, "Lowest at <store> · N stores", Deal Score pill, Demo/Sponsored labels.
 */
export function ProductCardTile({
  product,
  dropPercent,
  previousPriceCents,
  storeName,
  storeIsLowest = true,
  storeLogoUrl,
  storeNote,
  className,
}: {
  product: ProductCard;
  /** Override the drop shown (e.g. a price-drop item's real drop). */
  dropPercent?: number | null;
  /** Real previous price at the same store (price-drop items). Never a fabricated "was" price. */
  previousPriceCents?: number | null;
  /** Store with the lowest price, when the API tells us. */
  storeName?: string | null;
  /** false when the price shown is that store's price (price-drop items), not necessarily the lowest. */
  storeIsLowest?: boolean;
  storeLogoUrl?: string | null;
  /** Short note after the store, e.g. when a price drop happened ("4 days ago"). */
  storeNote?: string | null;
  className?: string;
}) {
  const price = product.lowestPriceCents;
  // Real previous price only: explicit (price-drop items) or the API's 7-day store drop on the card.
  const previous = previousPriceCents ?? product.previousPriceCents ?? null;
  const showWas = typeof previous === "number" && price !== null && previous > price;
  const drop =
    dropPercent !== undefined ? dropPercent : showWas && previous !== null && price !== null ? Math.round(((previous - price) / previous) * 100) : ratioToPercent(product.dropRatio);
  const stores = product.storeCount;
  // The morph name is only set on the tile the user is opening, so a product shown in two rails never
  // produces duplicate view-transition names (which would abort the transition).
  const [morph, setMorph] = React.useState(false);
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface text-text",
        "transition-[box-shadow,translate] duration-fast ease-standard hover:shadow-md motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex h-full flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={() => setMorph(true)}
        onKeyDown={(e) => e.key === "Enter" && setMorph(true)}
      >
        <ViewTransition name={morph ? `product-${product.slug}` : undefined} share="vt-morph" default="none">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-2">
          {product.image ? (
            <img
              src={product.image.url}
              alt={product.image.alt || product.title}
              className="group-hover-zoom size-full object-contain p-4 mix-blend-multiply dark:mix-blend-normal"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <CategoryIcon category={product.category?.slug ?? null} size={52} className="opacity-60" />
          )}
          {drop ? <PriceDropBadge percent={drop} size="sm" className="absolute left-2 top-2 shadow-xs" /> : null}
          {product.dealScore !== null ? (
            <DealScoreBadge score={product.dealScore} size="sm" className="absolute right-2 top-2 shadow-xs" />
          ) : null}
        </div>
        </ViewTransition>
        <div className="flex flex-1 flex-col gap-1 p-3">
          {product.sponsored || product.hasDemoData ? (
            <div className="flex flex-wrap gap-1">
              {product.sponsored ? <SponsoredLabel /> : null}
              {product.hasDemoData ? <DemoDataBadge size="sm" label="Demo" /> : null}
            </div>
          ) : null}
          {product.brand ? <p className="truncate text-2xs font-semibold uppercase tracking-wide text-text-muted">{product.brand.name}</p> : null}
          <h3 className="line-clamp-2 min-h-[2lh] text-sm leading-snug text-text group-hover:text-primary" title={product.title}>
            {product.title}
          </h3>
          {product.keySpecs?.length ? <p className="line-clamp-1 text-xs text-text-muted">{product.keySpecs.slice(0, 3).join(" · ")}</p> : null}
          <div className="mt-auto pt-1.5">
            {price !== null ? (
              <div className="flex flex-wrap items-baseline gap-x-2">
                {showWas ? (
                  <PriceTag cents={price} previousCents={previous} currency={product.currency} size="lg" className="[&>.price]:font-extrabold [&>.price]:text-price-drop" data-testid="dropped-price" />
                ) : (
                  <span className="price text-lg font-extrabold text-text">{formatPrice(price, { currency: product.currency })}</span>
                )}
                {showWas ? (
                  <s className="price text-xs text-text-muted">
                    <span className="sr-only">Previously </span>
                    {formatPrice(previous!, { currency: product.currency })}
                  </s>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-text-muted">No current offers</span>
            )}
            {product.payIn4 && price !== null ? (
              <p className="price text-xs text-text-muted" title={`Interest-free pay-in-4 at checkout, subject to approval by ${product.payIn4.provider}. Not offered by WhichLess.`} data-testid="tile-pay-in-4">
                or 4 × <span className="font-semibold text-text">{formatPrice(product.payIn4.installmentCents, { currency: product.currency })}</span> with {product.payIn4.provider}
              </p>
            ) : null}
            {stores > 0 ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-text-muted">
                {storeName && storeLogoUrl ? <BrandMark name={storeName} logoUrl={storeLogoUrl} size="tile-xs" className="-my-0.5" /> : null}
                {storeName ? (
                  <>
                    <span className="min-w-0 truncate">
                      {storeIsLowest ? "Lowest at" : "At"} <span className="font-medium text-text">{storeName}</span>
                      {storeNote ? ` · ${storeNote}` : ""}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                ) : (
                  "at "
                )}
                <span className="whitespace-nowrap">
                  <CountUp value={stores} className="price" /> {stores === 1 ? "store" : "stores"}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </Link>
      {/* Overlay matching the square image well, so the toggle sits on the image without nesting a button inside the link. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
        <CompareToggle product={product} className="pointer-events-auto absolute bottom-2 left-2" />
      </div>
    </article>
  );
}

export function ProductTileSkeletonCard() {
  return (
    <div aria-hidden className="flex animate-fade-in flex-col overflow-hidden rounded-md border border-border bg-surface">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}

export function ProductGrid({ products, withSidebar = false, testId }: { products: ProductCard[]; withSidebar?: boolean; testId?: string }) {
  return (
    <ul
      data-testid={testId}
      className={withSidebar ? "grid gap-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid-products"}
    >
      {products.map((p) => (
        <li key={p.id} data-testid="product-tile">
          <ProductCardTile product={p} />
        </li>
      ))}
    </ul>
  );
}

/** Horizontal row for list view: image, title, key specs, lowest price · N stores, compare. */
export function ProductListRow({ product }: { product: ProductCard }) {
  const drop = ratioToPercent(product.dropRatio);
  return (
    <article className="group relative flex gap-4 rounded-md border border-border bg-surface p-3 text-text hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="flex size-28 shrink-0 items-center justify-center rounded-sm bg-surface-2 sm:size-32">
        {product.image ? (
          <img src={product.image.url} alt={product.image.alt || product.title} className="size-full object-contain p-2 mix-blend-multiply dark:mix-blend-normal" loading="lazy" />
        ) : (
          <CategoryIcon category={product.category?.slug ?? null} size={44} className="opacity-60" />
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {product.brand ? <span className="text-2xs font-semibold uppercase tracking-wide text-text-muted">{product.brand.name}</span> : null}
            {product.hasDemoData ? <DemoDataBadge size="sm" label="Demo" /> : null}
            {product.sponsored ? <SponsoredLabel /> : null}
          </div>
          <h3 className="mt-0.5 line-clamp-2 text-base font-medium leading-snug">
            <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 group-hover:text-primary">
              {product.title}
            </Link>
          </h3>
          {product.keySpecs?.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {product.keySpecs.map((s) => (
                <li key={s} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-text-muted">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:w-44 sm:items-end sm:text-right">
          {product.lowestPriceCents !== null ? (
            <>
              <span className="price text-xl font-extrabold">{formatPrice(product.lowestPriceCents, { currency: product.currency })}</span>
              <span className="text-xs text-text-muted">
                lowest price · <span className="price font-medium text-text">{product.storeCount}</span> {product.storeCount === 1 ? "store" : "stores"}
              </span>
            </>
          ) : (
            <span className="text-sm text-text-muted">No current offers</span>
          )}
          <div className="flex items-center gap-1.5">
            {drop ? <PriceDropBadge percent={drop} size="sm" /> : null}
            {product.dealScore !== null ? <DealScoreBadge score={product.dealScore} size="sm" /> : null}
          </div>
          <CompareToggle product={product} className="relative z-10 mt-auto" />
        </div>
      </div>
    </article>
  );
}

export function ProductResults({ products, view, testId }: { products: ProductCard[]; view: "grid" | "list"; testId?: string }) {
  if (view === "grid") return <ProductGrid products={products} withSidebar testId={testId} />;
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {products.map((p) => (
        <li key={p.id} data-testid="product-row">
          <ProductListRow product={p} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count = 12, withSidebar = false }: { count?: number; withSidebar?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading products"
      className={withSidebar ? "grid gap-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid-products"}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductTileSkeletonCard key={i} />
      ))}
    </div>
  );
}
