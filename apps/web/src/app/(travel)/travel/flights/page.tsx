import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarRange, Compass, Route } from "lucide-react";
import { first, type SearchParams } from "@/lib/nav";
import { DestinationShortcuts, FlightShortcutCards } from "@/components/travel/destinations";
import { FlightSearchForm } from "@/components/travel/flights/flight-search-form";
import { FlightsHero } from "@/components/travel/flights/flights-hero";

export const metadata: Metadata = {
  title: "Cheap flights — compare fares from multiple providers",
  description: "Search one-way, round-trip and multi-city flights worldwide, compare fares, use flexible dates and explore the cheapest destinations.",
  alternates: { canonical: "/travel/flights" },
};

type Props = { searchParams: Promise<SearchParams> };

const code = (v: string | undefined) => (v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : "");

const TOOLS = [
  { href: "/travel/flights/explore", Icon: Compass, title: "Explore everywhere", text: "See the cheapest places to fly from your city, grouped by country." },
  { href: "/travel/flights?trip=multi", Icon: Route, title: "Multi-city trips", text: "Plan up to five flights in one search — choose Multi-city above." },
  { href: "/travel/flights/explore", Icon: CalendarRange, title: "Flexible dates", text: "Every route search shows a ±3-day price grid, a month view and a price trend." },
];

export default async function FlightsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Shortcut links prefill origin/destination (no prices are implied).
  const initial = { from: code(first(sp.from)), to: code(first(sp.to)), ...(first(sp.trip) === "multi" ? { trip: "multi" as const } : {}) };
  return (
    <>
      <FlightsHero title="Where do you want to go?" sub="Compare fares from multiple providers, with flexible dates, smart filters and price alerts.">
        <FlightSearchForm key={initial.from + initial.to} initial={initial} />
      </FlightsHero>
      <div className="container-content flex flex-col gap-10 py-8">
        <section aria-label="Flight tools" className="grid gap-3 md:grid-cols-3">
          {TOOLS.map(({ href, Icon, title, text }) => (
            <Link key={title} href={href} className="group flex items-start gap-3 rounded-lg border border-border bg-surface p-4 hover:border-flights-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-flights-soft text-flights-soft-fg">
                <Icon aria-hidden className="size-5" />
              </span>
              <span>
                <span className="flex items-center gap-1 font-semibold">
                  {title} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="text-sm text-text-muted">{text}</span>
              </span>
            </Link>
          ))}
        </section>
        <FlightShortcutCards />
        <DestinationShortcuts vertical="flights" />
      </div>
    </>
  );
}
