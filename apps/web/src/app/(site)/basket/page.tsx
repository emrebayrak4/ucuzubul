import type { Metadata } from "next";
import { BasketView } from "@/components/basket-view";

export const metadata: Metadata = {
  title: "Smart basket — cheapest way to buy several items",
  description: "Compare buying your basket at one store, across the cheapest stores, or at the fewest stores — with shipping thresholds and estimated tax.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/basket" },
};

export default function BasketPage() {
  return (
    <div className="container-content py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Smart basket</h1>
      <p className="mb-6 mt-1 text-sm text-text-muted">Your basket is stored on this device. Optimization uses current tracked offers, shipping thresholds and your memberships.</p>
      <BasketView />
    </div>
  );
}
