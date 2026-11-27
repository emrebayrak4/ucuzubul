import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@pricora/config/brand";
import { InfoPage } from "@/components/info-page";

const DESCRIPTION = `The rules ${brand.name} follows for prices, deal labels, generated copy, sponsored placements and corrections.`;

export const metadata: Metadata = {
  title: "Editorial policy",
  description: DESCRIPTION,
  alternates: { canonical: "/editorial-policy" },
};

export default function EditorialPolicyPage() {
  return (
    <InfoPage title="Editorial policy" path="/editorial-policy" description={DESCRIPTION} updated="2026-11-27">
      <h2>Independence</h2>
      <p>
        Rankings, Deal Scores and “best” lists are computed from price data. Commercial relationships with stores never change them. Sponsored placements are
        labeled “Sponsored” and are kept out of organic results and scores. Details: <Link href="/legal/affiliate-disclosure">affiliate disclosure</Link>.
      </p>
      <h2>Data honesty</h2>
      <ul>
        <li>No fabricated reviews, ratings, review counts, user counts, trust badges or countdown timers.</li>
        <li>Every price shows its source and when it was last checked.</li>
        <li>Sample listings are labeled “Demo data” and are not presented as live prices — including to search engines.</li>
      </ul>
      <h2>Automatically generated copy</h2>
      <p>
        Category summaries and “best … under $X” intros are generated from live data (product counts, price ranges, brands, recent price cuts). We only publish
        such pages to search engines when enough products have real store prices behind them.
      </p>
      <h2>Corrections</h2>
      <p>
        Wrong prices or mismatched products are fixed at the source. Report one via <Link href="/contact">our contact page</Link>.
      </p>
    </InfoPage>
  );
}
