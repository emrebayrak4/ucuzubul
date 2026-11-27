import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@pricora/config/brand";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy (draft)", alternates: { canonical: "/legal/privacy" }, robots: { index: false, follow: true } };

const th = "border-b border-border px-2 py-1.5 text-left font-semibold";
const td = "border-b border-border px-2 py-1.5 align-top";

/** CCPA/CPRA categories of personal information we collect, with source, purpose, "sold/shared" and retention. */
const CATEGORIES: Array<{ cat: string; examples: string; source: string; purpose: string; disclosed: string; sold: string; retention: string }> = [
  {
    cat: "Identifiers",
    examples: "Name, email, account ID, session token (hashed), device push token",
    source: "You; your device",
    purpose: "Account, sign-in, alerts, security",
    disclosed: "Hosting, email and push providers (service providers)",
    sold: "No",
    retention: "Until you delete your account; sessions 30 days after expiry",
  },
  {
    cat: "Internet / network activity",
    examples: "Searches, products viewed, outbound “Visit store” clicks, IP address (stored as a salted hash on clicks)",
    source: "Your device",
    purpose: "Show recent items, measure affiliate attribution, prevent abuse",
    disclosed: "Retailers / affiliate networks receive a click identifier when you follow a store link",
    sold: "Shared: affiliate measurement may be “sharing” — you can opt out",
    retention: "Searches 90 days (then aggregated); clicks 24 months",
  },
  {
    cat: "Geolocation (not precise)",
    examples: "ZIP code you enter or we estimate; approximate location from your network at the edge",
    source: "You; your device; our hosting edge",
    purpose: "Estimate sales tax and delivered totals",
    disclosed: "Not disclosed",
    sold: "No",
    retention: "Cookie up to 180 days; account until you change it",
  },
  {
    cat: "Precise geolocation (sensitive PI)",
    examples: "Device location — only if you click “Use my location”",
    source: "Your browser / phone, after your permission",
    purpose: "Find the nearest ZIP once",
    disclosed: "Not disclosed",
    sold: "No",
    retention: "Not stored: rounded to ~110 m, used for one lookup and discarded",
  },
  {
    cat: "Inferences / preferences",
    examples: "Favorite retailers, categories, memberships, notification settings",
    source: "You",
    purpose: "Personalize prices and alerts you asked for",
    disclosed: "Not disclosed",
    sold: "No",
    retention: "Until you change them or delete your account",
  },
  {
    cat: "Commercial information",
    examples: "Lists, saved products, price alerts (we never process your payments)",
    source: "You",
    purpose: "Provide the features you use",
    disclosed: "Not disclosed",
    sold: "No",
    retention: "Until you delete them or your account",
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 27, 2026">
      <p>
        This draft describes how {brand.legalEntity} (“we”) collects, uses and discloses personal information on {brand.name} (website, mobile
        apps and browser extension). {brand.name} is offered only in the United States. You can browse and compare prices without an account.
      </p>

      <h2 id="notice-at-collection">Notice at collection</h2>
      <p>
        At or before collection we tell you the categories of personal information we collect, why, whether it is sold or shared, and how long we
        keep it — see the table below. We do not sell personal information for money. Affiliate measurement (telling a store that a purchase came
        from our link) may count as “sharing” for cross-context behavioral advertising or a “sale” under some state laws; you can opt out at{" "}
        <Link href="/privacy-choices">Your Privacy Choices</Link>. We do not use or disclose sensitive personal information for purposes that
        require a right to limit under the CCPA.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="pi-categories">
          <thead>
            <tr>
              <th className={th}>Category</th>
              <th className={th}>Examples</th>
              <th className={th}>Source</th>
              <th className={th}>Business purpose</th>
              <th className={th}>Disclosed to</th>
              <th className={th}>Sold / shared?</th>
              <th className={th}>Retention</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.cat}>
                <td className={td + " font-medium"}>{c.cat}</td>
                <td className={td}>{c.examples}</td>
                <td className={td}>{c.source}</td>
                <td className={td}>{c.purpose}</td>
                <td className={td}>{c.disclosed}</td>
                <td className={td}>{c.sold}</td>
                <td className={td}>{c.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Cookies, similar technologies and Global Privacy Control</h2>
      <p>
        Strictly necessary cookies always run. Functional, analytics and advertising/affiliate-measurement technologies run only after you allow
        them in the cookie banner or <Link href="/privacy-choices">preferences center</Link>. If your browser sends a Global Privacy Control
        (GPC) signal we treat it as a valid request to opt out of sale/sharing for that browser (and your account when signed in), and we show
        “GPC signal honored”. Every cookie and storage key is listed in our <Link href="/legal/cookies">Cookie policy</Link>.
      </p>

      <h2>How we use personal information</h2>
      <ul>
        <li>To provide the service: show prices, estimate tax and delivered totals for your ZIP, send the alerts you set up.</li>
        <li>To secure the service, prevent fraud and abuse, and debug.</li>
        <li>To measure affiliate attribution (with your choice to opt out) and, with consent, aggregate analytics.</li>
        <li>To comply with law and enforce our terms.</li>
      </ul>

      <h2>Your rights (California and other US states)</h2>
      <p>
        Depending on where you live — including California (CCPA/CPRA), Virginia, Colorado, Connecticut, Utah, Texas, Oregon, Montana, Iowa,
        Delaware, Nebraska, New Hampshire, New Jersey, Tennessee, Minnesota, Maryland, Indiana, Kentucky and Rhode Island — you may have the right
        to: know/access and receive a portable copy of your data; delete it; correct it; opt out of the sale or sharing of personal information,
        targeted advertising and profiling with significant effects; and limit the use of sensitive personal information. We extend these choices
        to all US users.
      </p>
      <ul>
        <li>
          Signed in: download or delete your data in <Link href="/account/privacy">Account → Privacy</Link>; correct it in{" "}
          <Link href="/account/settings">Account → Settings</Link>.
        </li>
        <li>
          Not signed in: submit a request at <Link href="/privacy-choices">Your Privacy Choices</Link>. We verify requests by email and respond
          within 45 days (extendable once by 45 days with notice).
        </li>
        <li>Authorized agents may submit requests with proof of authorization.</li>
        <li>
          Appeals: if we deny a request you can appeal by replying to our decision or emailing {brand.privacyEmail}; we answer appeals within the
          time your state law requires and explain how to contact your Attorney General.
        </li>
        <li>We will not discriminate against you for exercising your rights (no different prices or service quality).</li>
      </ul>

      <h2>Children</h2>
      <p>
        {brand.name} is not directed to children under 13 and we do not knowingly collect their personal information. We do not sell or share
        personal information of consumers under 16. See <Link href="/legal/children">Children&apos;s privacy</Link>.
      </p>

      <h2>Security and retention</h2>
      <p>
        We use encryption in transit, hashed passwords and session tokens, least-privilege access and audit logs. We keep data only as long as
        listed above, then delete or aggregate it. Records of privacy requests are kept for 24 months.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We will post changes here and update the date above. Contact: {brand.privacyEmail} (placeholder address). {brand.legalEntity}, United
        States.
      </p>
    </LegalPage>
  );
}
