import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of use (draft)", alternates: { canonical: "/legal/terms" }, robots: { index: false, follow: true } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="November 26, 2026">
      <p>These draft terms govern your use of {brand.name}, operated by {brand.legalEntity}.</p>
      <h2>Prices are information, not offers</h2>
      <p>
        We show prices, shipping and estimated tax collected from retailers, feeds and travel providers. Prices can change at any time; the price
        shown at the retailer&apos;s or provider&apos;s checkout is final. Tax and totals are estimates. Data labeled “Demo data” is sample data,
        not a live price.
      </p>
      <h2>Purchases happen elsewhere</h2>
      <p>We don&apos;t sell products or travel. Purchases are made with the retailer or provider and are subject to their terms and policies.</p>
      <h2>Accounts</h2>
      <ul>
        <li>Keep your credentials secure and provide accurate information.</li>
        <li>Don&apos;t misuse the service, scrape it in ways that bypass our controls, or interfere with its operation.</li>
      </ul>
      <h2>Changes</h2>
      <p>We may update these terms; material changes will be announced on the site.</p>
    </LegalPage>
  );
}
