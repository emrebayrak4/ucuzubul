import type { Metadata } from "next";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Children's privacy (draft)", alternates: { canonical: "/legal/children" }, robots: { index: false, follow: true } };

export default function ChildrenPage() {
  return (
    <LegalPage title="Children's privacy (COPPA)" updated="November 27, 2026">
      <p>
        {brand.name} is a general-audience shopping service. It is not directed to children under 13, and we do not knowingly collect personal
        information from children under 13 as defined by the Children&apos;s Online Privacy Protection Act (COPPA).
      </p>
      <ul>
        <li>Accounts are for people 13 and older (18+ to make purchases at retailers, which happen on their sites).</li>
        <li>We do not sell or share personal information of anyone we know to be under 16.</li>
        <li>We don&apos;t run behavioral advertising aimed at children.</li>
      </ul>
      <h2>If you believe a child gave us information</h2>
      <p>
        A parent or guardian can email {brand.privacyEmail}. We will delete the child&apos;s information and the account promptly after
        verifying the request.
      </p>
    </LegalPage>
  );
}
