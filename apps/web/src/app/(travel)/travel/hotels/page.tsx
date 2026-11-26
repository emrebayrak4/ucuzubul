import type { Metadata } from "next";
import { first, type SearchParams } from "@/lib/nav";
import { HotelSearchForm } from "@/components/travel/search-forms";
import { TravelBand } from "@/components/travel/travel-band";

export const metadata: Metadata = {
  title: "Hotels — compare rates across providers",
  description: "Search hotels by city and dates and compare nightly rates and total stay prices from multiple providers.",
  alternates: { canonical: "/travel/hotels" },
};

type Props = { searchParams: Promise<SearchParams> };

export default async function HotelsPage({ searchParams }: Props) {
  const city = (first((await searchParams).city) ?? "").slice(0, 80);
  return (
    <>
      <TravelBand title="Find hotels" sub="Compare nightly rates and total stay prices from multiple providers. Star class is the hotel category, not a guest rating.">
        <HotelSearchForm key={city} initial={{ city }} />
      </TravelBand>
      <div className="container-content py-8">
        <p className="text-sm text-text-muted">Tip: totals include taxes and fees when the provider supplies them; otherwise we say so.</p>
      </div>
    </>
  );
}
