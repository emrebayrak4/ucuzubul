import type { Metadata } from "next";
import Link from "next/link";
import { Check, FileSpreadsheet, MapPin, Megaphone, PlugZap, ShieldCheck, Store } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { Crumbs } from "@/components/crumbs";
import { metaDescription } from "@/lib/seo";

// Funnel: /sell/start → sign up / log in on the site → merchant portal application (shared session).
const APPLY = "/sell/start";

const DESCRIPTION = `List your local store on ${brand.name} for free. Shoppers near you see your in-store price and stock next to big-box and online prices.`;

export const metadata: Metadata = {
  title: `Sell on ${brand.name} — free listings for local stores`,
  description: metaDescription(DESCRIPTION),
  alternates: { canonical: "/sell" },
};

const STEPS = [
  { icon: Store, title: "Tell us about your store", body: "Business name, contact and your store address. Takes about five minutes." },
  { icon: FileSpreadsheet, title: "Add your products", body: "Upload a CSV/XML file or connect Shopify, WooCommerce, Square, Clover or a Google Merchant feed." },
  { icon: MapPin, title: "Set stock per location", body: "In stock, limited or out — plus pickup and delivery radius. Shoppers within range see you under “Available nearby”." },
  { icon: ShieldCheck, title: "We review, you go live", body: "We check the business and address before your listing appears. Nothing is shown before that." },
];

const CONNECTORS = ["Shopify", "WooCommerce", "Square", "Clover", "Google Merchant Center feed", "CSV / XML upload"];

export default function SellPage() {
  return (
    <div className="container-content py-6">
      <Crumbs items={[{ label: "Home", href: "/" }, { label: `Sell on ${brand.name}` }]} />

      <section className="mt-2 grid items-center gap-8 lg:grid-cols-12" aria-labelledby="sell-title">
        <div className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">For local stores</p>
          <h1 id="sell-title" className="mt-2 text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            Get found by shoppers comparing prices near you
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-text-muted">
            {brand.name} compares what a product costs across US stores. Add your shop and people searching for the things you sell see your price, your
            distance and whether it&apos;s on the shelf today — right next to the national chains.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={APPLY}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              data-testid="sell-apply"
            >
              List your store — free
            </a>
            <Link href="/how-we-compare" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              How we rank stores
            </Link>
          </div>
          <p className="mt-2 text-xs text-text-muted">You&apos;ll need a {brand.name} account. No credit card, no listing fee.</p>
        </div>
        <ul className="grid gap-3 rounded-xl border border-border bg-surface p-5 lg:col-span-5" aria-label="What's included">
          {[
            "Free listing — no fees per product or per click",
            "Your store price, stock and pickup shown to nearby shoppers",
            "Ranked by price and distance, never by who pays",
            "Optional promoted listings, always labeled “Sponsored”",
            "Clicks and views for your listings in the merchant portal",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2 text-sm text-text">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-(--pc-section-gap)" aria-labelledby="how-title">
        <h2 id="how-title" className="text-xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-fg">{i + 1}</span>
                <s.icon aria-hidden className="size-4 text-text-muted" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-text">{s.title}</h3>
              <p className="mt-1 text-sm text-text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-(--pc-section-gap) grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <PlugZap aria-hidden className="size-5 text-primary" /> Bring your catalog
          </h2>
          <p className="mt-1 text-sm text-text-muted">Connect the system you already use. We match your items to our catalog by UPC/GTIN; anything we can&apos;t match goes to a review queue.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {CONNECTORS.map((c) => (
              <li key={c} className="rounded-full border border-border px-3 py-1 text-xs text-text">
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone aria-hidden className="size-5 text-primary" /> Fair ranking, clearly labeled ads
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Organic results are ordered by price, distance and stock. Promoted listings appear in a separate slot marked “Sponsored” and never change the organic
            order or anyone&apos;s Deal Score.
          </p>
          <p className="mt-2 text-xs text-text-muted">
            Store locations start at ZIP-code precision; we show “approx.” distances until precise geocoding is set up for your address.
          </p>
        </div>
      </section>

      <section className="mt-(--pc-section-gap) rounded-xl bg-primary-soft p-6 text-center">
        <h2 className="text-xl font-semibold text-primary-soft-fg">Ready to be on the map?</h2>
        <a href={APPLY} className="mt-3 inline-flex h-10 items-center rounded-md bg-primary px-5 text-base font-medium text-primary-fg hover:bg-primary-hover">
          Start your free listing
        </a>
      </section>
    </div>
  );
}
