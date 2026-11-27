"use client";

import * as React from "react";
import { Skeleton } from "@pricora/ui";
import { useNavFeedback } from "@/lib/nav-feedback";
import { DetailPageSkeleton, GridPageSkeleton, ResultsPageSkeleton } from "./page-skeletons";

const SKELETON_AFTER_MS = 120;
const LOADER_AFTER_MS = 800;
const FADE_MS = 180;

function CouponsSkeleton() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function GenericSkeleton() {
  return (
    <div className="container-content py-6" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-60" />
      <Skeleton className="mb-6 h-9 w-80 max-w-full" />
      <div className="max-w-3xl space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className={i % 3 === 2 ? "h-4 w-2/3" : "h-4 w-full"} />
        ))}
      </div>
    </div>
  );
}

function skeletonFor(path: string): React.ReactNode {
  if (path.startsWith("/products/")) return <DetailPageSkeleton />;
  if (/^\/(categories|brands|stores|best)\//.test(path) || /^\/(search|new|popular)$/.test(path)) return <ResultsPageSkeleton />;
  if (path === "/" || path === "/deals" || path === "/price-drops") return <GridPageSkeleton />;
  if (path === "/coupons") return <CouponsSkeleton />;
  return <GenericSkeleton />;
}

/** Top progress bar: brand blue with a soft glow; short fade-out when the page arrives. */
function Bar() {
  const nav = useNavFeedback();
  const [done, setDone] = React.useState<number | null>(null);
  const last = React.useRef(0);
  React.useEffect(() => {
    if (nav.pending) {
      last.current = nav.id;
      return;
    }
    if (last.current === 0) return;
    const id = last.current;
    last.current = 0;
    setDone(id);
    const t = window.setTimeout(() => setDone(null), 300);
    return () => window.clearTimeout(t);
  }, [nav.pending, nav.id]);
  if (!nav.pending && done === null) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-toast h-[3px]">
      <div key={nav.pending ? nav.id : `done-${done}`} className={nav.pending ? "nav-progress h-full" : "nav-progress nav-progress-done h-full"} />
    </div>
  );
}

/** Light shimmer sweep over the link that was pressed (the link itself gets a slight press via CSS). */
function Press() {
  const { pending, press } = useNavFeedback();
  if (!pending || !press) return null;
  return (
    <div
      aria-hidden
      className={press.fixed ? "nav-press-shimmer pointer-events-none fixed z-toast overflow-hidden" : "nav-press-shimmer pointer-events-none absolute z-[1] overflow-hidden"}
      style={{ top: press.top, left: press.left, width: press.width, height: press.height, borderRadius: press.radius }}
    />
  );
}

/**
 * Destination skeleton over the content area (below the sticky header; never a full-screen blocker): appears 120 ms
 * after the click if the page hasn't arrived, shows the brand "w" loader after 800 ms, then crossfades out (180 ms)
 * over the new page. Fixed-position, so no layout shift. Client-only on purpose: a route `loading.tsx` on slug
 * routes would break their real 404 status (BUG-W01).
 */
function RouteSkeleton() {
  const nav = useNavFeedback();
  const [phase, setPhase] = React.useState<"hidden" | "shown" | "leaving">("hidden");
  const [loader, setLoader] = React.useState(false);
  const [to, setTo] = React.useState("/");
  const [top, setTop] = React.useState(0);

  React.useEffect(() => {
    if (!nav.pending) {
      setLoader(false);
      setPhase((p) => (p === "shown" ? "leaving" : p));
      return;
    }
    if (nav.to === null) return; // same-page update (filters): progress bar only
    const dest = nav.to;
    const elapsed = performance.now() - nav.startedAt;
    const t1 = window.setTimeout(() => {
      setTo(dest);
      setTop(Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0));
      setPhase("shown");
    }, Math.max(0, SKELETON_AFTER_MS - elapsed));
    const t2 = window.setTimeout(() => setLoader(true), Math.max(0, LOADER_AFTER_MS - elapsed));
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [nav.pending, nav.to, nav.startedAt, nav.id]);

  React.useEffect(() => {
    if (phase !== "leaving") return;
    const t = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;
  return (
    <div
      aria-hidden
      inert
      data-route-skeleton=""
      data-leaving={phase === "leaving" ? "" : undefined}
      className="route-skeleton pointer-events-none fixed inset-x-0 bottom-0 z-[99] overflow-hidden bg-bg"
      style={{ top }}
    >
      {skeletonFor(to)}
      <div className="pointer-events-none absolute inset-x-0 top-[22vh] flex justify-center">
        <span
          className={
            "flex size-16 items-center justify-center rounded-full bg-surface shadow-md ring-1 ring-border transition-opacity duration-base " +
            (loader && phase === "shown" ? "opacity-100" : "opacity-0")
          }
        >
          {/* Brand "w" mark; fetched with the skeleton so it is ready at 800 ms. */}
          <img src="/brand/mark.png" alt="" width={36} height={36} className={loader ? "brand-loader size-9" : "size-9"} />
        </span>
      </div>
    </div>
  );
}

/**
 * Everything visual about navigation feedback. Rendered into its own React root by NavProgress: updates here
 * (bar start, skeleton at 120 ms) must not interrupt the router's in-flight transition render in the page root —
 * measured: rendering the skeleton inside the page tree restarted that render and delayed the category page by ~150 ms.
 */
export function FeedbackLayer() {
  return (
    <>
      <Bar />
      <Press />
      <RouteSkeleton />
    </>
  );
}
