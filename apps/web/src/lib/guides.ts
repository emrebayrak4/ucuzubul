import { cache } from "react";
import type { GuideDetail, GuideListQuery, GuideSummary } from "@pricora/contracts";
import { load, serverApi } from "./api-server";

export type { GuideDetail, GuideSummary };
/** Back-compat alias used by tiles. */
export type GuideCard = GuideSummary;

export type GuidesResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** GET /v1/travel/guides (typed via @pricora/api-client). */
export const listGuides = cache(async (query: Partial<GuideListQuery> = {}): Promise<GuidesResult<GuideSummary[]>> => {
  const api = await serverApi({ revalidate: 3600 });
  const r = await load(() => api.travel.guides({ pageSize: 60, ...query } as GuideListQuery));
  return r.ok ? { ok: true, data: r.data.items } : { ok: false, status: r.error.status };
});

/** GET /v1/travel/guides/:slug */
export const getGuide = cache(async (slug: string): Promise<GuidesResult<GuideDetail>> => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return { ok: false, status: 404 };
  const api = await serverApi({ revalidate: 3600 });
  const r = await load(() => api.travel.guide(slug), { notFoundOn404: true });
  return r.ok ? { ok: true, data: r.data } : { ok: false, status: r.error.status };
});

export const guideCountry = (g: GuideSummary) => g.country;
export const guideCode = (g: GuideSummary) => g.countryIso2.toUpperCase();
export const guideSummary = (g: GuideSummary) => g.description;
export const guideReviewed = (g: GuideSummary) => g.lastReviewed ?? g.updatedAt ?? null;

/** Fallback lookup by city name when an API response doesn't carry a guideSlug. */
export async function guideForCity(city: string): Promise<GuideSummary | null> {
  if (!city || city.length < 2) return null;
  const r = await listGuides({ q: city, pageSize: 5 });
  if (!r.ok) return null;
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return r.data.find((g) => norm(g.city) === norm(city) || norm(g.city).startsWith(norm(city))) ?? null;
}

/**
 * Splits the "## Frequently asked questions" section out of the Markdown body: H3 = question,
 * following text = answer. Returns the body without that section (rendered as an accordion instead).
 */
export function splitFaq(md: string): { body: string; faq: Array<{ q: string; a: string }> } {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+(frequently asked questions|faqs?)\b/i.test(l.trim()));
  if (start < 0) return { body: md, faq: [] };
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l.trim()));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);
  const faq: Array<{ q: string; a: string }> = [];
  let cur: { q: string; a: string[] } | null = null;
  for (const l of section) {
    const h = /^###\s+(.+?)\s*#*$/.exec(l.trim());
    if (h) {
      if (cur) faq.push({ q: cur.q, a: cur.a.join(" ").trim() });
      cur = { q: h[1]!.replace(/\*\*/g, ""), a: [] };
    } else if (cur && l.trim()) cur.a.push(l.trim());
  }
  if (cur) faq.push({ q: cur.q, a: cur.a.join(" ").trim() });
  return { body: [...lines.slice(0, start), ...lines.slice(end)].join("\n"), faq: faq.filter((f) => f.q && f.a) };
}
