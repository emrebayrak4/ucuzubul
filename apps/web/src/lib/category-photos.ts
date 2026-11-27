import raw from "@pricora/content/category-photos.json";

/** Unsplash photo for a category circle (packages/content/category-photos.json, keyed by category slug). */
export type CategoryPhoto = {
  id: string;
  url: string;
  color: string;
  blurHash: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
};

const PHOTOS = raw as unknown as Record<string, CategoryPhoto>;

/** Photo for a slug, or null (caller falls back to the category icon). */
export function categoryPhoto(slug: string | null | undefined): CategoryPhoto | null {
  return (slug && PHOTOS[slug]) || null;
}

/** imgix-sized square crop (Unsplash raw URL params). */
export function categoryPhotoSrc(p: CategoryPhoto, size: number): string {
  return `${p.url}&w=${size}&h=${size}&fit=crop&crop=entropy&auto=format&q=70`;
}

export function allCategoryPhotos(): Array<CategoryPhoto & { slug: string }> {
  return Object.entries(PHOTOS).map(([slug, p]) => ({ slug, ...p }));
}

/** Unsplash attribution links need utm params (API guidelines). */
export function withUtm(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}utm_source=whichless&utm_medium=referral`;
}
