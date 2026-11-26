import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BedDouble, Plane } from "lucide-react";
import type { Airport, ProviderStatus } from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { addDays, toIsoDate } from "@pricora/utils";
import { load, serverApi } from "@/lib/api-server";
import { toQueryString } from "@/lib/nav";
import { FareAlertCta } from "@/components/travel/fare-alert-cta";
import { PLANNED_PROVIDERS, ProviderStatusList } from "@/components/travel/provider-status";
import { FlightSearchForm } from "@/components/travel/search-forms";
import { TravelHero } from "@/components/travel/travel-band";
import { DestinationShortcuts, FlightShortcutCards } from "@/components/travel/destinations";

export const metadata: Metadata = {
  title: "Travel — compare flights and hotels",
  description: "Search flights and hotels across multiple providers. Real fares and rates only, with honest provider status.",
  alternates: { canonical: "/travel" },
};

/** Popular route candidates — only shown when both airports exist in our airport data. Links prefill the search; no prices implied. */
const ROUTES: Array<[string, string]> = [
  ["JFK", "LAX"],
  ["ORD", "MIA"],
  ["SFO", "SEA"],
  ["BOS", "LAS"],
  ["ATL", "DEN"],
  ["DFW", "JFK"],
  ["LAX", "HNL"],
  ["SEA", "ORD"],
];
const CITIES = ["New York", "Chicago", "Los Angeles", "Miami", "San Francisco", "Las Vegas"];

export default async function TravelHomePage() {
  const api = await serverApi({ revalidate: 3600 });
  const codes = Array.from(new Set(ROUTES.flat()));
  const checkin = toIsoDate(addDays(new Date(), 30));
  const checkout = toIsoDate(addDays(new Date(), 33));

  const [airportResults, hotelResults, health] = await Promise.all([
    Promise.all(codes.map((c) => load(() => api.travel.airports(c)))),
    Promise.all(CITIES.map((city) => load(() => api.travel.hotels({ city, checkin, checkout, guests: 2, rooms: 1 })))),
    load(() => api.health()),
  ]);

  const airports = new Map<string, Airport>();
  airportResults.forEach((r, i) => {
    if (!r.ok) return;
    const hit = r.data.items.find((a) => a.iata === codes[i]);
    if (hit) airports.set(hit.iata, hit);
  });
  const routes = ROUTES.filter(([a, b]) => airports.has(a) && airports.has(b));

  const destinations = CITIES.map((city, i) => {
    const r = hotelResults[i];
    return r && r.ok && r.data.total > 0 ? { city, total: r.data.total, demo: r.data.source === "demo" || r.data.source === "mixed" } : null;
  }).filter((d): d is { city: string; total: number; demo: boolean } => d !== null);

  const providers: ProviderStatus[] = health.ok
    ? health.data.adapters
        .filter((a) => a.kind === "travel" && PLANNED_PROVIDERS.includes(a.id))
        .map((a) => ({ id: a.id, name: a.name, status: a.status === "live" ? "live" : a.status === "error" ? "error" : "pending_configuration" }))
    : [];

  return (
    <>
      <TravelHero vertical="flights" active="explore" title="Where to next?" sub="Compare flights and hotels from multiple providers — real fares and rates only.">
        <FlightSearchForm />
      </TravelHero>

      <div className="container-content flex flex-col gap-10 py-8">
        {providers.length ? (
          providers.some((p) => p.status === "live") ? (
            <ProviderStatusList providers={providers} />
          ) : (
            <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm" data-testid="provider-status">
              <span className="font-semibold text-flights-soft-fg">Live fares: connecting soon</span>
              <span className="text-text-muted">
                We&apos;re setting up {providers.map((p) => p.name.replace(/ (.*)$/, "")).join(", ")}. Until then, flight searches show no fares (we never invent them) and hotel listings are labeled demo data.
              </span>
            </section>
          )
        ) : null}

        <FlightShortcutCards />
        <DestinationShortcuts vertical="flights" />

        {routes.length ? (
          <section aria-labelledby="routes-title">
            <h2 id="routes-title" className="mb-1 text-xl font-semibold tracking-tight">
              Popular routes
            </h2>
            <p className="mb-3 text-sm text-text-muted">Start a search with one tap — fares appear only when a provider returns them.</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="popular-routes">
              {routes.map(([a, b]) => {
                const from = airports.get(a)!;
                const to = airports.get(b)!;
                return (
                  <li key={a + b}>
                    <Link
                      href={"/travel/flights" + toQueryString({ from: a, to: b })}
                      className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-flights-soft text-flights-soft-fg">
                        <Plane aria-hidden className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {from.city} → {to.city}
                        </span>
                        <span className="font-mono text-xs text-text-muted">
                          {a} – {b}
                        </span>
                      </span>
                      <ArrowRight aria-hidden className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {destinations.length ? (
          <section aria-labelledby="dest-title">
            <h2 id="dest-title" className="mb-1 text-xl font-semibold tracking-tight">
              Popular hotel destinations
            </h2>
            <p className="mb-3 text-sm text-text-muted">Hotel counts come from our current listings for a 3-night stay a month from now.</p>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="popular-destinations">
              {destinations.map((d) => (
                <li key={d.city}>
                  <Link
                    href={"/travel/hotels/search" + toQueryString({ city: d.city, checkin, checkout, guests: 2, rooms: 1 })}
                    className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-shadow hover:shadow-md"
                  >
                    <span className="flex size-10 items-center justify-center rounded-full bg-flights-soft text-flights-soft-fg">
                      <BedDouble aria-hidden className="size-5" />
                    </span>
                    <span className="font-semibold">{d.city}</span>
                    <span className="price text-xs text-text-muted">
                      {d.total} {d.total === 1 ? "hotel" : "hotels"}
                    </span>
                    {d.demo ? <DemoDataBadge size="sm" className="w-fit" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <FareAlertCta />
      </div>
    </>
  );
}
