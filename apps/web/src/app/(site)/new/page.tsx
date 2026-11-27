import type { Metadata } from "next";
import { first, type SearchParams } from "@/lib/nav";
import { RankedListPage } from "@/components/catalog/ranked-list-page";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: "Newly added products",
    description: "Products that most recently started appearing at the US stores we track.",
    alternates: { canonical: "/new" },
    robots: first(sp.category) || first(sp.page) ? { index: false, follow: true } : undefined,
  };
}

export default async function NewlyAddedPage({ searchParams }: Props) {
  return (
    <RankedListPage
      basePath="/new"
      searchParams={await searchParams}
      sort="newest"
      title={(c) => (c ? `Newly added in ${c}` : "Newly added")}
      description="Ordered by when a tracked store first listed the product (newest first). New listings have little price history yet, so their Deal Score confidence is lower."
    />
  );
}
