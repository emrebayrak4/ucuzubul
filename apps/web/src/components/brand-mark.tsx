import { StoreLogo } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { PUBLIC_API_URL } from "@/lib/env";

const sizes = {
  xs: { box: "h-4 w-12", w: 48, h: 16, mono: "xs" as const },
  sm: { box: "h-6 w-16", w: 64, h: 24, mono: "sm" as const },
  md: { box: "h-8 w-24", w: 96, h: 32, mono: "md" as const },
  lg: { box: "h-12 w-36", w: 144, h: 48, mono: "lg" as const },
};

export function logoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? PUBLIC_API_URL + url : url;
}

/**
 * Store / brand logo in a fixed-size white box (object-contain, explicit width/height → no layout shift).
 * Falls back to the AA-safe monogram when the API has no logo for it.
 */
export function BrandMark({
  name,
  logoUrl,
  brandColor,
  size = "md",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const s = sizes[size];
  const src = logoSrc(logoUrl);
  if (!src) return <StoreLogo name={name} brandColor={brandColor} size={s.mono} className={className} />;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white", s.box, className)}>
      <img src={src} alt={name} width={s.w} height={s.h} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
    </span>
  );
}
