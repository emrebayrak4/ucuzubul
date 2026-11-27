import { ApiError } from "@pricora/api-client";
import { markdownResponse, productMarkdown } from "@/lib/markdown-export";
import { sitemapApi } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/products/${slug}`;
  try {
    const d = await sitemapApi().catalog.product(slug);
    return markdownResponse(productMarkdown(d), path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return markdownResponse("# Not found\n", path, 404);
    return markdownResponse("# Temporarily unavailable\n", path, 503);
  }
}
