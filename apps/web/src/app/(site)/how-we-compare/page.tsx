import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@pricora/config/brand";
import { InfoPage } from "@/components/info-page";
import { JsonLd } from "@/components/json-ld";
import { faqJsonLd } from "@/lib/seo";

const DESCRIPTION = `How ${brand.name} collects prices, ranks offers, computes the Deal Score and detects fake discounts — with the exact weights we use.`;

/** Weights mirror packages/algorithms/src/dealScore.ts (DEAL_WEIGHTS). Keep in sync if they change. */
const WEIGHTS: Array<[string, number, string]> = [
  ["Price vs. its own 90-day median", 30, "How far today's price sits below the product's typical price over the last 90 days."],
  ["Closeness to the all-time low", 25, "How near today's price is to the lowest price we have ever recorded for it."],
  ["Price vs. other stores", 20, "Whether this store is actually cheaper than the other stores carrying the same product."],
  ["Store reliability", 10, "Store-level signals such as return policy and data quality — never whether the store pays us."],
  ["Freshness", 10, "How recently the price was checked. Old prices count for less."],
  ["Stock", 5, "In-stock offers score higher than out-of-stock or unknown ones."],
];

const FAQ = [
  {
    q: "How is the Deal Score calculated?",
    a: "The Deal Score (0–100) combines six factors: price vs. the product's 90-day median (30%), closeness to its all-time low (25%), price vs. other stores (20%), store reliability (10%), freshness (10%) and stock (5%). Missing factors are dropped and the rest re-weighted; with too little history the score is hidden.",
  },
  {
    q: "How do you detect fake discounts?",
    a: "We compare the advertised discount with the real drop vs. the product's own price history. If a store claims 40% off but the price is only 8% below its 90-day median, or the price was raised shortly before the sale, we show a warning.",
  },
  {
    q: "Does paying you change the ranking?",
    a: "No. Offers are sorted by estimated total price. Sponsored placements are labeled, never take the lowest-price position and never change the Deal Score.",
  },
  {
    q: "Are the prices live?",
    a: "Each price shows when it was last checked. Prices older than our freshness window are marked “Price may have changed”. Sample listings used before live store connections are labeled “Demo data”.",
  },
];

export const metadata: Metadata = {
  title: "How we compare prices",
  description: DESCRIPTION,
  alternates: { canonical: "/how-we-compare" },
};

export default function HowWeComparePage() {
  return (
    <InfoPage title="How we compare prices" path="/how-we-compare" description={DESCRIPTION} updated="2026-11-27">
      <JsonLd data={faqJsonLd(FAQ)} />
      <h2>Where prices come from</h2>
      <ul>
        <li>Retailer APIs and product feeds, and affiliate-network feeds where a store offers one.</li>
        <li>Merchant uploads from stores that list with us directly.</li>
        <li>Never by bypassing a CAPTCHA, a login or a store&apos;s terms of service.</li>
      </ul>
      <p>Every offer carries its source and the time it was last checked; both are shown on each product page and in our Markdown versions.</p>
      <h2>Matching the same product</h2>
      <p>
        Offers are matched on identifiers first (UPC/EAN/GTIN, MPN, model number), then on normalized title and specs. Variants such as storage size or
        colour are kept as separate products with links between them, because they have different prices.
      </p>
      <h2>Ranking offers</h2>
      <p>
        Offers are sorted by <strong>estimated total</strong>: price + shipping + estimated sales tax for your ZIP code (tax is excluded until you set a ZIP).
        Membership-only shipping is shown, not assumed.
      </p>
      <h2>The Deal Score</h2>
      <table className="w-full border-collapse text-sm">
        <caption className="mb-2 text-left text-text-muted">Deal Score factors and weights</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1.5 pr-3">Factor</th>
            <th className="py-1.5 pr-3 text-right">Weight</th>
            <th className="py-1.5">What it measures</th>
          </tr>
        </thead>
        <tbody>
          {WEIGHTS.map(([f, w, d]) => (
            <tr key={f} className="border-b border-border align-top">
              <td className="py-1.5 pr-3 font-medium">{f}</td>
              <td className="price py-1.5 pr-3 text-right">{w}%</td>
              <td className="py-1.5 text-text-muted">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Tiers: 90+ Exceptional, 75+ Great, 60+ Good, 40+ Average, below 40 Poor. If a factor can&apos;t be computed it is dropped and the others are re-weighted;
        if overall confidence is too low the score is hidden instead of guessed. Each product page lists the points behind its score.
      </p>
      <h2>Fake-discount detection</h2>
      <p>
        A discount is treated as genuine when the real drop vs. the product&apos;s own history is at least 70% of what the store claims. We also flag
        “was” prices we never observed and price hikes shortly before a sale.
      </p>
      <h2>Price history</h2>
      <p>We store each observation. Charts show real data points only; gaps are left as gaps.</p>
      <h2>Frequently asked questions</h2>
      {FAQ.map((f) => (
        <div key={f.q}>
          <h3 className="font-semibold">{f.q}</h3>
          <p className="text-text-muted">{f.a}</p>
        </div>
      ))}
      <p>
        See also our <Link href="/editorial-policy">editorial policy</Link> and <Link href="/legal/affiliate-disclosure">affiliate disclosure</Link>.
      </p>
    </InfoPage>
  );
}
