import * as React from "react";
import { cn, focusRing } from "../lib/cn";
import { formatPrice } from "../lib/format";
import { CategoryIcon } from "./category-icon";
import { DealScoreBadge, DemoDataBadge, PriceDropBadge, SponsoredLabel } from "./badge";

export type LinkLikeComponent = React.ComponentType<{
  href: string;
  className?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
}>;

export interface ProductTileProps {
  href: string;
  title: string;
  imageUrl?: string | null;
  imageAlt?: string;
  /** Category slug: chooses the neutral fallback icon when there is no image. */
  category?: string | null;
  brand?: string | null;
  /** Lowest current price across stores (cents). */
  lowestPriceCents?: number | null;
  currency?: string;
  /** Number of stores with an offer. */
  storeCount?: number | null;
  /** Positive integer % drop (vs. reference window). */
  dropPercent?: number | null;
  dealScore?: number | null;
  /** At least one displayed offer has source="demo" -> mandatory Demo data label. */
  isDemo?: boolean;
  /** Paid placement -> mandatory Sponsored label. */
  sponsored?: boolean;
  /** Optional overlay action (e.g. favorite IconButton). Rendered outside the link. */
  action?: React.ReactNode;
  /** Link component (e.g. next/link). Defaults to <a>. */
  linkComponent?: LinkLikeComponent;
  /** Image renderer (e.g. next/image). */
  renderImage?: (props: { src: string; alt: string; className: string }) => React.ReactNode;
  /** Visual density. `compact` is for rails/grids of 5–6 columns. */
  density?: "compact" | "comfortable";
  className?: string;
}

/**
 * Dense price-grid tile: image (or category icon), 2-line title, lowest price,
 * "at N stores", drop %, Deal Score. The whole tile is one link; `action` sits on top.
 */
export function ProductTile({
  href,
  title,
  imageUrl,
  imageAlt,
  category,
  brand,
  lowestPriceCents,
  currency = "USD",
  storeCount,
  dropPercent,
  dealScore,
  isDemo = false,
  sponsored = false,
  action,
  linkComponent,
  renderImage,
  density = "compact",
  className,
}: ProductTileProps) {
  const Link: LinkLikeComponent | "a" = linkComponent ?? "a";
  const imgClass = "size-full object-contain mix-blend-multiply dark:mix-blend-normal";
  const hasPrice = typeof lowestPriceCents === "number" && Number.isFinite(lowestPriceCents);
  const stores = typeof storeCount === "number" && storeCount > 0 ? storeCount : null;

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-md bg-surface text-text",
        "border border-border transition-[border-color,box-shadow] duration-fast ease-standard",
        "hover:border-border-strong/60 hover:shadow-sm",
        density === "compact" ? "p-2.5" : "p-3.5",
        className,
      )}
    >
      <Link href={href} className={cn("flex h-full flex-col rounded-sm", focusRing, "focus-visible:ring-offset-surface")}>
        <div className="relative mb-2.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-surface-2">
          {imageUrl ? (
            renderImage ? (
              renderImage({ src: imageUrl, alt: imageAlt ?? title, className: imgClass })
            ) : (
              <img src={imageUrl} alt={imageAlt ?? title} className={imgClass} loading="lazy" decoding="async" />
            )
          ) : (
            <CategoryIcon category={category} size={density === "compact" ? 36 : 44} className="opacity-70" />
          )}
          {dealScore !== null && dealScore !== undefined ? (
            <DealScoreBadge score={dealScore} showLabel={false} size="sm" className="absolute left-1.5 top-1.5" />
          ) : null}
        </div>

        {sponsored || isDemo ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {sponsored ? <SponsoredLabel /> : null}
            {isDemo ? <DemoDataBadge size="sm" /> : null}
          </div>
        ) : null}

        {brand ? <p className="mb-0.5 truncate text-2xs font-medium uppercase tracking-wide text-text-muted">{brand}</p> : null}
        <h3
          className={cn(
            "line-clamp-2 font-medium leading-snug text-text group-hover:underline group-hover:decoration-border-strong group-hover:underline-offset-2",
            density === "compact" ? "min-h-[2lh] text-sm" : "min-h-[2lh] text-base",
          )}
          title={title}
        >
          {title}
        </h3>

        <div className="mt-auto pt-2">
          {hasPrice ? (
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span className={cn("price font-semibold text-text", density === "compact" ? "text-md" : "text-lg")}>
                {formatPrice(lowestPriceCents, { currency })}
              </span>
              {dropPercent ? <PriceDropBadge percent={dropPercent} size="sm" /> : null}
            </div>
          ) : (
            <span className="text-sm text-text-muted">No current offers</span>
          )}
          {stores ? (
            <p className="mt-0.5 text-xs text-text-muted">
              {hasPrice ? "at " : ""}
              <span className="price">{stores}</span> {stores === 1 ? "store" : "stores"}
            </p>
          ) : null}
        </div>
      </Link>
      {action ? <div className="absolute right-1.5 top-1.5 z-raised">{action}</div> : null}
    </article>
  );
}
