import type { MetadataRoute } from "next";

/** The admin/merchant app must never be crawled. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
