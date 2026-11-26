import { z } from "zod";
import { Id, IntegrationStatus, IsoDateTime } from "./common";
import { Offer, ProductCard, ProductDetail } from "./catalog";

/* ------------------------------------------------------------------ */
/* Scan                                                                */
/* ------------------------------------------------------------------ */

export const ScanParams = z.object({
  code: z.string().trim().regex(/^\d{8,14}$/, "Expected an 8–14 digit UPC/EAN/GTIN"),
});
export type ScanParams = z.infer<typeof ScanParams>;

export const ScanResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("found"),
    code: z.string(),
    codeType: z.enum(["UPC", "EAN", "GTIN"]),
    product: ProductDetail,
    card: ProductCard,
    offers: z.array(Offer),
  }),
  z.object({
    status: z.literal("not_found"),
    code: z.string(),
    codeType: z.enum(["UPC", "EAN", "GTIN"]).nullable(),
    message: z.string(),
  }),
]);
export type ScanResponse = z.infer<typeof ScanResponse>;

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

export const AssistantMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type AssistantMessage = z.infer<typeof AssistantMessage>;

export const AssistantRequest = z.object({
  messages: z.array(AssistantMessage).min(1).max(20),
  context: z
    .object({
      productSlug: z.string().optional(),
      categorySlug: z.string().optional(),
      zip: z.string().optional(),
    })
    .optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;

export const AssistantResponse = z.object({
  message: AssistantMessage,
  /** Products referenced in the answer — prices always come from the catalog, never generated. */
  products: z.array(ProductCard),
  provider: z.string(),
  cached: z.boolean(),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;

/** 503 details when the assistant provider is not configured. */
export const AssistantUnavailable = z.object({
  status: z.enum(["pending_configuration", "disabled", "rate_limited"]),
  reason: z.string(),
});
export type AssistantUnavailable = z.infer<typeof AssistantUnavailable>;

/* ------------------------------------------------------------------ */
/* Outbound redirect                                                   */
/* ------------------------------------------------------------------ */

export const GoParams = z.object({ offerId: Id });
export const GoQuery = z.object({
  /** Placement for attribution (e.g. "pdp_offer_table", "home_deals"). */
  placement: z.string().max(40).optional(),
});
export type GoQuery = z.infer<typeof GoQuery>;

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

export const HealthCheck = z.object({
  status: z.enum(["up", "down", "degraded"]),
  latencyMs: z.number().nullable(),
  message: z.string().optional(),
});
export type HealthCheck = z.infer<typeof HealthCheck>;

export const HealthResponse = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  version: z.string(),
  time: IsoDateTime,
  checks: z.object({
    db: HealthCheck,
    redis: HealthCheck,
    search: HealthCheck,
  }),
  adapters: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(["retailer", "affiliate", "travel", "ai", "payments", "oauth"]), status: IntegrationStatus })),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
