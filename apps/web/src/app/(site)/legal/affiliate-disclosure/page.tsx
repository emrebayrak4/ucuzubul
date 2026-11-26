import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Affiliate disclosure (draft)",
  alternates: { canonical: "/legal/affiliate-disclosure" },
  robots: { index: false, follow: true },
};

export default function AffiliateDisclosurePage() {
  return (
    <LegalPage title="Affiliate disclosure" updated="November 26, 2026">
      <p>{brand.name} is free to use. We may earn a commission when you click a “Visit store” or “View deal” link and make a purchase.</p>
      <h2>What commissions never change</h2>
      <ul>
        <li>The order of offers: offers are sorted by estimated total price.</li>
        <li>The Deal Score: it is computed only from price history, other stores&apos; prices, freshness and stock.</li>
        <li>Which stores we show: stores without an affiliate relationship are listed too.</li>
      </ul>
      <h2>Sponsored placements</h2>
      <p>Paid placements are always labeled “Sponsored”, never take the “lowest price” position and never affect organic ranking.</p>
      <h2>Demo data</h2>
      <p>While live store connections are being set up, some listings use sample data. These are always labeled “Demo data”.</p>
    </LegalPage>
  );
}
