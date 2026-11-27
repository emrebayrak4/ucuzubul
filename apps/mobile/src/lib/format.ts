import * as Haptics from "expo-haptics";
import { formatCents, formatPercent, formatRelativeTime } from "@pricora/utils";
import { conditionGroupOf, type ConditionGrade, type ConditionGroup, type DataSource, type ProductCard, type ProductDetailResponse } from "@pricora/contracts";

export function money(cents: number | null | undefined, currency = "USD", mode: "always" | "auto" = "always"): string {
  if (cents === null || cents === undefined) return "—";
  return formatCents(cents, { currency, cents: mode });
}

export function percent(ratio: number): string {
  return formatPercent(ratio);
}

export function relative(iso: string): string {
  try {
    const out = formatRelativeTime(iso);
    if (out) return out;
  } catch {
    // Hermes may lack Intl.RelativeTimeFormat — fall through to the plain English formatter.
  }
  return plainRelative(iso);
}

function plainRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const [n, unit] =
    a < 60 ? [0, "now"] : a < 3600 ? [Math.floor(a / 60), "minute"] : a < 86_400 ? [Math.floor(a / 3600), "hour"] : a < 2_592_000 ? [Math.floor(a / 86_400), "day"] : a < 31_536_000 ? [Math.floor(a / 2_592_000), "month"] : [Math.floor(a / 31_536_000), "year"];
  if (unit === "now") return "just now";
  const phrase = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return future ? `in ${phrase}` : `${phrase} ago`;
}

export const isDemo = (source: DataSource | "mixed" | "none"): boolean => source === "demo" || source === "mixed";

export const conditionLabel: Record<string, string> = {
  new: "New",
  refurbished: "Refurbished",
  used: "Used",
  open_box: "Open box",
  for_parts: "For parts",
  unknown: "Condition unknown",
};

/** Condition groups (filter/tab level; `used` covers for_parts + unknown). */
export const conditionGroupLabel: Record<ConditionGroup, string> = {
  new: "New",
  open_box: "Open box",
  refurbished: "Refurbished",
  used: "Used",
};

export const conditionGradeLabel: Record<ConditionGrade, string> = {
  like_new: "Like new",
  very_good: "Very good",
  good: "Good",
  acceptable: "Acceptable",
};

export const stockLabel: Record<string, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
  preorder: "Pre-order",
  unknown: "Stock unknown",
};

/** Haptics per DESIGN_SYSTEM §11: light impact on favorite/alert toggle; success on barcode detect. */
export const haptic = {
  toggle: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
};

/** Builds a ProductCard from a detail response (for the local recently-viewed list). */
export function cardFromDetail(d: ProductDetailResponse): ProductCard {
  // Headline = default condition group only (new when any new offer exists), never a cheaper used offer.
  const group = d.defaultCondition ?? "new";
  const offers = d.conditionSummary?.length ? d.offers.filter((o) => (o.conditionGroup ?? conditionGroupOf(o.condition)) === group) : d.offers;
  const lowest = offers.find((o) => o.id === d.lowestOfferId) ?? offers[0];
  const totals = offers.map((o) => o.priceCents + (o.shipping.costCents ?? 0));
  return {
    id: d.product.id,
    slug: d.product.slug,
    title: d.product.title,
    brand: d.product.brand,
    category: d.product.category,
    condition: d.product.condition,
    image: d.product.images[0] ?? null,
    lowestPriceCents: d.priceStats.currentLowestCents ?? lowest?.priceCents ?? null,
    lowestTotalCents: totals.length ? Math.min(...totals) : null,
    currency: lowest?.currency ?? "USD",
    storeCount: d.storeCount,
    inStock: offers.some((o) => o.stock === "in_stock" || o.stock === "low_stock"),
    dropRatio: null,
    dealScore: d.dealScore?.score ?? null,
    hasDemoData: d.hasDemoData,
    sponsored: false,
    priceCondition: d.conditionSummary?.length ? group : undefined,
    updatedAt: d.lastUpdatedAt,
  };
}
