import type { Metadata } from "next";
import { first, type SearchParams } from "@/lib/nav";
import { RankedListPage } from "@/components/catalog/ranked-list-page";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: "Popular products",
    description: "The most widely stocked products by category, compared across US stores.",
    alternates: { canonical: "/popular" },
    robots: first(sp.category) || first(sp.page) ? { index: false, follow: true } : undefined,
  };
}

export default async function PopularPage({ searchParams }: Props) {
  return (
    <RankedListPage
      basePath="/popular"
      searchParams={await searchParams}
      sort="popular"
      title={(c) => (c ? `Popular in ${c}` : "Popular products")}
      description="Ranked by how many tracked stores carry each product, then by Deal Score. We don't have sales data, so we never call these “best sellers” — and placement can't be bought."
    />
  );
}
