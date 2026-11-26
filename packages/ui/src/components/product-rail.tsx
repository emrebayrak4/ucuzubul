"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { IconButton } from "./button";

export interface ProductRailProps {
  title: string;
  /** Optional sub line, e.g. "Updated hourly from 14 stores". */
  description?: React.ReactNode;
  /** "See all" destination. */
  seeAllHref?: string;
  seeAllLabel?: string;
  linkComponent?: React.ComponentType<{ href: string; className?: string; children?: React.ReactNode }>;
  /** Extra element in the header (e.g. DemoDataBadge, tabs). */
  headerExtra?: React.ReactNode;
  /** Each child becomes one snap item. */
  children: React.ReactNode;
  /** Width of each item. Default fits 2.2 / 3.2 / 4 / 5 / 6 items per view. */
  itemClassName?: string;
  className?: string;
  headingLevel?: "h2" | "h3";
}

const defaultItem =
  "w-[44%] sm:w-[30.5%] md:w-[calc((100%-3*0.75rem)/4)] lg:w-[calc((100%-4*0.75rem)/5)] xl:w-[calc((100%-5*0.75rem)/6)]";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Horizontal, snap-scrolling rail with arrow buttons (pointer devices) and native swipe (touch). */
export function ProductRail({
  title,
  description,
  seeAllHref,
  seeAllLabel = "See all",
  linkComponent,
  headerExtra,
  children,
  itemClassName,
  className,
  headingLevel = "h2",
}: ProductRailProps) {
  const id = React.useId();
  const scroller = React.useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);
  const Heading = headingLevel;
  const Link = linkComponent ?? "a";

  const update = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const items = React.Children.toArray(children);

  return (
    <section aria-labelledby={id} className={cn("relative", className)}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Heading id={id} className="text-xl font-semibold tracking-tight text-text">
              {title}
            </Heading>
            {headerExtra}
          </div>
          {description ? <p className="mt-0.5 text-sm text-text-muted">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="mr-1 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {seeAllLabel}
              <span className="sr-only">: {title}</span>
            </Link>
          ) : null}
          <IconButton
            label={`Scroll ${title} left`}
            variant="secondary"
            size="sm"
            shape="circle"
            className="hidden md:inline-flex"
            disabled={!canPrev}
            onClick={() => scrollBy(-1)}
          >
            <ChevronLeft aria-hidden />
          </IconButton>
          <IconButton
            label={`Scroll ${title} right`}
            variant="secondary"
            size="sm"
            shape="circle"
            className="hidden md:inline-flex"
            disabled={!canNext}
            onClick={() => scrollBy(1)}
          >
            <ChevronRight aria-hidden />
          </IconButton>
        </div>
      </div>
      <ul
        ref={scroller}
        className={cn(
          "scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0",
          "overscroll-x-contain",
        )}
      >
        {items.map((child, i) => (
          <li key={React.isValidElement(child) && child.key != null ? child.key : i} className={cn("shrink-0 snap-start", itemClassName ?? defaultItem)}>
            {child}
          </li>
        ))}
      </ul>
    </section>
  );
}
