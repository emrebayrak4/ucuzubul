"use client";

import * as React from "react";
import Link from "next/link";
import { Check, GitCompareArrows } from "lucide-react";
import type { ProductCard } from "@pricora/contracts";
import { Badge, CategoryIcon, CountUp, DealScoreBadge, DemoDataBadge, PriceDropBadge, PriceTag, SponsoredLabel, Skeleton, cn, formatPrice } from "@pricora/ui";
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

const conditionLabel: Record<string, string> = { new: "New", open_box: "Open box", refurbished: "Refurbished", used: "Used" };

/** Tile spec line: drop empty / bare-number / yes-no fragments and duplicates, so no stray "· 1" or "· Yes" bits. */
export function cleanSpecs(specs: readonly string[] | undefined, max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of specs ?? []) {
    const s = raw.replace(/^[\s·•|,;-]+|[\s·•|,;-]+$/g, "").trim();
    if (!s || /^\d+([.,]\d+)?$/.test(s) || /^(yes|no|n\/a|none|-)$/i.test(s)) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Marketplace product tile with FIXED slots, so every element lines up across a row (rails and grids):
 * image (square) · chips row (1 line, always reserved) · brand (1 line) · title (exactly 2 lines) · specs (1 line) ·
 * price block pinned to the bottom with a fixed height [price + real saving | struck previous price or blank |
 * pay-in-4 / "Used from" or blank] · store line (logo tile + "Lowest at Store · N stores", one line, ellipsis).
 * The red "↓ N%" badge appears only with a real previous price; a median-based drop shows a neutral "N% below avg".
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
  /** Override the drop shown (e.g. a price-drop item's real drop). Only rendered as a red drop badge with a real previous price. */
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
  const currency = product.currency;
  // Real previous price only: explicit (price-drop items) or the API's 7-day store drop on the card.
  const previous = previousPriceCents ?? product.previousPriceCents ?? null;
  const was = typeof previous === "number" && price !== null && previous > price ? previous : null;
  // Red drop badge ⇔ a struck previous price is shown, so badge and price never contradict.
  const realDrop = was !== null && price !== null ? (dropPercent ?? Math.round(((was - price) / was) * 100)) : null;
  // Otherwise a median comparison (dropRatio = below the 30-day median) gets a neutral badge.
  const belowAvg = was === null ? ratioToPercent(product.dropRatio) : null;
  const stores = product.storeCount;
  const specs = cleanSpecs(product.keySpecs);
  const otherCondition =
    price !== null
      ? [...(product.otherConditions ?? [])].filter((c) => c.lowestPriceCents < price).sort((a, b) => a.lowestPriceCents - b.lowestPriceCents)[0]
      : undefined;
  const conditionChip = product.priceCondition && product.priceCondition !== "new" ? conditionLabel[product.priceCondition] : null;
  const payIn4 = product.payIn4 && price !== null ? product.payIn4 : null;
  return (
    <article
      className={cn(
        // @container: narrow tiles (< 12rem, e.g. 2-up on phones) switch to compact badge / store-line forms.
        "@container group relative flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface text-text",
        "transition-[box-shadow,translate] duration-fast ease-standard hover:shadow-md motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      <Link
        href={`/products/${product.slug}`}
        className="flex h-full flex-col rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative flex aspect-square w-full shrink-0 items-center justify-center overflow-hidden bg-surface-2">
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
          {realDrop ? (
            <PriceDropBadge percent={realDrop} size="sm" className="absolute left-2 top-2 shadow-xs" />
          ) : belowAvg ? (
            <Badge size="sm" variant="outline" className="absolute left-2 top-2 shadow-xs" title="Current lowest price vs. its 30-day median" data-testid="below-avg-badge">
              {belowAvg}% below avg
            </Badge>
          ) : null}
          {product.dealScore !== null ? (
            <DealScoreBadge score={product.dealScore} size="sm" className="absolute right-2 top-2 shadow-xs @max-[12rem]:[&>span+span]:hidden" />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-3">
          {/* Chips row: always reserved (h-5) so brand/title start at the same y in every tile. */}
          <div className="flex h-5 items-center gap-1 overflow-hidden" data-slot="chips">
            {product.sponsored ? <SponsoredLabel /> : null}
            {product.hasDemoData ? <DemoDataBadge size="sm" label="Demo" /> : null}
            {conditionChip ? (
              <Badge size="sm" variant="outline">
                {conditionChip}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 h-4 truncate text-2xs font-semibold uppercase leading-4 tracking-wide text-text-muted">{product.brand?.name ?? ""}</p>
          <h3 className="mt-0.5 line-clamp-2 h-[2lh] text-sm leading-snug text-text group-hover:text-primary" title={product.title}>
            {product.title}
          </h3>
          <p className="mt-0.5 h-4 truncate text-xs leading-4 text-text-muted" data-slot="specs">
            {specs.join(" · ")}
          </p>
          {/* Price block: pinned to the bottom, fixed height (24 + 16 + 16). */}
          <div className="mt-auto pt-2" data-slot="price-block">
            <div className="flex h-6 items-baseline gap-x-1.5 overflow-hidden whitespace-nowrap" data-slot="price">
              {price === null ? (
                <span className="text-sm text-text-muted">No current offers</span>
              ) : was !== null ? (
                <PriceTag cents={price} previousCents={was} currency={currency} size="lg" className="[&>.price]:font-extrabold [&>.price]:text-price-drop" data-testid="dropped-price" />
              ) : (
                <span className="price text-lg font-extrabold text-text">{formatPrice(price, { currency })}</span>
              )}
            </div>
            <p className="h-4 truncate text-xs leading-4 text-text-muted" data-slot="was">
              {was !== null ? (
                <s className="price">
                  <span className="sr-only">Previously </span>
                  {formatPrice(was, { currency })}
                </s>
              ) : product.unitPrice ? (
                <span className="price font-medium text-text" data-testid="tile-unit-price">
                  {product.unitPrice.label}
                  {product.sizeLabel && !product.keySpecs?.includes(product.sizeLabel) ? <span className="font-normal text-text-muted"> · {product.sizeLabel}</span> : null}
                </span>
              ) : null}
            </p>
            <p
              className="price h-4 truncate text-xs leading-4 text-text-muted"
              data-slot="extra"
              title={payIn4 ? `Interest-free pay-in-4 at checkout, subject to approval by ${payIn4.provider}. Not offered by WhichLess.` : undefined}
            >
              {payIn4 ? (
                <span data-testid="tile-pay-in-4">
                  or 4 × <span className="font-semibold text-text">{formatPrice(payIn4.installmentCents, { currency })}</span> · {payIn4.provider}
                </span>
              ) : null}
              {!payIn4 && !otherCondition && product.nearest ? (
                <span data-testid="tile-nearest">
                  Nearby: <span className="font-semibold text-text">{product.nearest.distanceMi.toFixed(1)} mi</span> · {product.nearest.storeName}
                </span>
              ) : null}
              {payIn4 && otherCondition ? " · " : null}
              {otherCondition ? (
                <span data-testid="tile-other-condition">
                  {otherCondition.condition === "open_box" ? "Open-box" : (conditionLabel[otherCondition.condition] ?? otherCondition.condition)} from{" "}
                  <span className="font-semibold text-text">{formatPrice(otherCondition.lowestPriceCents, { currency })}</span>
                </span>
              ) : null}
            </p>
          </div>
          {/* Store line: one line, logo tile + "Lowest at Store" (truncates) + "· N stores" (never truncates). */}
          <div className="mt-1.5 flex h-5 min-w-0 items-center gap-1.5 text-xs text-text-muted" data-slot="store">
            {stores > 0 ? (
              <>
                {storeName ? <BrandMark name={storeName} logoUrl={storeLogoUrl ?? null} size="tile-xs" className="@max-[12rem]:hidden" /> : null}
                <span className="min-w-0 truncate">
                  {storeName ? (
                    <>
                      <span className="sr-only @min-[12rem]:not-sr-only">{storeIsLowest ? "Lowest at " : "At "}</span>
                      <span className="font-medium text-text">{storeName}</span>
                      {storeNote ? ` · ${storeNote}` : ""}
                    </>
                  ) : (
                    "Compared at"
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  {storeName ? "· " : ""}
                  <CountUp value={stores} className="price" /> {stores === 1 ? "store" : "stores"}
                </span>
              </>
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
              {product.unitPrice ? <span className="price text-xs font-medium text-text">{product.unitPrice.label}</span> : null}
              {product.nearest ? (
                <span className="text-xs text-text-muted">
                  {product.nearest.distanceMi.toFixed(1)} mi · {product.nearest.storeName}
                </span>
              ) : null}
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
