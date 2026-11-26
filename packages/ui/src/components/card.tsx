import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Use sparingly: only for genuinely grouped content (a form, a summary panel).
 * Never nest Cards. Lists/grids use dividers or tiles instead.
 */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }>(
  function Card({ className, padded = false, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("rounded-lg border border-border bg-surface text-text", padded && "p-5", className)}
        {...props}
      />
    );
  },
);

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}
