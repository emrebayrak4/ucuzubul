import type { Metadata } from "next";
import { Layers, ShieldCheck } from "lucide-react";
import { first, type SearchParams } from "@/lib/nav";
import { FlightSearchForm } from "@/components/travel/search-forms";
import { TravelBand } from "@/components/travel/travel-band";

export const metadata: Metadata = {
  title: "Cheap flights — compare fares from multiple providers",
  description: "Search one-way and round-trip flights and compare fares from multiple travel providers in one place.",
  alternates: { canonical: "/travel/flights" },
};

type Props = { searchParams: Promise<SearchParams> };

const iata = (v: string | undefined) => (v && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : "");

export default async function FlightsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Popular-route links prefill origin/destination (no prices are implied).
  const initial = { from: iata(first(sp.from)), to: iata(first(sp.to)) };
  return (
    <>
      <TravelBand title="Find flights" sub="Compare fares from multiple providers. Prices are what providers return — nothing estimated or invented.">
        <FlightSearchForm key={initial.from + initial.to} initial={initial} />
      </TravelBand>
      <div className="container-content py-8">
        <ul className="grid gap-4 sm:grid-cols-2">
          <li className="flex gap-3 rounded-lg border border-border bg-surface p-4">
            <Layers aria-hidden className="mt-0.5 size-5 shrink-0 text-travel" />
            <div>
              <p className="font-semibold">Multiple providers, one search</p>
              <p className="text-sm text-text-muted">Each result shows which provider supplied it. Providers that aren&apos;t connected are listed as such.</p>
            </div>
          </li>
          <li className="flex gap-3 rounded-lg border border-border bg-surface p-4">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-travel" />
            <div>
              <p className="font-semibold">Honest sorting</p>
              <p className="text-sm text-text-muted">“Best”, “Cheapest” and “Fastest” are computed only from the results in front of you.</p>
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}
