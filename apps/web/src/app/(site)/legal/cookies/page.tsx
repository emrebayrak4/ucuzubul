import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { CookieSettingsButton } from "@/components/privacy/consent-provider";
import { NON_ESSENTIAL_VENDORS, STORAGE_REGISTRY } from "@/lib/privacy/storage-registry";

export const metadata: Metadata = { title: "Cookie policy (draft)", alternates: { canonical: "/legal/cookies" }, robots: { index: false, follow: true } };

const CATEGORY_LABEL = { necessary: "Strictly necessary", functional: "Functional", analytics: "Analytics", advertising: "Advertising & affiliate measurement" } as const;
const KIND_LABEL = { cookie: "Cookie", localStorage: "Local storage", sessionStorage: "Session storage" } as const;
const th = "border-b border-border px-2 py-1.5 text-left font-semibold";
const td = "border-b border-border px-2 py-1.5 align-top";

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie policy" updated="November 27, 2026">
      <p>
        This table is generated automatically from the single registry of every cookie and browser-storage key our website sets, so it always
        matches the code. All of them are first-party: we don&apos;t load third-party trackers today.
      </p>
      <p>
        Change your choices anytime: <CookieSettingsButton className="font-medium text-primary underline underline-offset-2" /> or{" "}
        <Link href="/privacy-choices">Your Privacy Choices</Link>. A Global Privacy Control signal turns advertising &amp; affiliate measurement off
        automatically.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm" data-testid="cookie-table">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Type</th>
              <th className={th}>Category</th>
              <th className={th}>Purpose</th>
              <th className={th}>Duration</th>
              <th className={th}>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {STORAGE_REGISTRY.map((e) => (
              <tr key={e.kind + e.name}>
                <td className={td + " font-mono text-xs"}>{e.name}</td>
                <td className={td}>
                  {KIND_LABEL[e.kind]}
                  <span className="block text-xs text-text-muted">{e.setBy}</span>
                </td>
                <td className={td}>{CATEGORY_LABEL[e.category]}</td>
                <td className={td}>{e.purpose}</td>
                <td className={td}>{e.duration}</td>
                <td className={td + " text-xs"}>{e.attributes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Analytics and advertising partners</h2>
      {NON_ESSENTIAL_VENDORS.length ? (
        <ul>
          {NON_ESSENTIAL_VENDORS.map((v) => (
            <li key={v.name}>
              {v.name} — {CATEGORY_LABEL[v.category]}: {v.purpose}
            </li>
          ))}
        </ul>
      ) : (
        <p>None are installed. When we add one, it will be listed here and will only load after you allow its category.</p>
      )}
      <h2>Affiliate links</h2>
      <p>
        When you click “Visit store”, the retailer or its affiliate network may set its own cookies on its site to credit us for the sale. Those
        cookies are governed by that company&apos;s policy. Draft note: how a sale/sharing opt-out is applied to outbound affiliate links is
        pending legal review; your choice is already recorded on this browser and in your account.
      </p>
    </LegalPage>
  );
}
