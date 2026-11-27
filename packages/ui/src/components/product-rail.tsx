"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "../lib/cn";
import { IconButton } from "./button";
import { SectionHeader, sectionActionLinkClass } from "./section-header";
import { Reveal, usePrefersReducedMotion } from "./motion";

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
  /** Width of each item. Default fits 2.3 / 3.2 (sm) / 4 (lg) / 5 (xl) / 6 (2xl) items per view, matching `grid-products`. */
  itemClassName?: string;
  className?: string;
  headingLevel?: "h2" | "h3";
  /**
   * Auto-advance one item every `autoAdvanceMs` (e.g. "Today's deals"). Pauses on hover, focus, touch, when the tab
   * is hidden or the rail is off-screen, and has a visible pause/play button. Off under prefers-reduced-motion.
   */
  autoAdvance?: boolean;
  autoAdvanceMs?: number;
  /** Staggered fade-up of the items when the rail first scrolls into view. Default true. */
  reveal?: boolean;
}

/** Item widths that match `grid-products` columns exactly (same --pc-grid-gap), so rails and grids share vertical lines. */
export const railItemClass =
  "w-[42%] min-w-[140px] sm:w-[30.5%] lg:w-[calc((100%-3*var(--pc-grid-gap))/4)] xl:w-[calc((100%-4*var(--pc-grid-gap))/5)] 2xl:w-[calc((100%-5*var(--pc-grid-gap))/6)]";
const defaultItem = railItemClass;

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
  autoAdvance = false,
  autoAdvanceMs = 4500,
  reveal = true,
}: ProductRailProps) {
  const id = React.useId();
  const scroller = React.useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);
  const Heading = headingLevel;
  const Link = linkComponent ?? "a";
  const reduced = usePrefersReducedMotion();
  const [playing, setPlaying] = React.useState(true);
  const [held, setHeld] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const sectionRef = React.useRef<HTMLElement>(null);
  const auto = autoAdvance && !reduced;

  React.useEffect(() => {
    const el = sectionRef.current;
    if (!auto || !el) return;
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [auto]);

  React.useEffect(() => {
    if (!auto || !playing || held || !onScreen) return;
    const id = window.setInterval(() => {
      const el = scroller.current;
      if (!el || document.hidden) return;
      const first = el.firstElementChild as HTMLElement | null;
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const step = (first?.getBoundingClientRect().width ?? el.clientWidth * 0.3) + gap;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: step, behavior: "smooth" });
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [auto, playing, held, onScreen, autoAdvanceMs]);

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
    <section ref={sectionRef} aria-labelledby={id} className={cn("relative", className)}>
      <SectionHeader
        title={title}
        titleId={id}
        as={Heading}
        description={description}
        extra={headerExtra}
        actions={
          <>
          {auto ? (
            <IconButton
              label={playing ? `Pause auto-scrolling ${title}` : `Resume auto-scrolling ${title}`}
              variant="ghost"
              size="sm"
              shape="circle"
              aria-pressed={!playing}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </IconButton>
          ) : null}
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className={cn(sectionActionLinkClass, "md:mr-1")}
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
          </>
        }
      />
      <ul
        ref={scroller}
        className={cn(
          "scrollbar-none gap-grid -mx-4 flex snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0",
          "overscroll-x-contain",
        )}
        onPointerEnter={auto ? () => setHeld(true) : undefined}
        onPointerLeave={auto ? () => setHeld(false) : undefined}
        onFocus={auto ? () => setHeld(true) : undefined}
        onBlur={auto ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); } : undefined}
        onTouchStart={auto ? () => setHeld(true) : undefined}
      >
        {items.map((child, i) => (
          reveal ? (
            <Reveal as="li" key={React.isValidElement(child) && child.key != null ? child.key : i} index={i < 6 ? i : undefined} className={cn("shrink-0 snap-start", itemClassName ?? defaultItem)}>
              {child}
            </Reveal>
          ) : (
            <li key={React.isValidElement(child) && child.key != null ? child.key : i} className={cn("shrink-0 snap-start", itemClassName ?? defaultItem)}>
              {child}
            </li>
          )
        ))}
      </ul>
    </section>
  );
}
