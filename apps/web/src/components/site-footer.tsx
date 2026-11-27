import Link from "next/link";
import { Smartphone } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { Logo } from "./logo";
import { ZipButton } from "./header/header-client";
import { CookieSettingsButton } from "./privacy/consent-provider";
import { PrivacyChoicesIcon } from "./privacy/privacy-choices-icon";

const columns: Array<{ title: string; links: Array<{ href: string; label: string; draft?: boolean }> }> = [
  {
    title: "Shop",
    links: [
      { href: "/search", label: "All products" },
      { href: "/deals", label: "Today's deals" },
      { href: "/price-drops", label: "Price drops" },
      { href: "/categories/electronics", label: "Electronics" },
      { href: "/categories/home-kitchen", label: "Home & Kitchen" },
    ],
  },
  {
    title: "Travel",
    links: [
      { href: "/travel", label: "Travel home" },
      { href: "/travel/flights", label: "Flights" },
      { href: "/travel/hotels", label: "Hotels" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/compare", label: "Compare products" },
      { href: "/basket", label: "Smart basket" },
      { href: "/account/alerts", label: "Price alerts" },
      { href: "/assistant", label: "Shopping assistant" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/how-we-compare", label: "How we compare prices" },
      { href: "/editorial-policy", label: "Editorial policy" },
      { href: "/legal/affiliate-disclosure", label: "How we make money" },
      { href: "/contact", label: "Contact" },
      { href: "/sitemap", label: "Site map" },
      { href: "/credits", label: "Credits" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy policy", draft: true },
      { href: "/legal/cookies", label: "Cookie policy", draft: true },
      { href: "/legal/terms", label: "Terms of use", draft: true },
      { href: "/legal/affiliate-disclosure", label: "Affiliate disclosure", draft: true },
      { href: "/legal/accessibility", label: "Accessibility", draft: true },
      { href: "/legal/children", label: "Children's privacy", draft: true },
    ],
  },
];

/** Shopping footer never mentions travel (travel is reached only via the Shopping | Flights | Hotels switcher). */
export function SiteFooter({ area = "shopping" }: { area?: "shopping" | "travel" }) {
  const cols = area === "travel" ? columns : columns.filter((c) => c.title !== "Travel");
  return (
    <footer className="mt-12 border-t border-border bg-surface-2" style={{ viewTransitionName: "site-footer" }}>
      <div className="container-content py-10">
        <div className={"grid grid-cols-2 gap-8 md:grid-cols-3 " + (area === "travel" ? "lg:grid-cols-7" : "lg:grid-cols-6")}>
          <div className="col-span-2 flex flex-col gap-3">
            <Logo height={32} />
            <p className="text-sm text-text-muted">{brand.tagline}</p>
            <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-sm">
              <Smartphone aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                <span className="block font-semibold">Mobile apps</span>
                <span className="text-text-muted">Coming soon to iOS &amp; Android.</span>
              </span>
            </div>
          </div>
          {cols.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="text-base font-semibold text-text">{col.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-text-muted hover:text-text hover:underline">
                      {l.label}
                    </Link>
                    {l.draft ? <span className="ml-1.5 rounded-xs bg-warning-soft px-1 text-2xs font-medium text-warning">Draft</span> : null}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-10 border-t border-border pt-6">
          <p className="max-w-4xl text-xs text-text-muted">
            <strong className="font-semibold text-text">Affiliate disclosure:</strong> {brand.name} may earn a commission when you buy through
            links on this site. Commissions never change our price ranking or Deal Score, and sponsored placements are always labeled. Prices,
            shipping and tax are estimates; the retailer&apos;s checkout price is final.{" "}
            <Link href="/legal/affiliate-disclosure" className="text-primary underline underline-offset-2">
              How we make money
            </Link>
          </p>
          {area === "travel" ? (
            <p className="mt-2 text-xs text-text-muted" data-testid="geonames-attribution">
              Geographic data ©{" "}
              <a href="https://www.geonames.org/" target="_blank" rel="noopener" className="underline underline-offset-2">
                GeoNames (geonames.org)
              </a>
              ,{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener license" className="underline underline-offset-2">
                CC BY 4.0
              </a>
              .
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
              <span>
                © {new Date().getFullYear()} {brand.legalEntity}. All rights reserved.
              </span>
              <Link href="/privacy-choices" className="inline-flex items-center gap-1.5 font-medium text-text hover:underline" data-testid="privacy-choices-link">
                <PrivacyChoicesIcon />
                Your Privacy Choices
              </Link>
              <Link href="/privacy-choices#opt-out" className="hover:text-text hover:underline">
                Do Not Sell or Share My Personal Information
              </Link>
              <CookieSettingsButton className="hover:text-text hover:underline" />
            </div>
            <ZipButton />
          </div>
        </div>
      </div>
    </footer>
  );
}
