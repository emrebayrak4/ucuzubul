import { CategoryIcon } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { categoryPhoto, categoryPhotoSrc } from "@/lib/category-photos";

/**
 * Round category image: real Unsplash photo (object-cover, color placeholder while loading, soft ring,
 * zoom on parent hover via `group`) or the category icon when no photo exists for the slug.
 */
export function CategoryCircle({ slug, iconSlug, size = 72, className }: { slug: string; iconSlug?: string; size?: number; className?: string }) {
  const photo = categoryPhoto(slug);
  return (
    <span
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary ring-1 ring-border ring-offset-2 ring-offset-surface transition-shadow duration-fast group-hover:ring-2 group-hover:ring-primary", className)}
      style={{ width: size, height: size, backgroundColor: photo?.color }}
    >
      {photo ? (
        <img
          src={categoryPhotoSrc(photo, size * 2)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-base ease-standard motion-safe:group-hover:scale-110"
        />
      ) : (
        <CategoryIcon category={iconSlug ?? slug} size={Math.round(size * 0.42)} />
      )}
    </span>
  );
}
