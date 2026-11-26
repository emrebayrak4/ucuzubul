import { ViewTransition } from "react";

/**
 * Route-change animation (used from template.tsx, which remounts per navigation):
 * - default navigations: quick crossfade + slight upward slide
 * - shopping ↔ travel vertical switch: horizontal slide (transition types set on the switcher links)
 * Same-route updates (filters, router.refresh) don't remount, so they never animate.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "vertical-forward": "vt-slide-forward", "vertical-back": "vt-slide-back", default: "vt-page" }}
      exit={{ "vertical-forward": "vt-slide-forward", "vertical-back": "vt-slide-back", default: "vt-page" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
