/** Params that describe the stay/location; everything else on the results page is a filter/sort/view param. */
export const STAY_KEYS = ["city", "placeId", "checkin", "checkout", "guests", "rooms", "adults", "ages", "work"] as const;
export const FILTER_KEYS = [
  "minPrice",
  "maxPrice",
  "stars",
  "types",
  "amenities",
  "meals",
  "freeCancellation",
  "payAtProperty",
  "maxDistanceKm",
  "neighborhoods",
  "accessibility",
  "chains",
  "minStars",
  "bbox",
] as const;
