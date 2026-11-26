import { z } from "zod";
import { Offer, ProductCard } from "./catalog";

/* Browser extension: product lookup for the "cheaper elsewhere" banner. */
export const ExtensionProductQuery = z.object({ url: z.string().url().max(2048) });
export const ExtensionProductResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    product: ProductCard,
    /** The offer on the store the user is browsing, if we track it. */
    currentOffer: Offer.nullable(),
    /** Offers cheaper (by estimated total) than the current store's, cheapest first. */
    cheaperElsewhere: z.array(Offer),
  }),
  z.object({ status: z.literal("not_found"), reason: z.string(), retailer: z.string().nullable() }),
]);
export type ExtensionProductResponse = z.infer<typeof ExtensionProductResponse>;

