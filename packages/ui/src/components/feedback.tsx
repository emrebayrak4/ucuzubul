import * as React from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-skeleton rounded-sm bg-surface-3", className)} {...props} />;
}

/** Placeholder that matches ProductTile geometry (prevents layout shift). */
export function ProductTileSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col rounded-md border border-border bg-surface p-2.5", className)}>
      <Skeleton className="mb-2.5 aspect-square w-full" />
      <Skeleton className="mb-1.5 h-3.5 w-full" />
      <Skeleton className="mb-3 h-3.5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary next step (Button / link). Empty states should always offer one. */
  action?: React.ReactNode;
  size?: "sm" | "md";
}

export function EmptyState({ icon, title, description, action, size = "md", className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "md" ? "gap-3 px-6 py-14" : "gap-2 px-4 py-8",
        className,
      )}
      {...props}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted [&_svg]:size-5">
        {icon ?? <Inbox aria-hidden />}
      </div>
      <div className="max-w-sm">
        <p className="text-md font-semibold text-text">{title}</p>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- ErrorState */

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Optional error/request id for support. */
  code?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Please try again.",
  onRetry,
  retryLabel = "Try again",
  code,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)} {...props}>
      <div className="flex size-11 items-center justify-center rounded-full bg-error-soft text-error [&_svg]:size-5">
        <AlertTriangle aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-md font-semibold text-text">{title}</p>
        {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
        {code ? <p className="mt-2 font-mono text-2xs text-text-muted">Ref: {code}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
