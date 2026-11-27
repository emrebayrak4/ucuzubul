import type { Airline } from "@pricora/contracts";
import { cn } from "@pricora/ui";

/** Muted, accessible monogram palette (no airline brand colors or logos are reproduced). */
const PALETTE = ["#1E3A8A", "#0F766E", "#7C2D12", "#4C1D95", "#9D174D", "#155E75", "#3F6212", "#854D0E", "#1F2937", "#B91C1C"];

function colorFor(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Airline mark: the provider-supplied logo when we have one, otherwise a text monogram of the IATA code. */
export function AirlineLogo({ airline, size = "md", className }: { airline: Pick<Airline, "iata" | "name" | "logoUrl">; size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "size-6 text-2xs" : "size-9 text-xs";
  if (airline.logoUrl) {
    return <img src={airline.logoUrl} alt={airline.name} className={cn(box, "shrink-0 rounded-md bg-surface object-contain", className)} loading="lazy" />;
  }
  return (
    <span
      role="img"
      aria-label={airline.name}
      title={airline.name}
      className={cn(box, "inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-tight text-white", className)}
      style={{ backgroundColor: colorFor(airline.iata) }}
    >
      {airline.iata}
    </span>
  );
}

/** Stacked marks for multi-carrier itineraries. */
export function AirlineLogos({ airlines }: { airlines: Array<Pick<Airline, "iata" | "name" | "logoUrl">> }) {
  if (airlines.length <= 1) return airlines[0] ? <AirlineLogo airline={airlines[0]} /> : null;
  return (
    <span className="relative inline-flex size-9 shrink-0">
      <AirlineLogo airline={airlines[0]!} size="sm" className="absolute left-0 top-0" />
      <AirlineLogo airline={airlines[1]!} size="sm" className="absolute bottom-0 right-0 ring-2 ring-surface" />
    </span>
  );
}
