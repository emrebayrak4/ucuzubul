import type { Metadata } from "next";
import { first, type SearchParams } from "@/lib/nav";
import { SearchResults } from "@/components/search/search-results";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = first((await searchParams).q);
  return {
    title: q ? `“${q.slice(0, 60)}” — compare prices` : "Search products",
    description: q ? `Compare prices for ${q.slice(0, 60)} across US stores, with shipping and estimated tax.` : "Search and compare prices across US stores.",
    // Internal search result pages are never indexed (thin/duplicate content), but links are followed.
    robots: { index: false, follow: true },
    alternates: { canonical: "/search" },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = first(sp.q);
  return (
    <div className="container-content py-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{q ? `Results for “${q}”` : "All products"}</h1>
      <SearchResults basePath="/search" searchParams={sp} />
    </div>
  );
}
