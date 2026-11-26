"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Skeleton, Tooltip, TooltipContent, TooltipTrigger } from "@pricora/ui";
import { DASH } from "@/lib/format";

interface KpiProps {
  label: string;
  /** `null` → "—" with the `missingReason` tooltip. Never pass invented numbers. */
  value: ReactNode | null;
  hint?: ReactNode;
  missingReason?: string;
  loading?: boolean;
  tone?: "default" | "warning" | "error";
}

export function Kpi({ label, value, hint, missingReason, loading, tone = "default" }: KpiProps) {
  const missing = value === null;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface px-4 py-3">
      <span className="flex items-center gap-1 text-xs text-text-muted">
        {label}
        {missing && missingReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-text-muted hover:text-text" aria-label={`Why is ${label} empty?`}>
                <Info className="size-3.5" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{missingReason}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : missing ? (
        missingReason ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="price w-fit text-2xl font-semibold text-text-muted" aria-label={`${label}: no data. ${missingReason}`}>
                {DASH}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{missingReason}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="price text-2xl font-semibold text-text-muted">{DASH}</span>
        )
      ) : (
        <span
          className={
            "price truncate text-2xl font-semibold " + (tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-text")
          }
        >
          {value}
        </span>
      )}
      {hint ? <span className="truncate text-xs text-text-muted">{hint}</span> : null}
    </div>
  );
}
