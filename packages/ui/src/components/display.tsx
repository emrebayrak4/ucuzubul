"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive, Separator as SeparatorPrimitive } from "radix-ui";
import { Star } from "lucide-react";
import { Toaster as SonnerToaster, toast, type ToasterProps } from "sonner";
import { cn } from "../lib/cn";
import { formatCount } from "../lib/format";

/* ---------------------------------------------------------- RatingDisplay */

export interface RatingDisplayProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Real average rating from a named source. `null`/`undefined` => renders nothing. */
  rating: number | null | undefined;
  /** Number of ratings. 0 => renders nothing. */
  count?: number | null;
  /** Where the rating comes from (e.g. "Best Buy"). Shown in the accessible label/title. */
  source?: string;
  max?: number;
  size?: "sm" | "md";
}

/** Renders ONLY with real rating data. Never pass placeholders or computed fake values. */
export function RatingDisplay({ rating, count, source, max = 5, size = "sm", className, ...props }: RatingDisplayProps) {
  if (rating === null || rating === undefined || !Number.isFinite(rating) || count === 0) return null;
  const r = Math.max(0, Math.min(max, rating));
  const pct = (r / max) * 100;
  const label = `Rated ${r.toFixed(1)} out of ${max}${count ? ` from ${formatCount(count)} ratings` : ""}${source ? ` at ${source}` : ""}`;
  const starSize = size === "sm" ? "size-3.5" : "size-4";
  const stars = Array.from({ length: max }, (_, i) => <Star key={i} aria-hidden className={cn(starSize, "shrink-0")} />);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label} {...props}>
      <span role="img" aria-label={label} className="relative inline-flex">
        <span className="flex text-border-strong">{stars}</span>
        <span className="absolute inset-0 flex overflow-hidden text-warning [&_svg]:fill-current" style={{ width: `${pct}%` }}>
          {stars}
        </span>
      </span>
      <span aria-hidden className={cn("price text-text-muted", size === "sm" ? "text-xs" : "text-sm")}>
        {r.toFixed(1)}
        {count ? ` (${formatCount(count)})` : null}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------- Avatar */

export interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export function Avatar({ src, name, size = "md", className, ...props }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-primary-soft",
        size === "sm" && "size-7 text-2xs",
        size === "md" && "size-9 text-xs",
        size === "lg" && "size-12 text-sm",
        className,
      )}
      {...props}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 400 : 0}
        className="flex size-full items-center justify-center font-semibold text-primary-soft-fg"
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* -------------------------------------------------------------- Separator */

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = "horizontal", decorative = true, ...props }, ref) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      orientation={orientation}
      decorative={decorative}
      className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ Toast */

/**
 * Mount once near the root. Theme follows the app (pass `theme` from next-themes if needed).
 * Use `toast()` / `toast.success()` / `toast.error()` from this package.
 */
export function Toaster({ toastOptions, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      gap={8}
      style={{ zIndex: "var(--pc-z-toast)" } as React.CSSProperties}
      toastOptions={{
        ...toastOptions,
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-md border border-border bg-surface p-3.5 text-sm text-text shadow-lg sm:w-[360px]",
          title: "font-semibold",
          description: "text-text-muted",
          actionButton: "ml-auto rounded-sm bg-primary px-2.5 py-1 text-xs font-medium text-primary-fg",
          cancelButton: "rounded-sm bg-surface-2 px-2.5 py-1 text-xs font-medium text-text",
          closeButton:
            "!left-auto !right-1 !top-1 !border-0 !bg-transparent text-text-muted hover:!bg-surface-2 hover:text-text",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-error",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-info",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { toast };
