import { z } from "zod";
import { CategorySummary, DealItem, PriceDropItem, ProductCard, RetailerSummary } from "./catalog";

export const HomeSectionKey = z.enum([
  "trending",
  "bestDeals",
  "priceDrops",
  "under25",
  "under50",
  "under100",
  "topCategories",
  "retailers",
  "recentlyViewed",
  "editorsPicks",
]);
export type HomeSectionKey = z.infer<typeof HomeSectionKey>;

export const HomeResponse = z.object({
  trending: z.array(ProductCard),
  bestDeals: z.array(DealItem),
  priceDrops: z.array(PriceDropItem),
  under25: z.array(ProductCard),
  under50: z.array(ProductCard),
  under100: z.array(ProductCard),
  topCategories: z.array(CategorySummary),
  retailers: z.array(RetailerSummary),
  /** Present only for signed-in users. */
  recentlyViewed: z.array(ProductCard).optional(),
  /** True when any section includes demo data → render "Demo data" notice. */
  hasDemoData: z.boolean(),
  generatedAt: z.string(),
});
export type HomeResponse = z.infer<typeof HomeResponse>;
