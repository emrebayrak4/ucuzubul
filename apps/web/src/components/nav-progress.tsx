"use client";

import * as React from "react";
import { createRoot } from "react-dom/client";
import { usePathname, useSearchParams } from "next/navigation";
import { endNavFeedback, startNavFeedback, type PressBox } from "@/lib/nav-feedback";
import { FeedbackLayer } from "./route-skeleton";

function navLinkOf(e: MouseEvent): HTMLAnchorElement | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return a;
}

function pressBoxOf(a: HTMLAnchorElement): PressBox | null {
  const r = a.getBoundingClientRect();
  const area = r.width * r.height;
  if (area === 0 || area > window.innerWidth * window.innerHeight * 0.5) return null;
  // Links in the sticky header stay put while the page scrolls → viewport coordinates.
  const fixed = a.closest("header") !== null;
  return {
    top: r.top + (fixed ? 0 : window.scrollY),
    left: r.left + (fixed ? 0 : window.scrollX),
    width: r.width,
    height: r.height,
    radius: getComputedStyle(a).borderRadius,
    fixed,
  };
}

/**
 * Click feedback for client navigations: starts on pointerdown on a same-origin link (painted while the button is
 * still pressed, before the click and the router transition), confirmed by the click, cancelled by drag /
 * pointercancel / no click within 1 s, ended when the URL changes (or after 10 s). The pressed link gets
 * `data-nav-pending` (slight press via CSS). The visuals (FeedbackLayer: bar, shimmer, route skeleton, brand loader)
 * render in a separate React root so they never interrupt the page's navigation render.
 * Note: next/link calls preventDefault() on its own clicks, so `defaultPrevented` can't mean "cancelled" here.
 */
function NavProgressInner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const pressed = React.useRef<HTMLAnchorElement | null>(null);

  React.useEffect(() => {
    const host = document.createElement("div");
    host.setAttribute("data-nav-feedback", "");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<FeedbackLayer />);
    return () => {
      // Unmount outside the current render/commit.
      window.setTimeout(() => {
        root.unmount();
        host.remove();
      }, 0);
    };
  }, []);

  React.useEffect(() => {
    let downTimer: number | undefined;
    let navTimer: number | undefined;
    const unpress = () => {
      pressed.current?.removeAttribute("data-nav-pending");
      pressed.current = null;
    };
    const cancel = () => {
      unpress();
      endNavFeedback();
    };
    const begin = (a: HTMLAnchorElement) => {
      let box: PressBox | null = null;
      if (pressed.current !== a) {
        unpress();
        pressed.current = a;
        a.setAttribute("data-nav-pending", "");
        box = pressBoxOf(a);
      }
      startNavFeedback(new URL(a.href, window.location.href).pathname, box);
    };
    const onPointerDown = (e: PointerEvent) => {
      const a = navLinkOf(e);
      if (!a) return;
      begin(a);
      window.clearTimeout(downTimer);
      downTimer = window.setTimeout(cancel, 1000);
    };
    const onPointerCancel = () => {
      if (downTimer === undefined) return;
      window.clearTimeout(downTimer);
      downTimer = undefined;
      cancel();
    };
    const onClick = (e: MouseEvent) => {
      window.clearTimeout(downTimer);
      downTimer = undefined;
      const a = navLinkOf(e);
      if (!a) return cancel();
      begin(a);
      window.clearTimeout(navTimer);
      navTimer = window.setTimeout(cancel, 10_000);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(downTimer);
      window.clearTimeout(navTimer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // URL changed → navigation committed.
  React.useEffect(() => {
    pressed.current?.removeAttribute("data-nav-pending");
    pressed.current = null;
    endNavFeedback();
  }, [pathname, search]);

  return null;
}

export function NavProgress() {
  return (
    <React.Suspense fallback={null}>
      <NavProgressInner />
    </React.Suspense>
  );
}
