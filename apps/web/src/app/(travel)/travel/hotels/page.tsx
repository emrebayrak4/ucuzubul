import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Layers, Receipt, ShieldCheck } from "lucide-react";
import { brand } from "@pricora/config/brand";
import type { HotelSummary } from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { DESTINATIONS } from "@/components/travel/destinations";
import { PopularWithTravelers, PropertyTypes, TripPlanner } from "@/components/travel/hotels-home";
import { PROPERTY_TYPES } from "@/components/travel/hotels-data";
import { HotelSearchForm } from "@/components/travel/search-forms";
import { GuideTile } from "@/components/travel/guide-card";
import { listGuides } from "@/lib/guides";
import { TravelHero } from "@/components/travel/travel-band";

export const metadata: Metadata = {
  title: "Hotels — compare rates across providers",
  description: "Search hotels worldwide by city and dates and compare nightly rates and total stay prices from multiple providers.",
  alternates: { canonical: "/travel/hotels" },
};

type Props = { searchParams: Promise<SearchParams> };

const why = [
  { icon: Layers, title: "Several providers, one search", text: "Rates from each connected provider side by side, with who supplies them." },
  { icon: Receipt, title: "Totals, not teasers", text: "Nightly rate and total stay; taxes and fees shown when the provider gives them — otherwise we say so." },
  { icon: BellRing, title: "Rate alerts", text: "Get notified when rates for your trip drop (coming with provider connections)." },
  { icon: ShieldCheck, title: "No fake discounts", text: "No invented “was” prices, countdown timers or made-up review counts." },
];

/** Next Friday → Sunday (YYYY-MM-DD), computed at request time. */
function nextWeekend(): { checkin: string; checkout: string } {
  const d = new Date();
  const add = (5 - d.getDay() + 7) % 7 || 7;
  const fri = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  const sun = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 2);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { checkin: f(fri), checkout: f(sun) };
}

export default async function HotelsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const city = (first(sp.city) ?? "").slice(0, 80);
  const type = PROPERTY_TYPES.find((p) => p.key === first(sp.type));
  const api = await serverApi({ revalidate: 1800 });
  const wk = nextWeekend();
  // "Deals for the weekend": only real rate data from providers (demo listings labeled Demo); hidden when empty.
  const weekendCities = ["New York", "Chicago", "Miami", "Los Angeles"];
  const results = await Promise.all(weekendCities.map((c) => load(() => api.travel.hotels({ city: c, checkin: wk.checkin, checkout: wk.checkout, guests: 2, rooms: 1 }))));
  const weekend: Array<HotelSummary & { nights: number }> = results
    .flatMap((r) => (r.ok ? r.data.items.map((h) => ({ ...h, nights: r.data.nights })) : []))
    .filter((h) => h.lowestNightlyCents !== null)
    .sort((a, b) => (a.lowestNightlyCents ?? 0) - (b.lowestNightlyCents ?? 0))
    .slice(0, 8);

  const guides = await listGuides({ pageSize: 8 });

  return (
    <>
      <TravelHero
        vertical="hotels"
        title={type ? `Find ${type.label.toLowerCase()} for your trip` : "Find your next stay"}
        sub={type ? "Property-type filtering applies once providers that support it are connected." : `Search stays worldwide and compare providers with ${brand.name}.`}
      >
        <HotelSearchForm key={city} initial={{ city }} />
      </TravelHero>

      <div className="container-content flex flex-col gap-12 py-10">
        <section aria-labelledby="why">
          <h2 id="why" className="text-xl font-extrabold tracking-tight">
            Why {brand.name}?
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {why.map((w) => (
              <li key={w.title} className="flex gap-3 rounded-lg border border-border bg-surface-2 p-4">
                <w.icon aria-hidden className="mt-0.5 size-6 shrink-0 text-hotels-soft-fg" />
                <div>
                  <p className="font-bold">{w.title}</p>
                  <p className="mt-0.5 text-sm text-text-muted">{w.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <PropertyTypes />

        <section aria-labelledby="trending-dest">
          <h2 id="trending-dest" className="text-xl font-extrabold tracking-tight">
            Trending destinations
          </h2>
          <p className="mt-1 text-sm text-text-muted">Popular worldwide — tap to start a search.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="destination-shortcuts">
            {DESTINATIONS.slice(0, 8).map((d, i) => (
              <li key={d.code} className={i < 2 ? "col-span-2 md:col-span-1 lg:col-span-3" : "lg:col-span-2"}>
                <Link
                  href={`/travel/hotels?city=${encodeURIComponent(d.city)}`}
                  className={
                    "group relative flex h-36 flex-col justify-end overflow-hidden rounded-lg p-4 text-hotels-fg transition-shadow hover:shadow-md lg:h-44 " +
                    (i % 3 === 0 ? "bg-hotels" : i % 3 === 1 ? "bg-flights" : "bg-primary")
                  }
                >
                  <span className="absolute right-3 top-3 rounded-sm bg-white/20 px-1.5 py-0.5 font-mono text-xs font-bold">{d.code}</span>
                  <span className="text-2xl font-extrabold">{d.city}</span>
                  <span className="text-sm opacity-90">{d.country}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <TripPlanner />

        {weekend.length ? (
          <section aria-labelledby="weekend">
            <h2 id="weekend" className="text-xl font-extrabold tracking-tight">
              Deals for the weekend
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Lowest nightly rates we have for {new Date(wk.checkin + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {new Date(wk.checkout + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}, from provider data only.
            </p>
            <ul className="scrollbar-none -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" data-testid="weekend-deals">
              {weekend.map((h) => (
                <li key={h.id} className="w-64 shrink-0 snap-start">
                  <Link href={`/travel/hotels/${encodeURIComponent(h.id)}${toQueryString({ checkin: wk.checkin, checkout: wk.checkout, guests: 2, rooms: 1 })}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
                    <span className="flex aspect-[4/3] items-center justify-center bg-surface-2">
                      {h.imageUrl ? <img src={h.imageUrl} alt="" className="size-full object-cover" loading="lazy" /> : <span className="text-sm text-text-muted">No photo</span>}
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 font-bold">{h.name}</span>
                      <span className="text-xs text-text-muted">{h.city}</span>
                      <span className="mt-auto flex items-baseline gap-1 pt-1">
                        <span className="text-xs text-text-muted">from</span>
                        <span className="price text-lg font-extrabold">{formatPrice(h.lowestNightlyCents ?? 0, { currency: h.currency })}</span>
                        <span className="text-xs text-text-muted">/night</span>
                      </span>
                      {h.source === "demo" ? <DemoDataBadge size="sm" className="w-fit" /> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {guides.ok && guides.data.length ? (
          <section aria-labelledby="guides-home">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="guides-home" className="text-xl font-extrabold tracking-tight">
                Travel guides
              </h2>
              <Link href="/travel/guides" className="text-sm font-bold text-hotels-soft-fg hover:underline">
                All guides
              </Link>
            </div>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {guides.data.slice(0, 4).map((g) => (
                <li key={g.slug}>
                  <GuideTile guide={g} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <PopularWithTravelers />
      </div>
    </>
  );
}
