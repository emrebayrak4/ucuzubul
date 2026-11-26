import { cache } from "react";
import { load, serverApi } from "./api-server";

/** Request-memoized loaders shared by generateMetadata and the page. */
export const getCategory = cache(async (slug: string) => {
  const api = await serverApi({ revalidate: 600 });
  return load(() => api.catalog.category(slug), { notFoundOn404: true });
});

export const getBrand = cache(async (slug: string) => {
  const api = await serverApi({ revalidate: 600 });
  return load(() => api.catalog.brand(slug), { notFoundOn404: true });
});

export const getRetailer = cache(async (slug: string) => {
  const api = await serverApi({ revalidate: 600 });
  return load(() => api.catalog.retailer(slug), { notFoundOn404: true });
});

/** With a session cookie the request is forwarded (uncached) so the API can record "recently viewed". */
export const getProduct = cache(async (slug: string, zip: string | null, withSession: boolean) => {
  const api = await serverApi(withSession ? { withCookies: true } : { revalidate: 120 });
  return load(() => api.catalog.product(slug, zip ? { zip } : undefined), { notFoundOn404: true });
});

export const getHotel = cache(async (id: string, query: { checkin?: string; checkout?: string; guests?: number; rooms?: number }) => {
  const api = await serverApi({ revalidate: 300 });
  return load(() => api.travel.hotel(id, query), { notFoundOn404: true });
});
