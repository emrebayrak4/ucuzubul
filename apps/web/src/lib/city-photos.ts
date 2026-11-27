import raw from "@pricora/content/city-photos.json";

/** Unsplash city photo (curated in packages/content/city-photos.json, keyed by guide slug). */
export type CityPhoto = {
  id: string;
  url: string;
  color: string;
  blurHash: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
  downloadLocation: string;
  width: number;
  height: number;
};

const PHOTOS = raw as Record<string, CityPhoto>;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .trim();

/** City-name aliases → slug (names as they appear in GeoNames / our forms). */
const ALIASES: Record<string, string> = {
  "new york city": "new-york",
  "new york": "new-york",
  nyc: "new-york",
  washington: "washington-dc",
  "washington dc": "washington-dc",
  marrakesh: "marrakech",
  denpasar: "bali",
  "ulan bator": "",
};

export function cityPhotoBySlug(slug: string | null | undefined): CityPhoto | null {
  return slug ? (PHOTOS[slug] ?? null) : null;
}

/** Look up by guide slug or city name ("Cancún", "New York City", "Washington, D.C."). */
export function cityPhoto(cityOrSlug: string | null | undefined): CityPhoto | null {
  if (!cityOrSlug) return null;
  if (PHOTOS[cityOrSlug]) return PHOTOS[cityOrSlug];
  const f = fold(cityOrSlug);
  const alias = ALIASES[f];
  if (alias !== undefined) return alias ? (PHOTOS[alias] ?? null) : null;
  return PHOTOS[f.replace(/\s+/g, "-")] ?? null;
}

/** Unsplash imgix URL at a given width (hotlinking images.unsplash.com is required by the Unsplash API guidelines). */
export function photoSrc(p: CityPhoto, w: number, q = 70): string {
  return `${p.url}${p.url.includes("?") ? "&" : "?"}w=${w}&q=${q}&fit=crop&auto=format`;
}

export function photoSrcSet(p: CityPhoto, widths: number[] = [480, 800, 1200, 1600, 2000]): string {
  return widths.map((w) => `${photoSrc(p, w)} ${w}w`).join(", ");
}
