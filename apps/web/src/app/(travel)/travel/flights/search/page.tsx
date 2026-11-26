import type { Metadata } from "next";
import { FlightSearchQuery } from "@pricora/contracts";
import { load, serverApi } from "@/lib/api-server";
import { first, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { DemoNotice, Notice } from "@/components/notices";
import { FlightResults } from "@/components/travel/flight-results";
import { PendingProvidersState, ProviderStatusList } from "@/components/travel/provider-status";
import { FlightSearchForm } from "@/components/travel/search-forms";
import { TravelHero } from "@/components/travel/travel-band";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const from = first(sp.from)?.toUpperCase();
  const to = first(sp.to)?.toUpperCase();
  return {
    title: from && to ? `Flights ${from} → ${to}` : "Flight search",
    robots: { index: false, follow: true },
    alternates: { canonical: "/travel/flights" },
  };
}

export default async function FlightSearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = {
    from: first(sp.from) ?? "",
    to: first(sp.to) ?? "",
    depart: first(sp.depart) ?? "",
    return: first(sp.return) || undefined,
    adults: first(sp.adults),
    cabin: first(sp.cabin) || undefined,
    children: first(sp.children) || undefined,
    infants: first(sp.infants) || undefined,
    maxStops: first(sp.direct) === "1" ? 0 : undefined,
  };
  const bags = Math.min(2, Math.max(0, Number(first(sp.bags) ?? 0) || 0));
  const parsed = FlightSearchQuery.safeParse(raw);
  const initial = {
    from: raw.from.toUpperCase(),
    to: raw.to.toUpperCase(),
    depart: raw.depart,
    return: raw.return ?? "",
    adults: parsed.success ? parsed.data.adults : 1,
    cabin: parsed.success ? parsed.data.cabin : ("economy" as const),
    trip: raw.return ? ("round" as const) : ("oneway" as const),
    children: parsed.success ? parsed.data.children : 0,
    infants: parsed.success ? parsed.data.infants : 0,
    direct: first(sp.direct) === "1",
    bags,
  };

  let body: React.ReactNode;
  if (!parsed.success) {
    body = <Notice tone="warning">{parsed.error.issues[0]?.message ?? "Please check your search."} Adjust the search above and try again.</Notice>;
  } else {
    const api = await serverApi({ revalidate: 120 });
    const res = await load(() => api.travel.flights(parsed.data));
    if (!res.ok) body = <ApiErrorPanel error={res.error} />;
    else {
      const d = res.data;
      const allPending = d.providers.length > 0 && d.providers.every((p) => p.status !== "live");
      body = (
        <div className="flex flex-col gap-4">
          <ProviderStatusList providers={d.providers} />
          {d.source === "demo" ? <DemoNotice /> : null}
          {d.offers.length === 0 ? (
            allPending ? (
              <PendingProvidersState providers={d.providers} kind="flights" />
            ) : (
              <Notice>No flights found for these dates. Try nearby dates or airports.</Notice>
            )
          ) : (
            <FlightResults data={d} minCheckedBags={bags} />
          )}
        </div>
      );
    }
  }

  return (
    <>
      <TravelHero
        vertical="flights"
        compact
        title={
          initial.from && initial.to ? (
            <>
              Flights <span className="font-mono">{initial.from}</span> → <span className="font-mono">{initial.to}</span>
            </>
          ) : (
            "Flight search"
          )
        }
      >
        <FlightSearchForm key={JSON.stringify(initial)} initial={initial} />
      </TravelHero>
      <div className="container-content py-6">{body}</div>
    </>
  );
}
