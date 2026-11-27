import { ApiError } from "@pricora/api-client";
import { brand } from "@pricora/config/brand";
import { absoluteUrl } from "@/lib/env";
import { TRAVEL_ENABLED } from "@/lib/features";
import { markdownResponse } from "@/lib/markdown-export";
import { sitemapApi } from "@/lib/sitemap";

export const dynamic = "force-dynamic";

/** Markdown alternate of a city guide. 404 while the travel area is hidden (guides must stay out of crawlers' reach). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = `/travel/guides/${slug}`;
  if (!TRAVEL_ENABLED || !/^[a-z0-9-]{1,120}$/.test(slug)) return new Response("Not found", { status: 404 });
  try {
    const g = await sitemapApi().travel.guide(slug);
    const md = [
      `# ${g.title}`,
      "",
      `> ${g.description}`,
      "",
      `- City: ${g.city}, ${g.country}`,
      g.bestTimeToVisit ? `- Best time to visit: ${g.bestTimeToVisit}` : null,
      `- Last reviewed: ${g.lastReviewed ?? g.updatedAt.slice(0, 10)}`,
      `- Author: ${brand.name} editorial team`,
      "",
      g.bodyMarkdown,
      "",
      "---",
      `Canonical page: ${absoluteUrl(path)}`,
    ]
      .filter((l) => l !== null)
      .join("\n");
    return markdownResponse(md, path);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return markdownResponse("# Not found\n", path, 404);
    return markdownResponse("# Temporarily unavailable\n", path, 503);
  }
}
