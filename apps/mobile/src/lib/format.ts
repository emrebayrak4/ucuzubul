import * as Haptics from "expo-haptics";
import { formatCents, formatPercent, formatRelativeTime } from "@pricora/utils";
import type { DataSource, ProductCard, ProductDetailResponse } from "@pricora/contracts";

export function money(cents: number | null | undefined, currency = "USD", mode: "always" | "auto" = "always"): string {
  if (cents === null || cents === undefined) return "—";
  return formatCents(cents, { currency, cents: mode });
}

export function percent(ratio: number): string {
  return formatPercent(ratio);
}

export function relative(iso: string): string {
  try {
    return formatRelativeTime(iso);
  } catch {
    return "";
  }
}

export const isDemo = (source: DataSource | "mixed" | "none"): boolean => source === "demo" || source === "mixed";

export const conditionLabel: Record<string, string> = {
  new: "New",
  refurbished: "Refurbished",
  used: "Used",
  open_box: "Open box",
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
  const lowest = d.offers.find((o) => o.id === d.lowestOfferId) ?? d.offers[0];
  const totals = d.offers.map((o) => o.priceCents + (o.shipping.costCents ?? 0));
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
    inStock: d.offers.some((o) => o.stock === "in_stock" || o.stock === "low_stock"),
    dropRatio: null,
    dealScore: d.dealScore?.score ?? null,
    hasDemoData: d.hasDemoData,
    sponsored: false,
    updatedAt: d.lastUpdatedAt,
  };
}
