"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { JetSvg } from "./plane-art";

const DURATION = 540;

/**
 * Plane fly-across on navigations inside /travel/flights (search → results, results → explore, entering flights
 * from another tab). A fixed, pointer-events-none overlay below the sticky header: the plane crosses left → right
 * and its contrail wipes away a light veil, revealing the new page. Composite-only (transform / clip-path), no layout
 * impact (no CLS), never blocks input, skipped entirely under prefers-reduced-motion. Same-page updates (filters,
 * sort) don't change the pathname and never animate.
 */
export function FlightNavPlane() {
  const pathname = usePathname();
  const prev = React.useRef<string | null>(null);
  const [run, setRun] = React.useState<{ key: number; top: number } | null>(null);

  React.useEffect(() => {
    const first = prev.current === null;
    const changed = !first && prev.current !== pathname;
    prev.current = pathname;
    // On first mount only animate when we arrived by client navigation (e.g. Hotels → Flights tab), not on a hard load.
    const clientNav = first && document.readyState === "complete" && performance.now() > 1500;
    if (!changed && !clientNav) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const header = document.querySelector<HTMLElement>("[data-testid=travel-header]");
    const top = Math.max(0, Math.round(header?.getBoundingClientRect().bottom ?? 0));
    setRun({ key: Date.now(), top });
    const t = window.setTimeout(() => setRun(null), DURATION + 80);
    return () => window.clearTimeout(t);
  }, [pathname]);

  if (!run) return null;
  return (
    <div key={run.key} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-overlay overflow-hidden motion-reduce:hidden" style={{ top: run.top }} data-testid="flight-nav-plane">
      <style>{`
        @keyframes wl-fly { from { transform: translate3d(-22vw, 0, 0) rotate(-3deg); } to { transform: translate3d(104vw, -6vh, 0) rotate(-3deg); } }
        @keyframes wl-wipe { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
        @keyframes wl-fade { 0%, 70% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
      {/* Veil: wiped away from the left, just behind the plane. */}
      <div className="absolute inset-0 bg-surface/85" style={{ animation: `wl-wipe ${DURATION}ms cubic-bezier(0.45, 0, 0.25, 1) both` }}>
        <div className="absolute inset-y-0 left-0 w-40 bg-gradient-to-r from-flights-soft to-transparent" />
      </div>
      {/* Plane + contrail at the leading edge. */}
      <div className="absolute left-0 top-[30%] w-[min(46vw,28rem)] will-change-transform" style={{ animation: `wl-fly ${DURATION}ms cubic-bezier(0.45, 0, 0.25, 1) both, wl-fade ${DURATION}ms linear both` }}>
        <JetSvg contrail trailColor="#0866FF" className="w-full drop-shadow-[0_10px_18px_rgba(5,10,49,0.35)]" />
      </div>
    </div>
  );
}
