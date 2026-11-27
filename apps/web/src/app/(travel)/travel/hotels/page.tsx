import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Layers, Receipt, ShieldCheck } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { DemoDataBadge } from "@pricora/ui";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { DESTINATIONS } from "@/components/travel/destinations";
import { PhotoTile } from "@/components/travel/hotels/result-card";
import { fmtUsd } from "@/components/travel/hotels/format";
import { CityPhotoImg, UnsplashCredit } from "@/components/travel/hotels/city-photo";
import { cityPhoto } from "@/lib/city-photos";
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
  // "Deals for the weekend": stay price vs. the same room's typical weekday price from stored rates (rule shown in the UI). Hidden when empty.
  const [dealsRes, destRes] = await Promise.all([load(() => api.travel.hotelDeals({ checkin: wk.checkin, checkout: wk.checkout, limit: 10 })), load(() => api.travel.hotelDestinations())]);
  const deals = dealsRes.ok ? dealsRes.data : null;
  const weekend = deals?.items ?? [];
  const destData = destRes.ok ? destRes.data.items : [];
  const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const tiles = DESTINATIONS.slice(0, 8).map((d) => ({ ...d, data: destData.find((x) => fold(x.city).startsWith(fold(d.city))) ?? null, photo: cityPhoto(d.city) }));

  const guides = await listGuides({ pageSize: 8 });

  return (
    <>
      <TravelHero
        vertical="hotels"
        title={type ? `Find ${type.label.toLowerCase()} for your trip` : "Find your next stay"}
        sub={type ? `Pick a destination and dates — results open filtered to ${type.label.toLowerCase()}.` : `Search stays worldwide and compare providers with ${brand.name}.`}
      >
        <HotelSearchForm key={`${city}:${type?.type ?? ""}`} initial={{ city }} extraParams={type ? { types: type.type } : undefined} />
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
          <p className="mt-1 text-sm text-text-muted">Popular worldwide — tap to see properties. “From” prices are the lowest stored nightly rate in the next 30 days.</p>
          <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" data-testid="destination-shortcuts">
            {tiles.map((d, i) => (
              <li key={d.code} className={"hover-lift relative " + (i < 2 ? "col-span-2 md:col-span-1 lg:col-span-3" : "lg:col-span-2")}>
                <Link
                  href={`/travel/hotels/search${toQueryString({ city: d.data?.city ?? d.city, checkin: wk.checkin, checkout: wk.checkout, guests: 2, rooms: 1 })}`}
                  className={
                    "group relative isolate flex h-40 flex-col justify-end overflow-hidden rounded-lg p-4 text-white transition-shadow hover:shadow-md lg:h-52 " +
                    (d.photo ? "bg-surface-3" : i % 3 === 0 ? "bg-hotels" : i % 3 === 1 ? "bg-flights" : "bg-primary")
                  }
                >
                  {d.photo ? (
                    <>
                      <CityPhotoImg photo={d.photo} sizes={i < 2 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"} priority={i < 2} className="group-hover-zoom -z-20" />
                      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                    </>
                  ) : null}
                  <span className="absolute right-3 top-3 rounded-sm bg-black/35 px-1.5 py-0.5 font-mono text-xs font-bold">{d.code}</span>
                  <span className="text-2xl font-extrabold [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">{d.city}</span>
                  <span className="text-sm opacity-95">{d.country}</span>
                  {d.data ? (
                    <span className="mt-1 text-xs font-semibold opacity-95">
                      {d.data.hotelCount} properties{d.data.lowestNightlyCents !== null ? ` · from ${fmtUsd(d.data.lowestNightlyCents)}/night` : ""}
                      {d.data.source === "demo" ? " · demo data" : ""}
                    </span>
                  ) : null}
                </Link>
                {d.photo ? <UnsplashCredit photo={d.photo} className="left-3 top-3" side="bottom-start" /> : null}
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
              {new Date(wk.checkin + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
              {new Date(wk.checkout + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}, 2 guests. {deals?.rule}
            </p>
            <ul className="scrollbar-none -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0" data-testid="weekend-deals">
              {weekend.map((h) => (
                <li key={h.id} className="w-64 shrink-0 snap-start">
                  <Link href={`/travel/hotels/${encodeURIComponent(h.id)}${toQueryString({ checkin: deals?.checkin ?? wk.checkin, checkout: deals?.checkout ?? wk.checkout, guests: 2, rooms: 1 })}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md">
                    <span className="relative flex aspect-[4/3] items-center justify-center bg-surface-2">
                      <PhotoTile hotel={h} />
                      <span className="absolute right-2 top-2 rounded-sm bg-success px-1.5 py-0.5 text-xs font-bold text-white">{h.savingsPct}% below typical</span>
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="line-clamp-2 font-bold">{h.name}</span>
                      <span className="text-xs text-text-muted">{[h.neighborhood, h.city].filter(Boolean).join(", ")}</span>
                      <span className="mt-auto flex items-baseline gap-1 pt-1">
                        <span className="price text-lg font-extrabold">{fmtUsd(h.lowestNightlyCents ?? 0)}</span>
                        <span className="text-xs text-text-muted">/night</span>
                        <span className="price ml-1 text-xs text-text-muted" title="Median stored price for the same room on these weekdays">
                          typical {fmtUsd(h.typicalNightlyCents)}
                        </span>
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
