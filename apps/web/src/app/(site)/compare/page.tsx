import type { Metadata } from "next";
import { load, serverApi } from "@/lib/api-server";
import { first, type SearchParams } from "@/lib/nav";
import { ApiErrorPanel } from "@/components/api-error";
import { CompareFromSelection, CompareTable } from "@/components/compare-view";
import { DemoNotice } from "@/components/notices";

export const metadata: Metadata = {
  title: "Compare products side by side",
  description: "Compare specs, prices and price history of up to 5 products.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/compare" },
};

type Props = { searchParams: Promise<SearchParams> };

export default async function ComparePage({ searchParams }: Props) {
  const raw = first((await searchParams).ids) ?? "";
  const ids = Array.from(new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))).slice(0, 5);

  let body: React.ReactNode;
  if (ids.length < 2) {
    body = <CompareFromSelection />;
  } else {
    const api = await serverApi({ revalidate: 300 });
    const res = await load(() => api.catalog.compare(ids));
    if (!res.ok) body = <ApiErrorPanel error={res.error} />;
    else
      body = (
        <>
          {res.data.products.some((p) => p.card.hasDemoData) ? <DemoNotice className="mb-4" /> : null}
          <CompareTable data={res.data} />
        </>
      );
  }

  return (
    <div className="container-content py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Compare products</h1>
      <p className="mb-5 text-sm text-text-muted">Side by side: prices, price history stats and specifications for up to 5 products. Rows that differ are highlighted; the best price in each row is marked.</p>
      {body}
    </div>
  );
}
