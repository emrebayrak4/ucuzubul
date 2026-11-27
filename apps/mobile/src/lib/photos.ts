import categoryRaw from "@pricora/content/category-photos.json";
import promoRaw from "@pricora/content/promo-photos.json";

/**
 * Unsplash photos shared with web (packages/content/*.json). Every photo shown must carry an ⓘ credit
 * (PhotoCredit) and appear on the Credits screen.
 */
export interface Photo {
  id: string;
  url: string;
  color?: string;
  alt?: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
}

const CATEGORY = categoryRaw as unknown as Record<string, Photo | undefined>;
const PROMO = promoRaw as unknown as Record<string, Photo | undefined>;

export function categoryPhoto(slug: string | null | undefined): Photo | null {
  return (slug && CATEGORY[slug]) || null;
}

export function promoPhoto(key: string): Photo | null {
  return PROMO[key] ?? null;
}

/** imgix-sized crop (Unsplash raw URL params). `px` is in device pixels. */
export function photoSrc(p: Photo, w: number, h = w): string {
  return `${p.url}&w=${Math.round(w)}&h=${Math.round(h)}&fit=crop&crop=entropy&auto=format&q=70`;
}

export function allCredits(): (Photo & { key: string; group: "Promo" | "Category" })[] {
  return [
    ...Object.entries(PROMO).flatMap(([key, p]) => (p ? [{ ...p, key, group: "Promo" as const }] : [])),
    ...Object.entries(CATEGORY).flatMap(([key, p]) => (p ? [{ ...p, key, group: "Category" as const }] : [])),
  ];
}
