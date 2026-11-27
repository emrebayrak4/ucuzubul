import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

/** Integer minor units (cents). Never floats. */
export const Cents = z.number().int();
export type Cents = z.infer<typeof Cents>;

export const NonNegativeCents = z.number().int().nonnegative();

/** ISO 4217 currency code. */
export const CurrencyCode = z.string().length(3).toUpperCase().default("USD");

export const Money = z.object({
  amountCents: Cents,
  currency: z.string().length(3).default("USD"),
});
export type Money = z.infer<typeof Money>;

/** ISO-8601 timestamp string (API transport format for dates). */
export const IsoDateTime = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** YYYY-MM-DD */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const Id = z.string().min(1).max(64);
export const Slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug");

export const Email = z.string().trim().toLowerCase().email().max(254);

export const UsZip = z
  .string()
  .trim()
  .regex(/^\d{5}(?:-\d{4})?$/, "Invalid US ZIP code");

/** Where a price came from. `demo` must render a visible "Demo data" label. */
export const DataSource = z.enum(["api", "feed", "merchant_upload", "affiliate", "demo"]);
export type DataSource = z.infer<typeof DataSource>;

export const ProductCondition = z.enum(["new", "refurbished", "used", "open_box", "for_parts", "unknown"]);
export type ProductCondition = z.infer<typeof ProductCondition>;

/**
 * Shopper-facing condition groups used by filters, tabs and per-condition stats.
 * `used` also covers `for_parts` and `unknown` (unknown is never treated as new).
 */
export const ConditionGroup = z.enum(["new", "open_box", "refurbished", "used"]);
export type ConditionGroup = z.infer<typeof ConditionGroup>;

export function conditionGroupOf(c: ProductCondition): ConditionGroup {
  return c === "new" || c === "open_box" || c === "refurbished" ? c : "used";
}

export const ConditionGrade = z.enum(["like_new", "very_good", "good", "acceptable"]);
export type ConditionGrade = z.infer<typeof ConditionGrade>;

export const StockStatus = z.enum(["in_stock", "low_stock", "out_of_stock", "preorder", "unknown"]);
export type StockStatus = z.infer<typeof StockStatus>;

export const Role = z.enum(["USER", "MERCHANT", "EDITOR", "ANALYST", "ADMIN"]);
export type Role = z.infer<typeof Role>;

export const IntegrationStatus = z.enum(["live", "pending_configuration", "error", "disabled"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatus>;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export const ErrorCode = z.enum([
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "csrf_invalid",
  "not_found",
  "conflict",
  "rate_limited",
  "payload_too_large",
  "unsupported_media_type",
  "pending_configuration",
  "provider_error",
  "service_unavailable",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.union([ErrorCode, z.string()]),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export const MAX_PAGE_SIZE = 60;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export const PageMeta = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});
export type PageMeta = z.infer<typeof PageMeta>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });
}

export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

export const IdParam = z.object({ id: Id });
export const SlugParam = z.object({ slug: Slug });

/** Comma-separated query value → string[] */
export const CsvList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(",")).map((s) => s.trim()).filter(Boolean));

/** "true"/"false"/"1"/"0" query value → boolean */
export const QueryBoolean = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

export const ProviderStatus = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["live", "pending_configuration", "error"]),
  message: z.string().optional(),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;
