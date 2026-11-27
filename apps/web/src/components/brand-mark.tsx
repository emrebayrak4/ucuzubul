import { StoreLogo } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { PUBLIC_API_URL } from "@/lib/env";

const sizes = {
  xs: { box: "h-4 w-12", w: 48, h: 16, mono: "xs" as const },
  sm: { box: "h-6 w-16", w: 64, h: 24, mono: "sm" as const },
  md: { box: "h-8 w-24", w: 96, h: 32, mono: "md" as const },
  lg: { box: "h-12 w-36", w: 144, h: 48, mono: "lg" as const },
};

/**
 * Square tiles for lists and tables: image logos AND monograms render in the same fixed box (white bg, 1px border,
 * rounded, object-contain with padding), so the name next to it always starts at the same x.
 */
const tiles = {
  "tile-xs": { box: "size-5 rounded-xs p-px", px: 20, mono: "text-[8px]" },
  "tile-sm": { box: "size-8 rounded-sm p-0.5", px: 32, mono: "text-2xs" },
  "tile-md": { box: "size-10 rounded-md p-1", px: 40, mono: "text-xs" },
} as const;
export type BrandMarkSize = keyof typeof sizes | keyof typeof tiles;

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
  size?: BrandMarkSize;
  className?: string;
}) {
  if (size in tiles) {
    const t = tiles[size as keyof typeof tiles];
    const tileSrc = logoSrc(logoUrl);
    return (
      <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white", t.box, !tileSrc && "p-0", className)}>
        {tileSrc ? (
          <img src={tileSrc} alt={name} width={t.px} height={t.px} loading="lazy" decoding="async" className="size-full object-contain" />
        ) : (
          <StoreLogo name={name} brandColor={brandColor} size="md" className={cn("size-full rounded-none border-0", t.mono)} />
        )}
      </span>
    );
  }
  const s = sizes[size as keyof typeof sizes];
  const src = logoSrc(logoUrl);
  if (!src) return <StoreLogo name={name} brandColor={brandColor} size={s.mono} className={className} />;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-white", s.box, className)}>
      <img src={src} alt={name} width={s.w} height={s.h} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
    </span>
  );
}
