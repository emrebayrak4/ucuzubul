import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowDown, FlaskConical } from "lucide-react";
import { dealTierFromScore, dealTierLabel, type DealTier } from "@pricora/design-tokens";
import { cn } from "../lib/cn";

/* ------------------------------------------------------------------ Badge */

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium leading-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-surface-2 text-text-muted",
        outline: "border border-border bg-surface text-text-muted",
        primary: "bg-primary-soft text-primary-soft-fg",
        accent: "bg-accent text-accent-fg",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        error: "bg-error-soft text-error",
        info: "bg-info-soft text-info",
      },
      size: {
        sm: "h-5 rounded-sm px-1.5 text-2xs [&_svg]:size-3",
        md: "h-6 rounded-sm px-2 text-xs [&_svg]:size-3.5",
      },
      /** Pill shape: chips / filters only. */
      pill: { true: "rounded-full" },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, pill, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, pill }), className)} {...props} />;
}

/* --------------------------------------------------------- DealScoreBadge */

const tierClass: Record<DealTier, string> = {
  exceptional: "bg-deal-exceptional text-deal-exceptional-fg",
  great: "bg-deal-great text-deal-great-fg",
  good: "bg-deal-good text-deal-good-fg",
  average: "bg-deal-average text-deal-average-fg",
  poor: "bg-deal-poor text-deal-poor-fg",
};

export interface DealScoreBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** 0–100 Deal Score from packages/algorithms. */
  score: number;
  /** Override tier (otherwise derived: 90/75/60/40). */
  tier?: DealTier;
  /** Show the tier word next to the number. Default true. */
  showLabel?: boolean;
  size?: "sm" | "md";
  /** Light sweep on Exceptional/Great tiers (off under prefers-reduced-motion). Default true. */
  animated?: boolean;
}

export function DealScoreBadge({ score, tier, showLabel = true, size = "md", animated = true, className, ...props }: DealScoreBadgeProps) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const t = tier ?? dealTierFromScore(s);
  const label = dealTierLabel[t];
  return (
    <span
      role="img"
      aria-label={`Deal Score ${s} out of 100: ${label}`}
      title={`Deal Score ${s}/100 · ${label}`}
      data-tier={t}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm font-semibold leading-none",
        size === "sm" ? "h-5 px-1.5 text-2xs" : "h-6 px-2 text-xs",
        tierClass[t],
        animated && (t === "exceptional" || t === "great") && "animate-shimmer",
        className,
      )}
      {...props}
    >
      <span className="price">{s}</span>
      {showLabel ? <span className="font-medium">{label}</span> : null}
    </span>
  );
}

/* --------------------------------------------------------- PriceDropBadge */

export interface PriceDropBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Positive integer percent, e.g. 12 for a 12% drop. Renders nothing when < 1. */
  percent: number;
  /** Reference window, e.g. "vs 30-day avg". Shown after the number. */
  context?: string;
  size?: "sm" | "md";
  /** Light sweep; drops >= 20% also get the red->orange "hot" fill. Off under prefers-reduced-motion. Default true. */
  animated?: boolean;
}

export function PriceDropBadge({ percent, context, size = "md", animated = true, className, ...props }: PriceDropBadgeProps) {
  const p = Math.round(percent);
  if (!Number.isFinite(p) || p < 1) return null;
  const hot = animated && p >= 20;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-sm font-semibold leading-none",
        hot ? "animate-hot" : "bg-price-drop-soft text-price-drop",
        animated && "animate-shimmer",
        size === "sm" ? "h-5 px-1.5 text-2xs [&_svg]:size-3" : "h-6 px-2 text-xs [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      <ArrowDown aria-hidden strokeWidth={2.5} />
      <span className="sr-only">Price dropped </span>
      <span className="price">{p}%</span>
      {context ? <span className="font-normal">{context}</span> : null}
    </span>
  );
}

/* ---------------------------------------------------------- DemoDataBadge */

export interface DemoDataBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  size?: "sm" | "md";
  /** Override label. Must still clearly say the data is not live. */
  label?: string;
}

/**
 * MANDATORY wherever data with `source = "demo"` is rendered (offer row, tile, fare, rate).
 * Never hide it behind hover; never style it to be ignorable.
 */
export function DemoDataBadge({ size = "md", label = "Demo data", className, ...props }: DemoDataBadgeProps) {
  return (
    <span
      title="Sample data for demonstration. Not a live price."
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-demo-border bg-demo font-semibold leading-none text-demo-fg",
        size === "sm" ? "h-5 px-1.5 text-2xs [&_svg]:size-3" : "h-6 px-2 text-xs [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      <FlaskConical aria-hidden />
      {label}
    </span>
  );
}

/* --------------------------------------------------------- SponsoredLabel */

export interface SponsoredLabelProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** e.g. the advertiser name: "Sponsored by Acme". */
  advertiser?: string;
}

/** Required on every paid placement. Sponsored content never changes organic order or Deal Score. */
export function SponsoredLabel({ advertiser, className, ...props }: SponsoredLabelProps) {
  return (
    <span
      title="Paid placement. Does not affect ranking or Deal Score."
      className={cn(
        "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-sm bg-sponsored px-1.5 text-2xs font-semibold uppercase leading-none tracking-wide text-sponsored-fg",
        className,
      )}
      {...props}
    >
      {advertiser ? `Sponsored · ${advertiser}` : "Sponsored"}
    </span>
  );
}
