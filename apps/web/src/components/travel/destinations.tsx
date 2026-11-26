import Link from "next/link";
import { ArrowRight, BedDouble, Compass, MapPin } from "lucide-react";
import { cn } from "@pricora/ui/utils";

/** Worldwide destinations used as search shortcuts only (no prices are shown or implied). */
export const DESTINATIONS = [
  { city: "London", country: "United Kingdom", code: "LON" },
  { city: "Paris", country: "France", code: "PAR" },
  { city: "Istanbul", country: "Türkiye", code: "IST" },
  { city: "Tokyo", country: "Japan", code: "TYO" },
  { city: "New York", country: "United States", code: "NYC" },
  { city: "Dubai", country: "United Arab Emirates", code: "DXB" },
  { city: "Rome", country: "Italy", code: "ROM" },
  { city: "Barcelona", country: "Spain", code: "BCN" },
  { city: "Cancún", country: "Mexico", code: "CUN" },
  { city: "Bangkok", country: "Thailand", code: "BKK" },
  { city: "Amsterdam", country: "Netherlands", code: "AMS" },
  { city: "Lisbon", country: "Portugal", code: "LIS" },
] as const;

export function DestinationShortcuts({ vertical }: { vertical: "flights" | "hotels" }) {
  return (
    <section aria-labelledby={`dest-${vertical}`}>
      <h2 id={`dest-${vertical}`} className="text-xl font-extrabold tracking-tight">
        {vertical === "flights" ? "Popular destinations" : "Trending destinations"}
      </h2>
      <p className="mb-3 mt-1 text-sm text-text-muted">Start a search with one tap. {vertical === "flights" ? "Fares appear only when a provider returns them." : "Rates appear only when a provider returns them."}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="destination-shortcuts">
        {DESTINATIONS.map((d) => (
          <li key={d.code}>
            <Link
              href={vertical === "flights" ? `/travel/flights?to=${d.code}` : `/travel/hotels?city=${encodeURIComponent(d.city)}`}
              className="group flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
            >
              <span className={cn("flex size-9 items-center justify-center rounded-full", vertical === "flights" ? "bg-flights-soft text-flights-soft-fg" : "bg-hotels-soft text-hotels-soft-fg")}>
                <MapPin aria-hidden className="size-4" />
              </span>
              <span className="mt-1 font-bold">{d.city}</span>
              <span className="text-xs text-text-muted">{d.country}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Skyscanner-style dark shortcut cards under the flights hero. */
export function FlightShortcutCards() {
  const cards = [
    { href: "/travel/hotels", label: "Hotels", icon: BedDouble },
    { href: "/travel", label: "Explore everywhere", icon: Compass },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <li key={c.href}>
          <Link href={c.href} className="group flex items-center gap-3 rounded-lg bg-flights px-5 py-5 font-bold text-flights-fg hover:opacity-95">
            <c.icon aria-hidden className="size-5" />
            {c.label}
            <ArrowRight aria-hidden className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
