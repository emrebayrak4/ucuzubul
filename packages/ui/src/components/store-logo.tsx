import * as React from "react";
import { contrastRatio } from "@pricora/design-tokens";
import { cn } from "../lib/cn";

const sizeClass = {
  xs: "size-5 text-[9px]",
  sm: "size-7 text-2xs",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

export interface StoreLogoProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  name: string;
  logoUrl?: string | null;
  /** Retailer brand color as #RRGGBB. Used as monogram background. */
  brandColor?: string | null;
  size?: keyof typeof sizeClass;
  /** Custom renderer (e.g. next/image). */
  renderImage?: (props: { src: string; alt: string; className: string }) => React.ReactNode;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&.-]/gu, "")
    .split(/[\s.-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "?").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

const LIGHT_FG = "#FFFFFF";
const DARK_FG = "#141816";
const MIN_CONTRAST = 4.5;

function mix(hex: string, target: number, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Monogram colors that always meet WCAG AA (>= 4.5:1).
 * Picks the higher-contrast foreground; if the brand color itself can't reach 4.5:1 with either
 * (mid-tone reds/oranges such as eBay #E53238), the background is darkened (white fg) or
 * lightened (dark fg) in small steps until it does. The hue stays recognisable.
 */
export function monogramColors(brandHex: string): { bg: string; fg: string; ratio: number } {
  const useLight = contrastRatio(LIGHT_FG, brandHex) >= contrastRatio(DARK_FG, brandHex);
  const fg = useLight ? LIGHT_FG : DARK_FG;
  let bg = brandHex;
  let ratio = contrastRatio(fg, bg);
  for (let step = 1; ratio < MIN_CONTRAST && step <= 20; step++) {
    bg = mix(brandHex, useLight ? 0 : 255, step * 0.05);
    ratio = contrastRatio(fg, bg);
  }
  return { bg, fg, ratio };
}

/** Store identity. Real logo when provided; otherwise a text monogram on the brand color. */
export function StoreLogo({ name, logoUrl, brandColor, size = "md", renderImage, className, ...props }: StoreLogoProps) {
  const base = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface font-semibold leading-none",
    sizeClass[size],
    className,
  );
  if (logoUrl) {
    const imgClass = "size-full object-contain p-0.5";
    return (
      <span className={base} {...props}>
        {renderImage ? (
          renderImage({ src: logoUrl, alt: name, className: imgClass })
        ) : (
          <img src={logoUrl} alt={name} className={imgClass} loading="lazy" decoding="async" />
        )}
      </span>
    );
  }
  const colors = brandColor && HEX.test(brandColor) ? monogramColors(brandColor) : null;
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(base, !colors && "bg-surface-3 text-text")}
      style={colors ? { backgroundColor: colors.bg, color: colors.fg, borderColor: "transparent" } : undefined}
      {...props}
    >
      <span aria-hidden>{monogram(name)}</span>
    </span>
  );
}
