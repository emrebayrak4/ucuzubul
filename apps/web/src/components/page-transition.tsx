/**
 * Route-change wrapper (used from the (site)/(travel) layouts and template.tsx).
 * Perf (founder 2026-11-27: "if an animation slows things down, remove it"): the React <ViewTransition> crossfade
 * delayed every content swap by ~50 ms (measured: header nav 188 → 136 ms, category tile 265 → 217 ms, prod build),
 * plus its own 120–240 ms animation. Navigation feedback is now the progress bar + route skeleton (NavFeedback).
 * Kept as a pass-through so the layouts don't need to change.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
