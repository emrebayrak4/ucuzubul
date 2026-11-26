import { z } from "zod";
import { Id, IsoDate, IsoDateTime, MAX_PAGE_SIZE, PaginationQuery, Slug, paginated } from "./common";

export const GuideStatus = z.enum(["draft", "published"]);
export type GuideStatus = z.infer<typeof GuideStatus>;

export const GuideSummary = z.object({
  slug: Slug,
  title: z.string(),
  description: z.string(),
  city: z.string(),
  country: z.string(),
  countryIso2: z.string().length(2),
  iataCityCode: z.string().nullable(),
  /** GeoNames city id (links to /v1/travel/places "city_<id>" and hotel search). */
  cityId: z.number().int().nullable(),
  bestTimeToVisit: z.string().nullable(),
  neighborhoods: z.array(z.string()),
  tags: z.array(z.string()),
  lastReviewed: IsoDate.nullable(),
  publishedAt: IsoDateTime.nullable(),
  updatedAt: IsoDateTime,
});
export type GuideSummary = z.infer<typeof GuideSummary>;

export const GuideListQuery = PaginationQuery.extend({
  tag: z.string().regex(/^[a-z0-9-]+$/).optional(),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  q: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(24),
});
export type GuideListQuery = z.infer<typeof GuideListQuery>;
export const GuideListResponse = paginated(GuideSummary);
export type GuideListResponse = z.infer<typeof GuideListResponse>;

export const GuideHeading = z.object({ id: z.string(), text: z.string(), level: z.union([z.literal(2), z.literal(3)]) });

export const GuideDetail = GuideSummary.extend({
  /** Sanitised Markdown (raw HTML removed, unsafe link schemes neutralised). Renderers should still escape HTML. */
  bodyMarkdown: z.string(),
  headings: z.array(GuideHeading),
});
export type GuideDetail = z.infer<typeof GuideDetail>;

/* Admin */
export const AdminGuide = GuideDetail.extend({
  id: Id,
  status: GuideStatus,
  adminEditedAt: IsoDateTime.nullable(),
  updatedById: Id.nullable(),
});
export type AdminGuide = z.infer<typeof AdminGuide>;
export const AdminGuideListQuery = PaginationQuery.extend({ status: GuideStatus.optional(), q: z.string().max(100).optional() });
export const AdminGuideListResponse = paginated(AdminGuide.omit({ bodyMarkdown: true, headings: true }));
export type AdminGuideListResponse = z.infer<typeof AdminGuideListResponse>;

export const AdminUpsertGuideRequest = z.object({
  slug: Slug,
  city: z.string().min(1).max(120),
  country: z.string().min(1).max(120),
  countryIso2: z.string().regex(/^[A-Z]{2}$/),
  iataCityCode: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  title: z.string().min(5).max(200),
  description: z.string().min(20).max(400),
  bestTimeToVisit: z.string().max(200).nullable().optional(),
  neighborhoods: z.array(z.string().min(1).max(80)).max(30).default([]),
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(20).default([]),
  lastReviewed: IsoDate.nullable().optional(),
  bodyMarkdown: z.string().min(1).max(200_000),
  status: GuideStatus.default("draft"),
});
export type AdminUpsertGuideRequest = z.infer<typeof AdminUpsertGuideRequest>;
export const AdminUpdateGuideRequest = AdminUpsertGuideRequest.partial();
export type AdminUpdateGuideRequest = z.infer<typeof AdminUpdateGuideRequest>;
