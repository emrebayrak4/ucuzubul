import { z } from "zod";
import { Cents, ConditionGroup, Id, IsoDateTime, PaginationQuery, Slug, UsZip, paginated } from "./common";
import { ProductCard } from "./catalog";
import { PublicUser } from "./auth";

/* Favorites */
export const Favorite = z.object({
  id: Id,
  product: ProductCard,
  createdAt: IsoDateTime,
});
export type Favorite = z.infer<typeof Favorite>;
export const FavoriteListResponse = paginated(Favorite);
export type FavoriteListResponse = z.infer<typeof FavoriteListResponse>;
export const CreateFavoriteRequest = z.object({ productId: Id });
export type CreateFavoriteRequest = z.infer<typeof CreateFavoriteRequest>;

/* Price alerts */
export const AlertType = z.enum([
  "below_price",
  "drop_percent",
  "back_in_stock",
  "new_cheaper_store",
  "all_time_low",
  "coupon",
]);
export type AlertType = z.infer<typeof AlertType>;

export const AlertChannel = z.enum(["email", "push", "in_app"]);
export type AlertChannel = z.infer<typeof AlertChannel>;

export const PriceAlert = z.object({
  id: Id,
  product: ProductCard,
  type: AlertType,
  /** Condition group the alert watches (default new). */
  condition: ConditionGroup.optional(),
  targetPriceCents: Cents.nullable(),
  /** Basis points (1000 = 10%). */
  dropPercentBp: z.number().int().nullable(),
  retailerSlug: Slug.nullable(),
  channels: z.array(AlertChannel),
  active: z.boolean(),
  lastTriggeredAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type PriceAlert = z.infer<typeof PriceAlert>;

export const PriceAlertListResponse = paginated(PriceAlert);
export type PriceAlertListResponse = z.infer<typeof PriceAlertListResponse>;

export const CreatePriceAlertRequest = z
  .object({
    productId: Id,
    type: AlertType,
    /** Which offers to watch (default new; used/refurbished alerts are opt-in). */
    condition: ConditionGroup.default("new"),
    targetPriceCents: Cents.positive().optional(),
    dropPercentBp: z.number().int().min(100).max(9000).optional(),
    retailerSlug: Slug.optional(),
    channels: z.array(AlertChannel).min(1).default(["email", "in_app"]),
  })
  .refine((v) => v.type !== "below_price" || v.targetPriceCents !== undefined, {
    message: "targetPriceCents is required for below_price alerts",
    path: ["targetPriceCents"],
  })
  .refine((v) => v.type !== "drop_percent" || v.dropPercentBp !== undefined, {
    message: "dropPercentBp is required for drop_percent alerts",
    path: ["dropPercentBp"],
  });
export type CreatePriceAlertRequest = z.infer<typeof CreatePriceAlertRequest>;

export const UpdatePriceAlertRequest = z.object({
  targetPriceCents: Cents.positive().nullable().optional(),
  dropPercentBp: z.number().int().min(100).max(9000).nullable().optional(),
  channels: z.array(AlertChannel).min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdatePriceAlertRequest = z.infer<typeof UpdatePriceAlertRequest>;

/* Shopping lists */
export const ShoppingListItem = z.object({
  id: Id,
  product: ProductCard,
  quantity: z.number().int().min(1),
  note: z.string().nullable(),
  addedAt: IsoDateTime,
});
export type ShoppingListItem = z.infer<typeof ShoppingListItem>;

export const ShoppingList = z.object({
  id: Id,
  name: z.string(),
  isPublic: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  estimatedTotalCents: Cents.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ShoppingList = z.infer<typeof ShoppingList>;

export const ShoppingListDetail = ShoppingList.extend({ items: z.array(ShoppingListItem) });
export type ShoppingListDetail = z.infer<typeof ShoppingListDetail>;

export const ShoppingListsResponse = z.object({ items: z.array(ShoppingList) });
export type ShoppingListsResponse = z.infer<typeof ShoppingListsResponse>;

export const CreateShoppingListRequest = z.object({
  name: z.string().trim().min(1).max(80),
  isPublic: z.boolean().default(false),
});
export type CreateShoppingListRequest = z.infer<typeof CreateShoppingListRequest>;

export const UpdateShoppingListRequest = CreateShoppingListRequest.partial();
export type UpdateShoppingListRequest = z.infer<typeof UpdateShoppingListRequest>;

export const AddShoppingListItemRequest = z.object({
  productId: Id,
  quantity: z.number().int().min(1).max(99).default(1),
  note: z.string().max(280).optional(),
});
export type AddShoppingListItemRequest = z.infer<typeof AddShoppingListItemRequest>;

export const UpdateShoppingListItemRequest = z.object({
  quantity: z.number().int().min(1).max(99).optional(),
  note: z.string().max(280).nullable().optional(),
});
export type UpdateShoppingListItemRequest = z.infer<typeof UpdateShoppingListItemRequest>;

/* Recently viewed */
export const RecentlyViewedResponse = z.object({
  items: z.array(z.object({ product: ProductCard, viewedAt: IsoDateTime })),
});
export type RecentlyViewedResponse = z.infer<typeof RecentlyViewedResponse>;

/* Preferences */
export const UserPreferences = z.object({
  zip: UsZip.nullable(),
  favoriteRetailers: z.array(Slug),
  preferredCategories: z.array(Slug),
  memberships: z.array(z.string()),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    priceDrops: z.boolean(),
    weeklyDigest: z.boolean(),
    marketing: z.boolean(),
  }),
  theme: z.enum(["system", "light", "dark"]),
  homeAirport: z.string().length(3).nullable(),
});
export type UserPreferences = z.infer<typeof UserPreferences>;

export const UpdatePreferencesRequest = UserPreferences.partial().extend({
  name: z.string().trim().min(1).max(100).optional(),
});
export type UpdatePreferencesRequest = z.infer<typeof UpdatePreferencesRequest>;

export const PreferencesResponse = z.object({ user: PublicUser, preferences: UserPreferences });
export type PreferencesResponse = z.infer<typeof PreferencesResponse>;

/* Export / deletion */
export const DataExportResponse = z.object({
  exportedAt: IsoDateTime,
  user: PublicUser,
  preferences: UserPreferences,
  favorites: z.array(z.object({ productSlug: Slug, createdAt: IsoDateTime })),
  alerts: z.array(z.object({ productSlug: Slug, type: AlertType, createdAt: IsoDateTime })),
  lists: z.array(z.object({ name: z.string(), items: z.array(z.object({ productSlug: Slug, quantity: z.number().int() })) })),
  recentlyViewed: z.array(z.object({ productSlug: Slug, viewedAt: IsoDateTime })),
  searches: z.array(z.object({ query: z.string(), at: IsoDateTime })),
});
export type DataExportResponse = z.infer<typeof DataExportResponse>;

export const DeleteAccountRequest = z.object({
  confirm: z.literal("DELETE"),
  password: z.string().max(128).optional(),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

export const MeListQuery = PaginationQuery;

/* Notifications (in-app) */
export const NotificationItem = z.object({
  id: Id,
  type: z.string(),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  readAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type NotificationItem = z.infer<typeof NotificationItem>;
export const NotificationListResponse = paginated(NotificationItem);
export type NotificationListResponse = z.infer<typeof NotificationListResponse>;

/* Push devices (mobile) */
export const DevicePlatform = z.enum(["ios", "android"]);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

/** Expo push token, e.g. "ExponentPushToken[xxxxxxxx]". */
export const PushToken = z.string().trim().min(10).max(255).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/, "Expected an Expo push token");

export const RegisterDeviceRequest = z.object({ token: PushToken, platform: DevicePlatform });
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;

export const DeviceResponse = z.object({ token: z.string(), platform: DevicePlatform, createdAt: IsoDateTime, lastSeenAt: IsoDateTime });
export type DeviceResponse = z.infer<typeof DeviceResponse>;

export const DeviceTokenParam = z.object({ token: z.string().min(10).max(255) });

/**
 * Push payload sent to devices for alert notifications. `data.url` is an app path (e.g. "/products/<slug>")
 * that the mobile app routes to on tap.
 */
export const PushPayloadData = z.object({ url: z.string().startsWith("/"), notificationId: z.string(), type: z.string() });
export type PushPayloadData = z.infer<typeof PushPayloadData>;
