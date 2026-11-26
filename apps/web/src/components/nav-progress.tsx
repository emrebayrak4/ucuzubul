"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar for client navigations. Starts on same-origin link clicks,
 * completes when the URL changes. Purely decorative (aria-hidden); hidden under reduced motion.
 */
function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = React.useState<"idle" | "loading" | "done">("idle");

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setState("loading");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
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
