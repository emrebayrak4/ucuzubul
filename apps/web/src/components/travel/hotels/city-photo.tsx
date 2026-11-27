import { cn } from "@pricora/ui/utils";
import { photoSrc, photoSrcSet, type CityPhoto } from "@/lib/city-photos";
import { PhotoCredit } from "@/components/photo-credit";

/** Background city photo (absolute, fills its positioned parent). Placeholder color = Unsplash dominant color. */
export function CityPhotoImg({ photo, sizes = "100vw", className, priority = false }: { photo: CityPhoto; sizes?: string; className?: string; priority?: boolean }) {
  return (
    <img
      src={photoSrc(photo, 1200)}
      srcSet={photoSrcSet(photo)}
      sizes={sizes}
      alt={photo.alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
      className={cn("absolute inset-0 size-full object-cover", className)}
      style={{ backgroundColor: photo.color }}
    />
  );
}

/** Unsplash attribution as a small ⓘ in the image corner (see PhotoCredit). Parent must be `relative`. */
export function UnsplashCredit({ photo, className, side }: { photo: CityPhoto; className?: string; side?: "bottom-end" | "bottom-start" | "top-end" | "top-start" }) {
  return <PhotoCredit photo={photo} className={className} side={side} />;
}
