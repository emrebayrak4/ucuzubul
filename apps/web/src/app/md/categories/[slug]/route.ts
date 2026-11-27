import { ApiError } from "@pricora/api-client";
import { categoryMarkdown, markdownResponse } from "@/lib/markdown-export";
import { sitemapApi } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/categories/${slug}`;
  const api = sitemapApi();
  try {
    const [cat, list] = await Promise.all([api.catalog.category(slug), api.search.search({ category: slug, sort: "popular", pageSize: 24 }).catch(() => null)]);
    return markdownResponse(categoryMarkdown(cat, list), path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return markdownResponse("# Not found\n", path, 404);
    return markdownResponse("# Temporarily unavailable\n", path, 503);
  }
}
