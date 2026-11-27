import { z } from "zod";
import { Cents, Slug } from "./common";

/* ------------------------------------------------------------------ */
/* Unit pricing (grocery / everyday items)                             */
/* ------------------------------------------------------------------ */

/** Comparable unit basis: weight → oz, volume → fl oz, count → ct, sheets, laundry loads. */
export const UnitBasis = z.enum(["oz", "fl_oz", "ct", "sheet", "load"]);
export type UnitBasis = z.infer<typeof UnitBasis>;

/**
 * Price per unit for one price. `millicentsPerUnit` (1/1000 ¢ per ONE basis unit) is the exact sortable value;
 * `label` is the display ("23.9¢/oz", "$2.15/100 sheets"). Only comparable within the same basis.
 */
export const UnitPrice = z.object({
  basis: UnitBasis,
  /** Display quantity the label refers to (100 for sheets, otherwise 1). */
  per: z.number().int().positive(),
  millicentsPerUnit: z.number().int().nonnegative(),
  label: z.string(),
});
export type UnitPrice = z.infer<typeof UnitPrice>;

/** Net quantity of a product (total across a multipack). */
export const NetQuantity = z.object({
  basis: UnitBasis,
  total: z.number().positive(),
  packCount: z.number().int().positive(),
  /** As sold: "18.8 oz", "2 × 12 oz", "198 ct". */
  label: z.string(),
});
export type NetQuantity = z.infer<typeof NetQuantity>;

/**
 * Another size of the same product line ("best value size"). Sizes stay separate products — never merged —
 * and are linked as a size family (ProductVariant.familyKey with a size attribute).
 */
export const SizeFamilyMember = z.object({
  slug: Slug,
  label: z.string(),
  netQuantity: NetQuantity.nullable(),
  lowestPriceCents: Cents.nullable(),
  unitPrice: UnitPrice.nullable(),
  current: z.boolean(),
  /** Lowest unit price among members with the same basis (only when ≥ 2 compare). */
  bestValue: z.boolean(),
});
export type SizeFamilyMember = z.infer<typeof SizeFamilyMember>;

/** Stock wording for store-level availability. "limited" = few units / low stock. */
export const LocalStock = z.enum(["in_stock", "limited", "out_of_stock", "unknown"]);
export type LocalStock = z.infer<typeof LocalStock>;

/** Nearest store carrying the product (cards in "Near me" results). */
export const NearestStore = z.object({
  storeName: z.string(),
  retailerSlug: Slug,
  distanceMi: z.number().nonnegative(),
  stock: LocalStock,
  priceCents: Cents.nullable(),
  /** Coordinates are a ZIP centroid (approximate) unless the source gave a precise location. */
  approximate: z.boolean(),
});
export type NearestStore = z.infer<typeof NearestStore>;
