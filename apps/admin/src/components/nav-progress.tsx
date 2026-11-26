"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin top progress bar for client-side route changes. Starts on a click on any internal link to another path
 * and is derived as "done" as soon as the pathname matches the target (no timers to clean up on success).
 */
export function NavProgress() {
  const pathname = usePathname();
  const [target, setTarget] = useState<string | null>(null);
  const active = target !== null && target !== pathname;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setTarget(url.pathname);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-toast h-0.5">
      <div
        key={active ? `run-${target}` : "idle"}
        className={
          active
            ? "pc-nav-progress h-full bg-primary"
            : "h-full w-full bg-primary opacity-0 transition-opacity duration-base ease-out"
        }
      />
    </div>
  );
}
