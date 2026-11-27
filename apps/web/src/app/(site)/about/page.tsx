import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@pricora/config/brand";
import { InfoPage } from "@/components/info-page";
import { metaDescription } from "@/lib/seo";

const DESCRIPTION = `${brand.name} is a US price-comparison site: we show what a product costs at each store, including shipping and estimated sales tax, how its price has moved over time, and whether today's "deal" is real.`;

export const metadata: Metadata = {
  title: `About ${brand.name}`,
  description: metaDescription(DESCRIPTION),
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <InfoPage title={`About ${brand.name}`} path="/about" description={DESCRIPTION} updated="2026-11-27" type="AboutPage">
      <h2>Who we are</h2>
      <p>
        {brand.name} is built and operated by {brand.legalEntity}, a US company. We serve shoppers in the United States and show prices in US dollars.
      </p>
      <h2>What we do</h2>
      <ul>
        <li>Compare the same product across US stores, sorted by estimated total (price + shipping + estimated tax for your ZIP).</li>
        <li>Record every price we observe, so you can see real price history — gaps stay gaps, we never interpolate.</li>
        <li>Score deals with a transparent Deal Score and flag discounts that only look big because of an inflated “was” price.</li>
        <li>Collect coupon codes and show how often they actually worked.</li>
      </ul>
      <h2>What we don&apos;t do</h2>
      <ul>
        <li>No invented reviews, star ratings, user counts or “X people are viewing” counters.</li>
        <li>No paid ranking: sponsored placements are labeled and never change the order of offers or the Deal Score.</li>
        <li>No pretending: while live store connections are being set up, sample listings are labeled “Demo data”.</li>
      </ul>
      <h2>Learn more</h2>
      <p>
        Read <Link href="/how-we-compare">how we compare prices</Link>, our <Link href="/editorial-policy">editorial policy</Link> and{" "}
        <Link href="/legal/affiliate-disclosure">how we make money</Link>, or <Link href="/contact">contact us</Link>.
      </p>
    </InfoPage>
  );
}
