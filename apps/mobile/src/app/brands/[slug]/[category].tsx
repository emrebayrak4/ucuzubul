import { Redirect, useLocalSearchParams } from "expo-router";
import { param } from "@/lib/hooks";

/** Web /brands/<brand>/<category> deep link → brand screen scoped to that category. */
export default function BrandCategoryRedirect() {
  const p = useLocalSearchParams<{ slug: string; category: string }>();
  return <Redirect href={{ pathname: "/brands/[slug]", params: { slug: param(p.slug) ?? "", category: param(p.category) ?? "" } }} />;
}
