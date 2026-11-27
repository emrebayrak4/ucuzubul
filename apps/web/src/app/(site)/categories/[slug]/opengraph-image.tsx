import { getCategory } from "@/lib/loaders";
import { OG_SIZE, ogCard } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Category price comparison card";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await getCategory(slug);
  if (!res.ok) return ogCard({ eyebrow: "Price comparison", title: "Compare prices across US stores", fact: "Price history · Deal Score · Coupons" });
  const { category, breadcrumbs, topBrands } = res.data;
  const parent = breadcrumbs.filter((b) => b.slug !== slug).map((b) => b.name).join(" › ");
  return ogCard({
    eyebrow: parent || "Category",
    title: `${category.name} prices compared`,
    fact: `${category.productCount.toLocaleString("en-US")} products${topBrands.length ? ` · ${topBrands.slice(0, 3).map((b) => b.name).join(", ")}` : ""}`,
  });
}
