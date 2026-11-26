"use client";

import * as React from "react";
import { ViewTransition } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import type { ProductCard } from "@pricora/contracts";
import { CategoryIcon, DealScoreBadge, DemoDataBadge, SponsoredLabel, Skeleton, cn, formatPrice } from "@pricora/ui";
import { ratioToPercent } from "@/lib/format";
import { BrandMark } from "./brand-mark";

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
  className?: string;
}) {
  const drop = dropPercent !== undefined ? dropPercent : ratioToPercent(product.dropRatio);
  const price = product.lowestPriceCents;
  const showWas = typeof previousPriceCents === "number" && price !== null && previousPriceCents > price;
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
        <div className="relative flex aspect-square w-full items-center justify-center bg-surface-2">
          {product.image ? (
            <img
              src={product.image.url}
              alt={product.image.alt || product.title}
              className="size-full object-contain p-4 mix-blend-multiply dark:mix-blend-normal"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <CategoryIcon category={product.category?.slug ?? null} size={52} className="opacity-60" />
          )}
          {drop ? (
            <span className="price absolute left-2 top-2 inline-flex h-6 items-center gap-0.5 rounded-sm bg-error px-1.5 text-xs font-semibold text-error-fg">
              <ArrowDown aria-hidden className="size-3" strokeWidth={2.75} />
              <span className="sr-only">Price dropped </span>
              {drop}%
            </span>
          ) : null}
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
          <div className="mt-auto pt-1.5">
            {price !== null ? (
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="price text-lg font-extrabold text-text">{formatPrice(price, { currency: product.currency })}</span>
                {showWas ? (
                  <s className="price text-xs text-text-muted">
                    <span className="sr-only">Previously </span>
                    {formatPrice(previousPriceCents, { currency: product.currency })}
                  </s>
                ) : null}
              </div>
            ) : (
              <span className="text-sm text-text-muted">No current offers</span>
            )}
            {stores > 0 ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-text-muted">
                {storeName && storeLogoUrl ? <BrandMark name={storeName} logoUrl={storeLogoUrl} size="xs" /> : null}
                {storeName ? (
                  <>
                    {storeIsLowest ? "Lowest at" : "At"} <span className="font-medium text-text">{storeName}</span>{storeIsLowest ? " · " : " · compared across "}
                  </>
                ) : (
                  "at "
                )}
                <span className="price">{stores}</span> {stores === 1 ? "store" : "stores"}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
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
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
        withSidebar ? "lg:grid-cols-4 xl:grid-cols-5" : "lg:grid-cols-5 xl:grid-cols-6",
      )}
    >
      {products.map((p) => (
        <li key={p.id} data-testid="product-tile">
          <ProductCardTile product={p} />
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
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4",
        withSidebar ? "lg:grid-cols-4 xl:grid-cols-5" : "lg:grid-cols-5 xl:grid-cols-6",
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <ProductTileSkeletonCard key={i} />
      ))}
    </div>
  );
}
