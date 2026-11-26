/**
 * URL-safe slug: lowercase ASCII, hyphen separated, diacritics stripped.
 * "Apple iPhone 16 Pro (256 GB) – Black Titanium" → "apple-iphone-16-pro-256-gb-black-titanium"
 */
export function slugify(input: string, options: { maxLength?: number } = {}): string {
  const { maxLength = 120 } = options;
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/["'’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-+[^-]*$/, "") || slug.slice(0, maxLength);
}

export function truncate(input: string, max: number, ellipsis = "…"): string {
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - ellipsis.length)).trimEnd() + ellipsis;
}

/** "1 store" / "3 stores" */
export function pluralize(count: number, singular: string, plural = singular + "s"): string {
  return count + " " + (count === 1 ? singular : plural);
}
