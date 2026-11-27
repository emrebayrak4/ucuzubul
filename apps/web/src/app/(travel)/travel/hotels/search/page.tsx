import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { HotelSearchQuery, type HotelSearchQueryInput } from "@pricora/contracts";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { DemoNotice, Notice } from "@/components/notices";
import { PendingProvidersState, ProviderStatusList } from "@/components/travel/provider-status";
import { guideForCity } from "@/lib/guides";
import { HotelResultsView, StickySearchBar, type StaySummary } from "@/components/travel/hotels/results-view";
import { FILTER_KEYS, STAY_KEYS } from "@/components/travel/hotels/url-keys";
import { CityPhotoImg, UnsplashCredit } from "@/components/travel/hotels/city-photo";
import { cityPhoto, cityPhotoBySlug } from "@/lib/city-photos";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const city = first((await searchParams).city);
  return { title: city ? `Hotels in ${city.slice(0, 60)}` : "Hotel search", robots: { index: false, follow: true }, alternates: { canonical: "/travel/hotels" } };
}

export default async function HotelSearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const pick = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, first(sp[k]) || undefined]));
  const stayParams = pick(STAY_KEYS) as Record<string, string | undefined>;
  const filterParams = pick(FILTER_KEYS) as Record<string, string | undefined>;
  const sort = first(sp.sort) || undefined;
  const page = first(sp.page) || undefined;
  const viewRaw = first(sp.view);
  const view = viewRaw === "map" || viewRaw === "grid" ? viewRaw : "list";

  const raw = {
    city: stayParams.city ?? "",
    placeId: stayParams.placeId,
    checkin: stayParams.checkin ?? "",
    checkout: stayParams.checkout ?? "",
    guests: stayParams.guests,
    rooms: stayParams.rooms,
    ...filterParams,
    // Validated by HotelSearchQuery.safeParse below before any API call.
    sort: sort as HotelSearchQueryInput["sort"],
    page,
    pageSize: view === "map" ? "50" : "25",
  };
  const parsed = HotelSearchQuery.safeParse(raw);
  const childAges = (stayParams.ages ?? "").split(",").filter((x) => /^\d{1,2}$/.test(x)).map(Number).slice(0, 8);
  const stay: StaySummary = {
    city: raw.city,
    checkin: raw.checkin,
    checkout: raw.checkout,
    guests: parsed.success ? parsed.data.guests : 2,
    rooms: parsed.success ? parsed.data.rooms : 1,
    adults: Number(stayParams.adults) || undefined,
    childAges,
    work: stayParams.work === "1",
  };
  const detailQuery = toQueryString({ checkin: raw.checkin, checkout: raw.checkout, guests: stayParams.guests, rooms: stayParams.rooms });

  let guideSlug: string | null = null;
  let locationName = raw.city;
  let body: React.ReactNode;
  if (!parsed.success) {
    const missingDates = !raw.checkin || !raw.checkout;
    body = (
      <div className="container-content py-6">
        <Notice tone="warning">
          {missingDates ? "Select your check-in and check-out dates to see prices." : (parsed.error.issues[0]?.message ?? "Please check your search.")} Edit the search above and try again.
        </Notice>
      </div>
    );
  } else {
    const api = await serverApi({ revalidate: 300 });
    const res = await load(() => api.travel.hotels(raw));
    if (!res.ok) body = <div className="container-content py-6"><ApiErrorPanel error={res.error} /></div>;
    else {
      const d = res.data;
      guideSlug = d.guideSlug;
      locationName = d.location?.name ?? raw.city;
      const allPending = d.providers.length > 0 && d.providers.every((p) => p.status !== "live");
      const base = { ...stayParams, ...filterParams, sort, view: view === "list" ? undefined : view };
      const pageHref: Record<number, string> = {};
      for (let p = 1; p <= Math.ceil(d.total / d.pageSize); p++) pageHref[p] = "/travel/hotels/search" + toQueryString({ ...base, page: p > 1 ? p : undefined });
      body =
        d.unfilteredTotal === 0 ? (
          <div className="container-content flex flex-col gap-4 py-6">
            <ProviderStatusList providers={d.providers} />
            {allPending ? <PendingProvidersState providers={d.providers} kind="hotels" /> : <Notice>No properties found for {raw.city || "this place"} yet. Try a nearby city or one of our guide destinations.</Notice>}
          </div>
        ) : (
          <>
            <div className="container-content flex flex-col gap-3 pt-4">
              {d.source === "demo" || d.source === "mixed" ? <DemoNotice /> : null}
              <ProviderStatusList providers={d.providers} />
            </div>
            <HotelResultsView data={d} detailQuery={detailQuery} view={view} pageHref={pageHref} />
          </>
        );
    }
  }

  const guide = guideSlug ? { slug: guideSlug, city: raw.city } : raw.city ? await guideForCity(raw.city) : null;
  const photo = cityPhotoBySlug(guide?.slug) ?? cityPhoto(locationName || raw.city);

  return (
    <>
      <StickySearchBar stay={stay} startOpen={!parsed.success} />
      {photo ? (
        <section className="relative isolate overflow-hidden bg-hotels text-white" data-testid="city-band">
          <CityPhotoImg photo={photo} priority className="-z-20" />
          <UnsplashCredit photo={photo} className="right-3 top-3" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
          <div className="container-content flex min-h-36 flex-col justify-end gap-1 py-5 lg:min-h-48">
            <h1 className="text-2xl font-extrabold tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,.4)] lg:text-3xl">Stays in {locationName}</h1>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              {guide ? (
                <Link href={`/travel/guides/${guide.slug}`} className="inline-flex items-center gap-2 text-sm font-bold underline-offset-2 hover:underline" data-testid="city-guide-link">
                  <BookOpen aria-hidden className="size-4" /> Read the {guide.city} travel guide
                </Link>
              ) : (
                <span />
              )}
            </div>
          </div>
        </section>
      ) : guide ? (
        <div className="container-content pt-3">
          <Link href={`/travel/guides/${guide.slug}`} className="inline-flex items-center gap-2 text-sm font-bold text-hotels-soft-fg hover:underline" data-testid="city-guide-link">
            <BookOpen aria-hidden className="size-4" /> Read the {guide.city} travel guide
          </Link>
        </div>
      ) : null}
      {body}
    </>
  );
}
