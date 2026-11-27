import * as React from "react";
import { Copy } from "lucide-react";
import { cn, focusRing } from "../lib/cn";
import { formatPrice } from "../lib/format";

/*
 * Motion primitives. Rules (docs/DESIGN_SYSTEM.md "Motion"):
 *  - Server HTML always shows the final state (no-JS, SEO, screenshots); motion is layered on after hydration.
 *  - Elements that are already on screen at hydration never hide (no flash); only off-screen ones wait to reveal.
 *  - prefers-reduced-motion: every primitive renders the final state immediately.
 *  - Numbers animate inside a grid cell that also holds the (invisible) final value, so width never changes.
 */

/* ---------------------------------------------------------------- hooks */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the user asked for reduced motion. `true` during SSR/first render (safe default: no motion). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia(REDUCED_QUERY);
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function reducedNow(): boolean {
  return typeof window === "undefined" || typeof IntersectionObserver === "undefined" || window.matchMedia(REDUCED_QUERY).matches;
}

function isOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

export interface InViewState {
  /** The element was already visible when JS took over (no entrance animation should run for reveal-type effects). */
  startedOnScreen: boolean;
  /** The element has entered the viewport at least once. */
  seen: boolean;
}

/** Fires once when `ref` enters the viewport. */
export function useInViewOnce<T extends Element>(
  ref: React.RefObject<T | null>,
  { rootMargin = "0px 0px -8% 0px", threshold = 0.15 }: { rootMargin?: string; threshold?: number } = {},
): InViewState {
  const [state, setState] = React.useState<InViewState>({ startedOnScreen: false, seen: false });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setState({ startedOnScreen: true, seen: true });
      return;
    }
    if (isOnScreen(el)) {
      setState({ startedOnScreen: true, seen: true });
      return;
    }
    const stop = observeShared(el, rootMargin, threshold, (e) => {
      if (!e.isIntersecting) return;
      setState({ startedOnScreen: false, seen: true });
      stop();
    });
    return stop;
  }, [ref, rootMargin, threshold]);
  return state;
}

/*
 * Shared IntersectionObservers (perf): a product grid has 100+ CountUp/PriceRoll instances; one observer per
 * (rootMargin, threshold) pair instead of one per element keeps intersection work O(1) observers.
 */
type SharedIO = { io: IntersectionObserver; callbacks: Map<Element, (entry: IntersectionObserverEntry) => void> };
const sharedObservers = new Map<string, SharedIO>();

function observeShared(el: Element, rootMargin: string, threshold: number, cb: (entry: IntersectionObserverEntry) => void): () => void {
  const key = `${rootMargin}|${threshold}`;
  let shared = sharedObservers.get(key);
  if (!shared) {
    const callbacks = new Map<Element, (entry: IntersectionObserverEntry) => void>();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => callbacks.get(e.target)?.(e)), { rootMargin, threshold });
    shared = { io, callbacks };
    sharedObservers.set(key, shared);
  }
  const s = shared;
  s.callbacks.set(el, cb);
  s.io.observe(el);
  return () => {
    if (s.callbacks.get(el) !== cb) return;
    s.callbacks.delete(el);
    s.io.unobserve(el);
  };
}

/* ------------------------------------------------------- MotionGovernor */

const LOOPING_SELECTOR = ".animate-shimmer, .animate-hot";

/**
 * Runs the infinite badge loops (shimmer sweep, "hot" drift) only while the badge is actually in the viewport.
 * The CSS starts those loops only on `[data-anim="on"]`, so without this component (or without JS) badges simply
 * show their static design. Mount once near the root. Perf: a home page renders ~250 looping badges; running all
 * of them kept the main thread busy with style/paint every frame even when idle.
 */
export function MotionGovernor() {
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || typeof MutationObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) el.dataset.anim = "on";
        else delete el.dataset.anim;
      }
    });
    const each = (node: Node, fn: (el: Element) => void) => {
      if (!(node instanceof Element)) return;
      if (node.matches(LOOPING_SELECTOR)) fn(node);
      node.querySelectorAll(LOOPING_SELECTOR).forEach(fn);
    };
    const watch = (el: Element) => io.observe(el);
    const unwatch = (el: Element) => io.unobserve(el);
    each(document.body, watch);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes") {
          const el = r.target as Element;
          if (el.matches(LOOPING_SELECTOR)) watch(el);
          else {
            unwatch(el);
            delete (el as HTMLElement).dataset.anim;
          }
          continue;
        }
        r.removedNodes.forEach((n) => each(n, unwatch));
        r.addedNodes.forEach((n) => each(n, watch));
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);
  return null;
}

/**
 * Scroll reveal for any element: pass the returned ref and spread the props; the element also needs the
 * `reveal-on-scroll` class (Reveal adds it). Off-screen elements fade/slide up when they enter the viewport.
 */
export function useReveal<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || reducedNow() || isOnScreen(el)) return;
    el.dataset.reveal = "pending";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.reveal;
    };
  }, []);
  return ref;
}

/* --------------------------------------------------------------- Reveal */

export interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "li" | "article" | "span";
  /** Stagger index: delay = index × 50ms (capped at 400ms). */
  index?: number;
  delayMs?: number;
}

/**
 * Founder decision (2026-11-27): no scroll-reveal — content must be visible immediately.
 * Reveal is kept as a plain wrapper so existing call sites keep working; `index`/`delayMs` are ignored.
 */
export function Reveal({ as = "div", index: _index, delayMs: _delayMs, className, ...props }: RevealProps) {
  const Comp = as as React.ElementType;
  return <Comp className={className} {...props} />;
}

/* ------------------------------------------------------------ tweening */

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates the text of `textRef` from `from` to `to` once `run` turns true. Perf: writes the existing text node
 * directly each frame instead of re-rendering React (a grid has 100+ of these entering the viewport together).
 * React keeps owning the node: its rendered text is always the final value, which every tween ends on.
 */
function useTweenText(textRef: React.RefObject<HTMLSpanElement | null>, from: number, to: number, run: boolean, durationMs: number, format: (n: number) => string): void {
  const formatRef = React.useRef(format);
  formatRef.current = format;
  React.useEffect(() => {
    const node = textRef.current?.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const write = (n: number) => {
      const next = formatRef.current(n);
      if (node.nodeValue !== next) node.nodeValue = next;
    };
    if (!run || from === to || reducedNow()) {
      write(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    write(from);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      write(from + (to - from) * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      write(to);
    };
  }, [textRef, from, to, run, durationMs]);
}

/** Stack the animated text over the invisible final text so the box never changes size. */
function StableNumber({ final, textRef, className }: { final: string; textRef: React.RefObject<HTMLSpanElement | null>; className?: string }) {
  return (
    <span className={cn("price inline-grid", className)}>
      <span aria-hidden className="invisible col-start-1 row-start-1 select-none">
        {final}
      </span>
      <span ref={textRef} aria-hidden className="col-start-1 row-start-1 select-none text-right">
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/* -------------------------------------------------------------- CountUp */

export interface CountUpProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Final (real) value. */
  value: number;
  /** Start value. Default 0. */
  from?: number;
  durationMs?: number;
  format?: (n: number) => string;
}

const defaultCount = (n: number) => Math.round(n).toLocaleString("en-US");

/** Counts up to a real number when it first scrolls into view (e.g. "22 stores", "N coupons"). */
export function CountUp({ value, from = 0, durationMs = 900, format = defaultCount, className, ...props }: CountUpProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const { seen } = useInViewOnce(ref);
  useTweenText(textRef, from, value, seen, durationMs, format);
  return (
    <span ref={ref} className={className} {...props}>
      <StableNumber final={format(value)} textRef={textRef} />
    </span>
  );
}

/* ------------------------------------------------------------ PriceRoll */

export interface PriceRollProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Current price (integer minor units). */
  cents: number;
  /** Real previous price (minor units). The roll only runs when it is higher than `cents`. */
  previousCents?: number | null;
  currency?: string;
  trimZeroCents?: boolean;
  durationMs?: number;
}

/** Rolls a price down from its real previous value to the current one on first view. */
export function PriceRoll({ cents, previousCents, currency = "USD", trimZeroCents = false, durationMs = 1000, className, ...props }: PriceRollProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const { seen } = useInViewOnce(ref);
  const start = typeof previousCents === "number" && previousCents > cents ? previousCents : cents;
  const fmt = (c: number) => formatPrice(Math.round(c), { currency, trimZeroCents });
  useTweenText(textRef, start, cents, seen, durationMs, fmt);
  return (
    <span ref={ref} className={className} {...props}>
      <StableNumber final={fmt(cents)} textRef={textRef} />
    </span>
  );
}

/* -------------------------------------------------------------- LiveDot */

export interface LiveDotProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Real last-update time of the deal/offer (ISO string or Date). */
  updatedAt: string | Date | null | undefined;
  /** Window in minutes for "live". Default 60. */
  withinMinutes?: number;
  /** Show the "Updated Xm ago" text next to the dot. Default true. */
  showLabel?: boolean;
}

/**
 * Pulsing "live" dot, rendered only when `updatedAt` is within the window. Computed after hydration
 * (the server never guesses the client's clock), so it never causes a hydration mismatch.
 */
export function LiveDot({ updatedAt, withinMinutes = 60, showLabel = true, className, ...props }: LiveDotProps) {
  const [minutes, setMinutes] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!updatedAt) return;
    const t = (updatedAt instanceof Date ? updatedAt : new Date(updatedAt)).getTime();
    if (!Number.isFinite(t)) return;
    const compute = () => {
      const m = Math.floor((Date.now() - t) / 60000);
      setMinutes(m >= 0 && m < withinMinutes ? m : null);
    };
    compute();
    const id = window.setInterval(compute, 60000);
    return () => window.clearInterval(id);
  }, [updatedAt, withinMinutes]);
  if (minutes === null) return null;
  const label = minutes < 1 ? "Updated just now" : `Updated ${minutes}m ago`;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-success", className)} title={label} {...props}>
      <span aria-hidden className="animate-pulse-dot" />
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

/* --------------------------------------------------------- CodeReveal */

export interface CouponCodeRevealProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "onCopy"> {
  /** The real coupon code. */
  code: string;
  /** Called after the code is revealed (e.g. to record the click-out). */
  onReveal?: () => void;
  /** Called after a successful copy. */
  onCopied?: () => void;
  revealLabel?: string;
}

/**
 * "Show code" button that slides aside (tear-off feel) to uncover the code, then copies it with an animated
 * check. The code is not exposed to assistive tech until revealed.
 */
export function CouponCodeReveal({ code, onReveal, onCopied, revealLabel = "Show code", className, ...props }: CouponCodeRevealProps) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copyRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(id);
  }, [copied]);

  const reveal = () => {
    setRevealed(true);
    onReveal?.();
    requestAnimationFrame(() => copyRef.current?.focus());
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopied?.();
    } catch {
      // Clipboard blocked: the code is visible and selectable.
    }
  };

  return (
    <div
      className={cn("relative inline-flex h-10 min-w-44 overflow-hidden rounded-md border border-dashed border-primary bg-primary-soft", className)}
      {...props}
    >
      <div className="flex flex-1 items-center justify-between gap-2 pl-3 pr-1" aria-hidden={!revealed} inert={!revealed}>
        <span className="select-all font-mono text-sm font-semibold tracking-wider text-primary-soft-fg">{code}</span>
        <button
          ref={copyRef}
          type="button"
          onClick={copy}
          className={cn(
            "press-scale inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-primary hover:bg-surface",
            focusRing,
          )}
        >
          {copied ? (
            <>
              <AnimatedCheck />
              Copied
            </>
          ) : (
            <>
              <Copy aria-hidden className="size-4" />
              Copy
            </>
          )}
        </button>
        <span role="status" className="sr-only">
          {copied ? `Code ${code} copied` : ""}
        </span>
      </div>
      <button
        type="button"
        onClick={reveal}
        aria-hidden={revealed}
        tabIndex={revealed ? -1 : 0}
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-1.5 bg-primary text-sm font-semibold text-primary-fg",
          "[clip-path:polygon(0_0,100%_0,calc(100%-14px)_100%,0_100%)]",
          "transition-[transform,opacity] duration-slow ease-out motion-reduce:transition-none",
          revealed ? "pointer-events-none translate-x-[85%] opacity-0" : "translate-x-0 opacity-100",
          focusRing,
        )}
      >
        {revealLabel}
      </button>
    </div>
  );
}

/** Check mark that pops in and draws itself (e.g. "Copied", "Alert set"). */
export function AnimatedCheck({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("size-4 animate-pop", className)} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={24} className="animate-check" />
    </svg>
  );
}

