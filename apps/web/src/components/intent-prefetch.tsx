"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
// Public `router.prefetch` options take this enum; next/link's public types don't expose `unstable_dynamicOnHover`.
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";

const HOVER_DELAY_MS = 60;
const REFRESH_MS = 30_000;

/**
 * Perf: every page is dynamic (per-request nonce CSP), so Next's viewport prefetch only fetches the shared layout
 * and a click still waits for the server render. When the pointer rests on (or a finger touches) a same-origin
 * link, prefetch that route in full; the 100–400 ms between hover and click usually covers the server render, so the
 * click shows the new page at once. Mounted once in Providers. Production only (dev compiles routes on demand).
 */
export function IntentPrefetch() {
  const router = useRouter();
  const { user, loading } = useSession();
  // A full prefetch is indistinguishable from a navigation on the server, and product pages record "recently viewed"
  // for signed-in visitors — so never prefetch product pages for them (or before we know).
  const skipProducts = loading || user !== null;
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const last = new Map<string, number>();
    let timer: number | undefined;

    const target = (e: Event): string | null => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download") || a.dataset.noPrefetch !== undefined) return null;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.hash && url.pathname === window.location.pathname) return null;
      if (/^\/(api|account|login|signup|logout)(\/|$)/.test(url.pathname)) return null;
      if (skipProducts && url.pathname.startsWith("/products/")) return null;
      const href = url.pathname + url.search;
      return href === window.location.pathname + window.location.search ? null : href;
    };
    const prefetch = (href: string) => {
      const now = Date.now();
      if (now - (last.get(href) ?? 0) < REFRESH_MS) return;
      last.set(href, now);
      router.prefetch(href, { kind: PrefetchKind.FULL });
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const href = target(e);
      window.clearTimeout(timer);
      if (href) timer = window.setTimeout(() => prefetch(href), HOVER_DELAY_MS);
    };
    const onTouch = (e: Event) => {
      const href = target(e);
      if (href) prefetch(href);
    };
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("touchstart", onTouch, { passive: true, capture: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("touchstart", onTouch, { capture: true });
    };
  }, [router, skipProducts]);
  return null;
}
