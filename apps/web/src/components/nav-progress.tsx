"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar for client navigations. Starts on pointerdown on a same-origin link (or a keyboard click),
 * completes when the URL changes. Purely decorative (aria-hidden); hidden under reduced motion.
 */
function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");

  React.useEffect(() => {
    const navLink = (e: MouseEvent): boolean => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return false;
      return !(url.pathname === window.location.pathname && url.search === window.location.search);
    };
    // Perf/UX: start on pointerdown (the bar paints while the button is still pressed, before the click and the
    // router transition run); confirmed or cancelled by the click that follows.
    let downTimer: number | undefined;
    let navTimer: number | undefined;
    const idle = () => setState((s) => (s === "loading" ? "idle" : s));
    const onPointerDown = (e: PointerEvent) => {
      if (!navLink(e)) return;
      setState("loading");
      window.clearTimeout(downTimer);
      // No click within 1 s (drag, long-press): drop the bar.
      downTimer = window.setTimeout(idle, 1000);
    };
    const onCancel = () => {
      if (downTimer === undefined) return;
      window.clearTimeout(downTimer);
      downTimer = undefined;
      idle();
    };
    // Note: next/link calls preventDefault() on its own clicks (client navigation), so defaultPrevented can't be
    // used to detect cancelled navigations — the bar used to never start on <Link> clicks. A navigation that
    // never changes the URL is dropped after 10 s instead.
    const onClick = (e: MouseEvent) => {
      window.clearTimeout(downTimer);
      downTimer = undefined;
      if (!navLink(e)) return idle();
      setState("loading");
      window.clearTimeout(navTimer);
      navTimer = window.setTimeout(idle, 10_000);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointercancel", onCancel, true);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(downTimer);
      window.clearTimeout(navTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointercancel", onCancel, true);
      document.removeEventListener("click", onClick);
    };
  }, []);

  React.useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 300);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-toast h-0.5">
      <div
        className={
          state === "loading"
            ? "nav-progress h-full bg-accent"
            : "h-full origin-left scale-x-100 bg-accent opacity-0 transition-[opacity,transform] duration-base"
        }
      />
    </div>
  );
}

export function NavProgress() {
  return (
    <React.Suspense fallback={null}>
      <NavProgressInner />
    </React.Suspense>
  );
}
