import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy (draft)", alternates: { canonical: "/legal/privacy" }, robots: { index: false, follow: true } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 26, 2026">
      <p>
        This draft describes how {brand.legalEntity} (“we”) handles information on {brand.name}. You can browse and compare prices without an
        account.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data you give us: name, email, password (stored as a one-way hash), and preferences such as ZIP code and notification settings.</li>
        <li>Activity you create: saved products, price alerts, lists, recently viewed products and searches.</li>
        <li>Technical data: a session cookie to keep you signed in, a security (CSRF) cookie, and an optional ZIP cookie used for tax estimates.</li>
        <li>Outbound clicks: when you choose “Visit store” or “View deal”, we log the click to measure affiliate attribution.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To run the service: show prices, estimate tax and shipping, send the alerts you set up.</li>
        <li>To keep the service secure and prevent abuse.</li>
        <li>We do not sell personal information.</li>
      </ul>
      <h2>Your choices</h2>
      <ul>
        <li>Download a copy of your data or delete your account at any time from Account → Privacy.</li>
        <li>Turn notification types on or off in Account → Settings.</li>
      </ul>
      <h2>Contact</h2>
      <p>Questions: {brand.privacyEmail} (placeholder address).</p>
    </LegalPage>
  );
}
