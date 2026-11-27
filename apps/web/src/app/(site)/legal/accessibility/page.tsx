import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Accessibility statement (draft)", alternates: { canonical: "/legal/accessibility" }, robots: { index: false, follow: true } };

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility statement" updated="November 27, 2026">
      <p>
        {brand.legalEntity} wants {brand.name} to be usable by everyone. Our target is conformance with the Web Content Accessibility Guidelines
        (WCAG) 2.2 at Level AA.
      </p>
      <h2>What we do</h2>
      <ul>
        <li>Semantic HTML, labelled form controls, visible keyboard focus and a “Skip to content” link.</li>
        <li>Color tokens checked for contrast in light and dark mode; information is never conveyed by color alone (e.g. Deal Score has text).</li>
        <li>Reduced-motion preferences respected; dialogs trap focus and close with Escape.</li>
        <li>Prices and totals are read as text, not images; charts include text summaries.</li>
      </ul>
      <h2>Known limitations</h2>
      <ul>
        <li>Some retailer logos and product photos come from third parties and may lack detailed descriptions.</li>
        <li>Interactive price-history charts are being improved for screen readers; the price table below each chart has the same data.</li>
      </ul>
      <p>We have not yet completed an independent audit; this statement will be updated after one.</p>
      <h2>Feedback</h2>
      <p>
        If something is hard to use, email {brand.supportEmail} with the page and what happened. We aim to reply within 5 business days and can
        provide the information in another format.
      </p>
    </LegalPage>
  );
}
