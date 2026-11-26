import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, focusRing } from "../lib/cn";

type LinkComp = React.ComponentType<{
  href: string;
  className?: string;
  children?: React.ReactNode;
  "aria-current"?: "page";
  "aria-label"?: string;
  rel?: string;
}>;

/* ------------------------------------------------------------ Breadcrumbs */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  items: BreadcrumbItem[];
  linkComponent?: LinkComp;
}

/** Last item is the current page (no link). Pair with BreadcrumbList JSON-LD in the app. */
export function Breadcrumbs({ items, linkComponent, className, ...props }: BreadcrumbsProps) {
  const Link: LinkComp | "a" = linkComponent ?? "a";
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)} {...props}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-text-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className={cn("truncate rounded-xs hover:text-text hover:underline", focusRing)}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && "text-text")}>
                  {item.label}
                </span>
              )}
              {last ? null : <ChevronRight aria-hidden className="size-3 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------- Pagination */

export function paginationRange(page: number, pageCount: number, siblings = 1): Array<number | "gap"> {
  const total = siblings * 2 + 5;
  if (pageCount <= total) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 2);
  const right = Math.min(page + siblings, pageCount - 1);
  const out: Array<number | "gap"> = [1];
  if (left > 2) out.push("gap");
  for (let p = left; p <= right; p++) out.push(p);
  if (right < pageCount - 1) out.push("gap");
  out.push(pageCount);
  return out;
}

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  page: number;
  pageCount: number;
  /** Link mode (SEO-friendly, preferred for search/category pages). */
  getHref?: (page: number) => string;
  /** Button mode (client state). Used when getHref is not provided. */
  onPageChange?: (page: number) => void;
  linkComponent?: LinkComp;
  siblings?: number;
}

const pageItem = cn(
  "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2.5 text-sm font-medium price",
  "text-text hover:bg-surface-2 aria-[current=page]:bg-primary aria-[current=page]:text-primary-fg",
  "aria-disabled:pointer-events-none aria-disabled:opacity-40",
  focusRing,
);

export function Pagination({
  page,
  pageCount,
  getHref,
  onPageChange,
  linkComponent,
  siblings = 1,
  className,
  ...props
}: PaginationProps) {
  if (pageCount <= 1) return null;
  const Link: LinkComp | "a" = linkComponent ?? "a";

  const renderItem = (p: number, content: React.ReactNode, opts: { label?: string; rel?: string; disabled?: boolean } = {}) => {
    const current = p === page && !opts.label;
    if (opts.disabled) {
      return (
        <span className={pageItem} aria-disabled="true" aria-label={opts.label}>
          {content}
        </span>
      );
    }
    if (getHref) {
      return (
        <Link
          href={getHref(p)}
          className={pageItem}
          aria-current={current ? "page" : undefined}
          aria-label={opts.label ?? `Page ${p}`}
          rel={opts.rel}
        >
          {content}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={pageItem}
        aria-current={current ? "page" : undefined}
        aria-label={opts.label ?? `Page ${p}`}
        onClick={() => onPageChange?.(p)}
      >
        {content}
      </button>
    );
  };

  return (
    <nav aria-label="Pagination" className={cn("flex justify-center", className)} {...props}>
      <ul className="flex items-center gap-1">
        <li>
          {renderItem(
            page - 1,
            <>
              <ChevronLeft aria-hidden className="size-4" />
              <span className="hidden sm:inline">Previous</span>
            </>,
            { label: "Previous page", rel: "prev", disabled: page <= 1 },
          )}
        </li>
        {paginationRange(page, pageCount, siblings).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-text-muted">
              …
            </li>
          ) : (
            <li key={p} className={cn(p !== page && "hidden sm:block")}>
              {renderItem(p, p)}
            </li>
          ),
        )}
        <li>
          {renderItem(
            page + 1,
            <>
              <span className="hidden sm:inline">Next</span>
              <ChevronRight aria-hidden className="size-4" />
            </>,
            { label: "Next page", rel: "next", disabled: page >= pageCount },
          )}
        </li>
      </ul>
    </nav>
  );
}
