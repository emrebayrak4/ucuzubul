import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { FlightSearchQuery, type FlightSearchQueryInput } from "@pricora/contracts";
import { load, serverApi } from "@/lib/api-server";
import { first, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { Notice } from "@/components/notices";
import { FlightResultsView } from "@/components/travel/flights/flight-results-view";
import { FlightSearchForm, type FlightFormValues } from "@/components/travel/flights/flight-search-form";
import { FlexibleDates } from "@/components/travel/flights/price-calendar";
import { TrackPrices } from "@/components/travel/flights/track-prices";
import { shortDate } from "@/components/travel/flights/format";
import { PendingProvidersState, ProviderStatusList } from "@/components/travel/provider-status";
import { FlightsHero } from "@/components/travel/flights/flights-hero";

type Props = { searchParams: Promise<SearchParams> };

const PASS = ["from", "to", "depart", "return", "legs", "adults", "children", "infants", "cabin", "sort", "stops", "airlines", "alliances", "layovers", "dep", "arr", "maxDuration", "maxLayover", "bags", "hideSelfTransfer", "limit"] as const;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const from = first(sp.from)?.toUpperCase();
  const to = first(sp.to)?.toUpperCase();
  return {
    title: first(sp.legs) ? "Multi-city flights" : from && to ? `Flights ${from} → ${to}` : "Flight search",
    robots: { index: false, follow: true },
    alternates: { canonical: "/travel/flights" },
  };
}

export default async function FlightSearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw: Record<string, string> = {};
  for (const k of PASS) {
    const v = first(sp[k]);
    if (v) raw[k] = k === "from" || k === "to" ? v.toUpperCase() : v;
  }
  // Legacy links: direct=1 → nonstop only; bags=1|2 → checked bag included.
  if (first(sp.direct) === "1" && !raw["stops"]) raw["stops"] = "0";
  if (raw["bags"] && /^\d$/.test(raw["bags"])) raw["bags"] = raw["bags"] === "0" ? "" : "checked";
  if (!raw["bags"]) delete raw["bags"];

  const parsed = FlightSearchQuery.safeParse(raw);
  const legs = parsed.success ? parsed.data.legs : undefined;
  const initial: Partial<FlightFormValues> = {
    from: raw["from"] ?? "",
    to: raw["to"] ?? "",
    depart: raw["depart"] ?? "",
    return: raw["return"] ?? "",
    adults: parsed.success ? parsed.data.adults : 1,
    children: parsed.success ? parsed.data.children : 0,
    infants: parsed.success ? parsed.data.infants : 0,
    cabin: parsed.success ? parsed.data.cabin : "economy",
    trip: legs ? "multi" : raw["return"] ? "round" : "oneway",
    direct: raw["stops"] === "0",
    bags: raw["bags"]?.includes("checked") ? 1 : 0,
    ...(legs ? { legs } : {}),
  };

  let body: React.ReactNode;
  let title: React.ReactNode = "Flight search";
  if (!parsed.success) {
    body = <Notice tone="warning">{parsed.error.issues[0]?.message ?? "Please check your search."} Adjust the search above and try again.</Notice>;
  } else {
    const q = parsed.data;
    const api = await serverApi({ revalidate: 120 });
    const res = await load(() => api.travel.flights(raw as FlightSearchQueryInput));
    if (!res.ok) body = <ApiErrorPanel error={res.error} />;
    else {
      const d = res.data;
      const demo = d.source === "demo" || d.providers.some((p) => p.id === "demo");
      const travelers = q.adults + q.children + q.infants;
      const allPending = !demo && d.providers.length > 0 && d.providers.every((p) => p.status !== "live");
      const providerNotes = d.providers.filter((p) => p.status === "live" && p.id !== "demo" && p.message);
      const route = q.legs ? null : { from: d.query.from, to: d.query.to, depart: d.query.depart, ret: d.query.return };
      title = q.legs ? (
        <>Multi-city · {q.legs.map((l) => l.from).concat(q.legs[q.legs.length - 1]!.to).join(" → ")}</>
      ) : (
        <>
          Flights <span className="font-mono">{d.query.from}</span> → <span className="font-mono">{d.query.to}</span>
        </>
      );
      body = (
        <div className="flex flex-col gap-4">
          {demo ? (
            <Notice tone="demo" testId="demo-fares-banner">
              <strong>Demo fares — not bookable.</strong> Live flight providers aren&apos;t connected yet, so these itineraries and prices are generated samples to preview the experience. They switch to real fares automatically once a provider is configured.
            </Notice>
          ) : null}
          {providerNotes.map((p) => (
            <Notice key={p.id} tone="info">
              {p.name}: {p.message}
            </Notice>
          ))}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-text-muted">
              {q.legs ? `${q.legs.length} flights` : `${shortDate(d.query.depart)}${d.query.return ? ` – ${shortDate(d.query.return)}` : " · one way"}`} · {travelers} {travelers === 1 ? "traveler" : "travelers"}
              {d.query.fromAirports.length > 1 ? <> · any of {d.query.fromAirports.join(", ")}</> : null}
            </p>
            {route ? <TrackPrices from={route.from} to={route.to} depart={route.depart} ret={route.ret} demo={demo} /> : null}
          </div>
          {route ? <FlexibleDates from={route.from} to={route.to} depart={route.depart} ret={route.ret} cabin={q.cabin} /> : null}
          <ProviderStatusList providers={d.providers} />
          {(d.totalUnfiltered ?? d.offers.length) === 0 ? (
            allPending ? (
              <PendingProvidersState providers={d.providers} kind="flights" />
            ) : (
              <Notice>No flights found for these dates. Try nearby dates or airports{route ? " — the flexible-dates view above shows cheaper days" : ""}.</Notice>
            )
          ) : (
            <FlightResultsView data={d} travelers={travelers} />
          )}
          {route ? (
            <Link href={`/travel/flights/explore?from=${route.from}`} className="inline-flex items-center gap-2 self-start text-sm font-semibold text-flights-action hover:underline">
              <Compass aria-hidden className="size-4" /> Explore everywhere from {route.from}
            </Link>
          ) : null}
        </div>
      );
    }
  }

  return (
    <>
      <FlightsHero compact title={title}>
        <FlightSearchForm key={JSON.stringify(initial)} initial={initial} />
      </FlightsHero>
      <div className="container-content py-6">{body}</div>
    </>
  );
}
