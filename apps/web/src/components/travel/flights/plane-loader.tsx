import { cn } from "@pricora/ui/utils";

const ARC = "M8 44 Q100 -10 192 44";

/** Plane flying along a dotted arc — loading state for flight results. Static under prefers-reduced-motion. */
export function PlaneLoader({ label = "Searching flights…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-1 text-flights-action", className)} data-testid="plane-loader">
      <svg viewBox="0 0 200 52" className="h-12 w-48" aria-hidden>
        <path d={ARC} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" opacity="0.45" />
        <circle cx="8" cy="44" r="3" fill="currentColor" opacity="0.6" />
        <circle cx="192" cy="44" r="3" fill="currentColor" opacity="0.6" />
        <g className="motion-reduce:hidden">
          <path d="M7 0c0-.4-.3-.7-.7-.7H3.9L1.6-4.4H.6l1.2 3.7H-.6l-.9-1.1h-.7l.5 1.8-.5 1.8h.7l.9-1.1h2.4L.6 4.4h1l2.3-3.7h2.4c.4 0 .7-.3.7-.7Z" fill="currentColor" transform="scale(1.6)">
            <animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto" path={ARC} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.55 1" />
          </path>
        </g>
        <path d="M7 0c0-.4-.3-.7-.7-.7H3.9L1.6-4.4H.6l1.2 3.7H-.6l-.9-1.1h-.7l.5 1.8-.5 1.8h.7l.9-1.1h2.4L.6 4.4h1l2.3-3.7h2.4c.4 0 .7-.3.7-.7Z" fill="currentColor" transform="translate(100 17) scale(1.6)" className="hidden motion-reduce:inline" />
      </svg>
      <span className="text-sm font-medium text-text-muted">{label}</span>
    </div>
  );
}
