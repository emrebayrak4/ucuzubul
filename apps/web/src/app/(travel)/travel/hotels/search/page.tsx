import type { Metadata } from "next";
import { HotelSearchQuery } from "@pricora/contracts";
import { load, serverApi } from "@/lib/api-server";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { LinkPagination } from "@/components/link-pagination";
import { DemoNotice, Notice } from "@/components/notices";
import { HotelCard } from "@/components/travel/hotel-card";
import { PendingProvidersState, ProviderStatusList } from "@/components/travel/provider-status";
import { HotelSearchForm } from "@/components/travel/search-forms";
import { guideForCity } from "@/lib/guides";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { TravelHero } from "@/components/travel/travel-band";
import { LinkTabs, UrlSelect } from "@/components/url-controls";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const city = first((await searchParams).city);
  return { title: city ? `Hotels in ${city.slice(0, 60)}` : "Hotel search", robots: { index: false, follow: true }, alternates: { canonical: "/travel/hotels" } };
}

const sorts = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Lowest price" },
  { value: "price_desc", label: "Highest price" },
  { value: "stars_desc", label: "Star class" },
] as const;

export default async function HotelSearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = {
    city: first(sp.city) ?? "",
    placeId: first(sp.placeId) || undefined,
    checkin: first(sp.checkin) ?? "",
    checkout: first(sp.checkout) ?? "",
    guests: first(sp.guests),
    rooms: first(sp.rooms),
    minStars: first(sp.minStars) || undefined,
    maxPrice: first(sp.maxPrice) || undefined,
    sort: first(sp.sort) || undefined,
    page: first(sp.page),
  };
  const parsed = HotelSearchQuery.safeParse(raw);
  const base = { city: raw.city, placeId: raw.placeId, checkin: raw.checkin, checkout: raw.checkout, guests: raw.guests, rooms: raw.rooms };
  const href = (o: Record<string, string | number | undefined>) =>
    "/travel/hotels/search" + toQueryString({ ...base, minStars: raw.minStars, maxPrice: raw.maxPrice, sort: raw.sort, ...o });
  const work = first(sp.work) === "1";
  const adults = Number(first(sp.adults)) || undefined;
  const childAges = (first(sp.ages) ?? "").split(",").filter((x) => /^\d{1,2}$/.test(x)).map(Number).slice(0, 8);
  const detailQuery = toQueryString({ checkin: raw.checkin, checkout: raw.checkout, guests: raw.guests, rooms: raw.rooms, work: work ? "1" : undefined });

  let guideSlug: string | null = null;
  let body: React.ReactNode;
  if (!parsed.success) {
    body = <Notice tone="warning">{parsed.error.issues[0]?.message ?? "Please check your search."} Adjust the search above and try again.</Notice>;
  } else {
    const api = await serverApi({ revalidate: 300 });
    const res = await load(() => api.travel.hotels(parsed.data));
    if (!res.ok) body = <ApiErrorPanel error={res.error} />;
    else {
      const d = res.data;
      guideSlug = d.guideSlug ?? null;
      const allPending = d.providers.length > 0 && d.providers.every((p) => p.status !== "live");
      body = (
        <div className="flex flex-col gap-4">
          <ProviderStatusList providers={d.providers} />
          {d.source === "demo" ? <DemoNotice /> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LinkTabs label="Sort hotels" items={sorts.map((s) => ({ href: href({ sort: s.value === "recommended" ? undefined : s.value, page: undefined }), label: s.label, active: parsed.data.sort === s.value }))} />
            <div className="flex flex-wrap gap-2">
              <UrlSelect name="minStars" label="Minimum star class" allLabel="Any star class" options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}+ stars` }))} />
              <UrlSelect name="maxPrice" label="Max nightly price" allLabel="Any price" options={[10000, 15000, 20000, 30000, 50000].map((c) => ({ value: String(c), label: `Up to $${c / 100}/night` }))} />
            </div>
          </div>
          {d.items.length === 0 ? (
            allPending ? (
              <PendingProvidersState providers={d.providers} kind="hotels" />
            ) : (
              <Notice>No rates yet for {raw.city} — providers are connecting soon. Try another destination or different dates.</Notice>
            )
          ) : (
            <>
              <p className="text-sm text-text-muted">
                <span className="price font-semibold text-text">{d.total}</span> hotels · {d.nights} {d.nights === 1 ? "night" : "nights"}
              </p>
              <ul className="flex flex-col gap-3" data-testid="hotel-results">
                {d.items.map((h) => (
                  <li key={h.id}>
                    <HotelCard hotel={h} nights={d.nights} detailQuery={detailQuery} />
                  </li>
                ))}
              </ul>
              <LinkPagination page={d.page} pageCount={Math.ceil(d.total / Math.max(1, d.items.length > 0 && d.page === 1 ? d.items.length : 20))} hrefFor={(p) => href({ page: p > 1 ? p : undefined })} />
            </>
          )}
        </div>
      );
    }
  }

  // Prefer the API's guideSlug; fall back to a name lookup (e.g. free-text city searches).
  const guide = guideSlug ? { slug: guideSlug, city: raw.city } : raw.city ? await guideForCity(raw.city) : null;

  return (
    <>
      <TravelHero vertical="hotels" compact title={raw.city ? `Stays in ${raw.city}` : "Hotel search"}>
        <HotelSearchForm
          key={JSON.stringify(base)}
          initial={{
            city: raw.city,
            checkin: raw.checkin,
            checkout: raw.checkout,
            guests: parsed.success ? parsed.data.guests : 2,
            rooms: parsed.success ? parsed.data.rooms : 1,
            adults,
            childAges,
            work,
          }}
        />
      </TravelHero>
      <div className="container-content py-6">
        {guide ? (
          <Link href={`/travel/guides/${guide.slug}`} className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-bold text-hotels-soft-fg hover:underline" data-testid="city-guide-link">
            <BookOpen aria-hidden className="size-4" /> Read the {guide.city} guide
          </Link>
        ) : null}
        {body}
      </div>
    </>
  );
}
