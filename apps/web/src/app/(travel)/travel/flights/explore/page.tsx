import type { Metadata } from "next";
import Link from "next/link";
import { Plane } from "lucide-react";
import { FlightExploreQuery, type ExploreDestination, type FlightExploreQueryInput } from "@pricora/contracts";
import { cn } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { first, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { Notice } from "@/components/notices";
import { ExploreFilters } from "@/components/travel/flights/explore-filters";
import { ExploreCard } from "@/components/travel/flights/explore-card";
import { shortDate, usd } from "@/components/travel/flights/format";
import { FlightsHero } from "@/components/travel/flights/flights-hero";

export const metadata: Metadata = {
  title: "Explore everywhere — cheapest flight destinations",
  description: "Pick where you fly from and see the cheapest places to go, grouped by country, with budget, trip-length and direct-flight filters.",
  alternates: { canonical: "/travel/flights/explore" },
};

type Props = { searchParams: Promise<SearchParams> };

const flag = (iso2: string) => String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export default async function ExplorePage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const k of ["from", "depart", "tripLength", "maxPrice", "direct", "country"] as const) {
    const v = first(sp[k]);
    if (v) raw[k] = k === "from" || k === "country" ? v.toUpperCase() : v;
  }
  const initial = { from: raw["from"] ?? "", depart: raw["depart"] ?? "", tripLength: Number(raw["tripLength"] ?? 7), maxPrice: raw["maxPrice"] ?? "", direct: raw["direct"] === "1" };

  let body: React.ReactNode = (
    <div className="rounded-lg border border-dashed border-border-strong p-8 text-center">
      <Plane aria-hidden className="mx-auto size-8 text-flights-action" />
      <p className="mt-2 font-semibold">Where are you flying from?</p>
      <p className="text-sm text-text-muted">Choose an origin above to see the cheapest places to go, grouped by country.</p>
    </div>
  );
  if (raw["from"]) {
    const parsed = FlightExploreQuery.safeParse(raw);
    if (!parsed.success) body = <Notice tone="warning">{parsed.error.issues[0]?.message ?? "Please check your search."}</Notice>;
    else {
      const api = await serverApi({ revalidate: 600 });
      const res = await load(() => api.travel.flightExplore(raw as FlightExploreQueryInput));
      if (!res.ok) body = <ApiErrorPanel error={res.error} />;
      else {
        const d = res.data;
        const byCountry = new Map<string, ExploreDestination[]>();
        for (const x of d.destinations) byCountry.set(x.countryIso2, [...(byCountry.get(x.countryIso2) ?? []), x]);
        const countries = d.countries.filter((c) => byCountry.has(c.iso2));
        const countryHref = (iso2: string | null) => {
          const q = new URLSearchParams(raw);
          if (iso2) q.set("country", iso2);
          else q.delete("country");
          return `/travel/flights/explore?${q.toString()}`;
        };
        body = (
          <div className="flex flex-col gap-6">
            {d.source === "demo" ? (
              <Notice tone="demo" testId="demo-fares-banner">
                <strong>Demo fares — not bookable.</strong> Prices are generated samples until live flight providers are connected.
              </Notice>
            ) : null}
            {d.message && d.source === "none" ? <Notice>{d.message}</Notice> : null}
            <p className="text-sm text-text-muted">
              From <span className="font-semibold text-text">{d.origin.city}</span> · {shortDate(d.depart)}
              {d.return ? ` – ${shortDate(d.return)}` : " · one way"} · {d.destinations.length} destinations
            </p>
            {d.countries.length > 1 ? (
              <nav aria-label="Filter by country" className="flex gap-2 overflow-x-auto pb-1">
                <Link href={countryHref(null)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", !raw["country"] ? "border-flights bg-flights text-flights-fg" : "border-border bg-surface hover:border-flights-action")}>
                  All countries
                </Link>
                {d.countries.slice(0, 30).map((c) => (
                  <Link key={c.iso2} href={countryHref(c.iso2)} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", raw["country"] === c.iso2 ? "border-flights bg-flights text-flights-fg" : "border-border bg-surface hover:border-flights-action")}>
                    <span aria-hidden>{flag(c.iso2)}</span> {c.name} <span className="price text-xs opacity-80">from {usd(c.minPriceCents)}</span>
                  </Link>
                ))}
              </nav>
            ) : null}
            {countries.length === 0 ? <Notice>No destinations match these filters. Try a bigger budget or allow connections.</Notice> : null}
            {countries.map((c) => (
              <section key={c.iso2} aria-labelledby={`c-${c.iso2}`}>
                <h2 id={`c-${c.iso2}`} className="mb-2 flex items-baseline gap-2 text-lg font-bold">
                  <span aria-hidden>{flag(c.iso2)}</span> {c.name}
                  <span className="price text-sm font-normal text-text-muted">from {usd(c.minPriceCents)}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {byCountry.get(c.iso2)!.map((x) => (
                    <ExploreCard key={x.airport} d={x} from={d.origin.code} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      }
    }
  }

  return (
    <>
      <FlightsHero compact title="Explore everywhere" sub="Cheapest places to fly from your city — filter by budget, trip length and direct flights.">
        <ExploreFilters key={JSON.stringify(initial)} initial={initial} />
      </FlightsHero>
      <div className="container-content py-6">{body}</div>
    </>
  );
}
