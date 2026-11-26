import Link from "next/link";
import { brand } from "@pricora/config/brand";

const files = {
  default: "/brand/logo.png",
  "on-blue": "/brand/logo-on-blue.png",
  white: "/brand/logo-white.png",
} as const;

/**
 * WhichLess wordmark (assets from packages/config/assets, resized into /public/brand).
 * `on-blue` for the blue shopping bar, `white` for the navy/red travel bars.
 */
export function Logo({
  className,
  variant = "default",
  inverted,
  href = "/",
  height = 32,
  imgClassName,
}: {
  className?: string;
  variant?: keyof typeof files;
  /** White logo for coloured bars (never use on-blue on a blue background — the blue mark disappears). */
  inverted?: boolean;
  href?: string;
  height?: number;
  /** Responsive sizing classes (e.g. "h-[34px] lg:h-[46px] w-auto"); overrides the fixed height. */
  imgClassName?: string;
}) {
  const v = inverted ? "white" : variant;
  const width = Math.round((height * 321) / 96);
  return (
    <Link href={href} className={"inline-flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current " + (className ?? "")} aria-label={`${brand.name} home`}>
      <img src={files[v]} alt={brand.name} width={width} height={height} className={imgClassName ? "block w-auto " + imgClassName : "block h-auto"} style={imgClassName ? undefined : { height, width }} />
    </Link>
  );
}
