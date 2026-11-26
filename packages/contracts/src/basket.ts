import { z } from "zod";
import { Cents, DataSource, Id, ProductCondition, Slug, UsZip } from "./common";

export const BasketItemInput = z.object({
  productId: Id,
  qty: z.number().int().min(1).max(99),
});
export type BasketItemInput = z.infer<typeof BasketItemInput>;

export const BasketOptimizeRequest = z.object({
  items: z.array(BasketItemInput).min(1).max(50),
  zip: UsZip.optional(),
  /** Retailer membership keys the user holds (e.g. "amazon-prime", "walmart-plus", "target-circle-card"). */
  memberships: z.array(z.string().max(40)).max(20).optional(),
  allowConditions: z.array(ProductCondition).optional(),
  preferPickup: z.boolean().optional(),
  maxStores: z.number().int().min(1).max(10).optional(),
});
export type BasketOptimizeRequest = z.infer<typeof BasketOptimizeRequest>;

export const BasketScenarioKind = z.enum(["single_store", "multi_store_cheapest", "min_stores"]);
export type BasketScenarioKind = z.infer<typeof BasketScenarioKind>;

export const BasketLine = z.object({
  productId: Id,
  productSlug: Slug,
  title: z.string(),
  qty: z.number().int().min(1),
  offerId: Id,
  unitPriceCents: Cents,
  lineTotalCents: Cents,
  condition: ProductCondition,
  source: DataSource,
});
export type BasketLine = z.infer<typeof BasketLine>;

export const BasketStoreGroup = z.object({
  retailer: z.object({ slug: Slug, name: z.string() }),
  lines: z.array(BasketLine),
  subtotalCents: Cents,
  shippingCents: Cents,
  /** null when ZIP unknown. */
  estimatedTaxCents: Cents.nullable(),
  totalCents: Cents,
  freeShippingApplied: z.boolean(),
  /** Amount needed to reach free shipping, if close. */
  freeShippingGapCents: Cents.nullable(),
});
export type BasketStoreGroup = z.infer<typeof BasketStoreGroup>;

export const BasketScenario = z.object({
  kind: BasketScenarioKind,
  label: z.string(),
  stores: z.array(BasketStoreGroup),
  storeCount: z.number().int().nonnegative(),
  subtotalCents: Cents,
  shippingCents: Cents,
  estimatedTaxCents: Cents.nullable(),
  totalCents: Cents,
  /** Savings vs the most expensive feasible scenario. */
  savingsCents: Cents,
  /** Products not available in this scenario. */
  unavailableProductIds: z.array(Id),
  /** Human-readable assumptions (shipping thresholds, membership benefits, tax estimate basis). */
  assumptions: z.array(z.string()),
  method: z.enum(["exact", "heuristic"]),
});
export type BasketScenario = z.infer<typeof BasketScenario>;

export const BasketOptimizeResponse = z.object({
  scenarios: z.array(BasketScenario),
  recommended: BasketScenarioKind.nullable(),
  hasDemoData: z.boolean(),
  computedAt: z.string(),
});
export type BasketOptimizeResponse = z.infer<typeof BasketOptimizeResponse>;
