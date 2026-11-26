import type { Metadata } from "next";
import { first, type SearchParams } from "@/lib/nav";
import { DestinationShortcuts, FlightShortcutCards } from "@/components/travel/destinations";
import { FlightSearchForm } from "@/components/travel/search-forms";
import { TravelHero } from "@/components/travel/travel-band";

export const metadata: Metadata = {
  title: "Cheap flights — compare fares from multiple providers",
  description: "Search one-way and round-trip flights worldwide and compare fares from multiple travel providers in one place.",
  alternates: { canonical: "/travel/flights" },
};

type Props = { searchParams: Promise<SearchParams> };

const code = (v: string | undefined) => (v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : "");

export default async function FlightsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Shortcut links prefill origin/destination (no prices are implied).
  const initial = { from: code(first(sp.from)), to: code(first(sp.to)) };
  return (
    <>
      <TravelHero vertical="flights" title="Find cheap flights to anywhere" sub="Compare fares from multiple providers — prices are exactly what providers return, never estimated.">
        <FlightSearchForm key={initial.from + initial.to} initial={initial} />
      </TravelHero>
      <div className="container-content flex flex-col gap-10 py-8">
        <FlightShortcutCards />
        <DestinationShortcuts vertical="flights" />
      </div>
    </>
  );
}
