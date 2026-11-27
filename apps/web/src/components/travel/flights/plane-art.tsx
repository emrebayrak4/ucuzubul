import { cn } from "@pricora/ui/utils";

/**
 * Original side-view jet illustration (inline SVG, brand colors only — no airline livery or stock art).
 * Nose points right. `contrail` draws two fading vapor trails behind the engines.
 */
export function JetSvg({ className, contrail = false, title, trailColor = "#FFFFFF" }: { className?: string; contrail?: boolean; title?: string; trailColor?: string }) {
  const id = `jet-${trailColor.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={contrail ? "-220 0 460 80" : "0 0 240 80"} className={cn("overflow-visible", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${id}-trail`} x1="0" x2="1">
          <stop offset="0" stopColor={trailColor} stopOpacity="0" />
          <stop offset="1" stopColor={trailColor} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE5F7" />
        </linearGradient>
      </defs>
      {contrail ? (
        <g strokeLinecap="round">
          <path d="M-218 56 L112 56" stroke={`url(#${id}-trail)`} strokeWidth="3" />
          <path d="M-190 62 L108 61" stroke={`url(#${id}-trail)`} strokeWidth="2" opacity="0.7" />
        </g>
      ) : null}
      {/* far wing */}
      <path d="M118 36 L150 36 L128 20 L116 20 Z" fill="#B8C6E6" />
      {/* tail fin + stabilizer */}
      <path d="M26 31 L12 5 L32 5 L60 30 Z" fill="#0866FF" />
      <path d="M17 7 L31 7" stroke="#050A31" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path d="M30 41 L6 47 L20 49 L52 43 Z" fill="#C9D6F2" />
      {/* fuselage */}
      <path d="M18 38 C18 32 26 30 40 30 L194 30 C213 30 229 35 236 40 C229 45 213 48 194 48 L40 48 C26 48 18 44 18 38 Z" fill={`url(#${id}-body)`} />
      <path d="M40 42.5 L206 42.5" stroke="#0866FF" strokeWidth="2.2" strokeLinecap="round" />
      {Array.from({ length: 16 }, (_, i) => (
        <circle key={i} cx={68 + i * 8} cy={36.5} r={1.6} fill="#050A31" opacity={0.75} />
      ))}
      <path d="M213 34.5 L226 37.5 L222 39.5 L211 38.5 Z" fill="#050A31" />
      {/* near wing + engine */}
      <path d="M98 43 L150 43 L120 70 L104 70 Z" fill="#AFC0E8" />
      <path d="M109 54 h24 a6 6 0 0 1 0 12 h-24 a6 6 0 0 1 0 -12 Z" fill="#E6ECF8" />
      <ellipse cx="137" cy="60" rx="3" ry="5" fill="#050A31" opacity="0.8" />
    </svg>
  );
}

/** Small plane glyph (top view) for loaders and the page transition. Nose points right. */
export function PlaneGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M21.5 12c0-.8-.7-1.4-1.5-1.4h-5.2L10 3.2H8l2.4 7.4H5.5L3.8 8.4H2.3l1.1 3.6-1.1 3.6h1.5l1.7-2.2h4.9L8 20.8h2l4.8-7.4H20c.8 0 1.5-.6 1.5-1.4Z" fill="currentColor" />
    </svg>
  );
}
