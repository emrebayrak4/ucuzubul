import * as React from "react";
import { cn } from "../lib/cn";
import { formatPrice } from "../lib/format";

const sizeClass = {
  sm: "text-base",
  md: "text-md",
  lg: "text-xl",
  xl: "text-3xl",
} as const;

const listSizeClass = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-md",
} as const;

export interface PriceTagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Integer minor units. `null`/`undefined` renders the unavailable text. */
  cents: number | null | undefined;
  currency?: string;
  /** Original/list price in cents; shown struck-through only when greater than `cents`. */
  listPriceCents?: number | null;
  /** Prefix "from" (lowest of several offers / starting fare). */
  from?: boolean;
  /** Marks the value as an estimate (e.g. tax/total without ZIP). Adds "est." */
  estimated?: boolean;
  /** Suffix such as "/night", "total", "per person". */
  suffix?: string;
  size?: keyof typeof sizeClass;
  /** Use `primary` only for the single hero price on a page. */
  tone?: "default" | "primary";
  unavailableText?: string;
  trimZeroCents?: boolean;
}

/** Always tabular. Always cents in. Never shows a strike-through that is not real. */
export function PriceTag({
  cents,
  currency = "USD",
  listPriceCents,
  from = false,
  estimated = false,
  suffix,
  size = "md",
  tone = "default",
  unavailableText = "Price unavailable",
  trimZeroCents = false,
  className,
  ...props
}: PriceTagProps) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return (
      <span className={cn("text-sm text-text-muted", className)} {...props}>
        {unavailableText}
      </span>
    );
  }
  const value = formatPrice(cents, { currency, trimZeroCents });
  const showList = typeof listPriceCents === "number" && listPriceCents > cents;
  const list = showList ? formatPrice(listPriceCents, { currency, trimZeroCents }) : null;

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)} {...props}>
      {from ? <span className="text-xs font-normal text-text-muted">from</span> : null}
      {estimated ? <span className="text-xs font-normal text-text-muted">est.</span> : null}
      <span
        className={cn(
          "price font-bold",
          sizeClass[size],
          tone === "primary" ? "text-primary" : "text-text",
        )}
      >
        {showList ? <span className="sr-only">Now </span> : null}
        {value}
      </span>
      {suffix ? <span className="text-xs font-normal text-text-muted">{suffix}</span> : null}
      {list ? (
        <s className={cn("price text-text-muted", listSizeClass[size])}>
          <span className="sr-only">Was </span>
          {list}
        </s>
      ) : null}
    </span>
  );
}
