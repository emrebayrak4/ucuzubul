import { getProduct } from "@/lib/loaders";
import { OG_SIZE, ogCard } from "@/lib/og";
import { realOffers, usd } from "@/lib/seo";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Price comparison card";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await getProduct(slug, null, false);
  if (!res.ok) return ogCard({ eyebrow: "Price comparison", title: "Compare prices across US stores", fact: "Price history · Deal Score · Coupons" });
  const { product, offers, storeCount } = res.data;
  const real = realOffers(offers);
  const low = real.length ? Math.min(...real.map((o) => o.priceCents)) : null;
  return ogCard({
    eyebrow: [product.brand?.name, product.category?.name].filter(Boolean).join(" · ") || "Price comparison",
    title: product.title,
    fact: low !== null ? `From ${usd(low, real[0]!.currency)} at ${real.length} ${real.length === 1 ? "store" : "stores"}` : `Compared across ${storeCount} US ${storeCount === 1 ? "store" : "stores"}`,
    note: res.data.hasDemoData ? "Includes demo data — not live prices" : undefined,
  });
}
