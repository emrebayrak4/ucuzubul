/**
 * Grocery / everyday-item helpers: net quantity from product columns and unit prices for offers and cards.
 * Pure functions — the parsing lives in @pricora/algorithms (parseNetQuantity / computeUnitPrice).
 */
import { computeUnitPrice, isUnitBasis, parseNetQuantity, type UnitBasis } from "@pricora/algorithms";
import type { LocalStock, NetQuantity, UnitPrice } from "@pricora/contracts";

export interface NetQuantityColumns {
  netQuantity: number | null;
  netUnit: string | null;
  packCount: number | null;
  sizeLabel: string | null;
}

/** Net quantity from the product's stored columns (null when not set — never guessed from unrelated titles). */
export function netQuantityOf(p: NetQuantityColumns): NetQuantity | null {
  if (p.netQuantity === null || !(p.netQuantity > 0) || !isUnitBasis(p.netUnit)) return null;
  return {
    basis: p.netUnit,
    total: p.netQuantity,
    packCount: p.packCount && p.packCount > 0 ? p.packCount : 1,
    label: p.sizeLabel ?? `${p.netQuantity} ${p.netUnit.replace("_", " ")}`,
  };
}

export function unitPriceFor(priceCents: number | null | undefined, qty: NetQuantity | null): UnitPrice | null {
  if (priceCents === null || priceCents === undefined) return null;
  return computeUnitPrice(priceCents, qty);
}

/** Columns to store for a title (feeds / seeds); null fields when no size is stated. */
export function netColumnsFromTitle(title: string, prefer?: UnitBasis): Pick<NetQuantityColumns, "netQuantity" | "netUnit" | "packCount" | "sizeLabel"> {
  const q = parseNetQuantity(title, prefer);
  if (!q) return { netQuantity: null, netUnit: null, packCount: null, sizeLabel: null };
  return { netQuantity: q.total, netUnit: q.basis, packCount: q.packCount, sizeLabel: q.label };
}

/** Store stock → shopper wording. ≤ 3 units counts as limited. */
export function localStock(stock: string, quantity: number | null): LocalStock {
  if (stock === "out_of_stock" || quantity === 0) return "out_of_stock";
  if (stock === "low_stock" || (quantity !== null && quantity <= 3)) return "limited";
  if (stock === "in_stock") return "in_stock";
  return "unknown";
}

export const KM_PER_MILE = 1.609344;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
