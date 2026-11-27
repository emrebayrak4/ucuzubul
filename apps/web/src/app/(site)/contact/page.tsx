import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { InfoPage } from "@/components/info-page";

const DESCRIPTION = `How to reach the ${brand.name} team about prices, corrections, privacy or partnerships.`;

export const metadata: Metadata = {
  title: "Contact us",
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  // brand.supportEmail / privacyEmail are placeholders (".example") until launch — shown as-is, never faked as real inboxes.
  const placeholder = brand.supportEmail.endsWith(".example");
  return (
    <InfoPage title="Contact us" path="/contact" description={DESCRIPTION} updated="2026-11-27" type="ContactPage">
      {placeholder ? (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Pre-launch: these addresses are placeholders and are not monitored yet.</p>
      ) : null}
      <h2>Price corrections</h2>
      <p>
        Spotted a wrong price, a dead link or a product matched to the wrong listing? Email <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> with the
        product page URL. Corrections are reviewed by a person and fixed at the data source, not hidden.
      </p>
      <h2>Privacy requests</h2>
      <p>
        For access, deletion or opt-out requests, email <a href={`mailto:${brand.privacyEmail}`}>{brand.privacyEmail}</a> or use Account → Privacy.
      </p>
      <h2>Company</h2>
      <p>
        {brand.name} is operated by {brand.legalEntity} (United States).
      </p>
    </InfoPage>
  );
}
