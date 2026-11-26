import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/cn";

/* ------------------------------------------------------------------- Stat */

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Secondary line (e.g. "90-day median"). */
  hint?: React.ReactNode;
  /** Signed change; direction decides color. For prices, `down` is good. */
  delta?: { value: React.ReactNode; direction: "up" | "down"; goodWhen?: "up" | "down" };
}

/** Real numbers only (price stats, admin KPIs). Never invented "trust" figures. */
export function Stat({ label, value, hint, delta, className, ...props }: StatProps) {
  const good = delta ? delta.direction === (delta.goodWhen ?? "down") : false;
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)} {...props}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="price text-xl font-semibold text-text">{value}</span>
      {delta || hint ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          {delta ? (
            <span className={cn("price inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-error")}>
              {delta.direction === "down" ? (
                <ArrowDownRight aria-hidden className="size-3.5" />
              ) : (
                <ArrowUpRight aria-hidden className="size-3.5" />
              )}
              <span className="sr-only">{delta.direction === "down" ? "Down " : "Up "}</span>
              {delta.value}
            </span>
          ) : null}
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

export const Table = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement> & { containerClassName?: string }
>(function Table({ className, containerClassName, ...props }, ref) {
  return (
    <div className={cn("relative w-full overflow-x-auto", containerClassName)}>
      <table ref={ref} className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
});

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tfoot className={cn("border-t border-border bg-surface-2 font-medium", className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "border-b border-border transition-colors duration-fast hover:bg-surface-2/60 data-[state=selected]:bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Right-aligned tabular numerals (prices, counts). */
  numeric?: boolean;
}

export function TableHead({ className, numeric, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle text-xs font-medium text-text-muted",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, numeric, ...props }: TableCellProps) {
  return <td className={cn("px-3 py-2.5 align-middle", numeric && "price text-right", className)} {...props} />;
}

export function TableCaption({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn("mt-3 text-xs text-text-muted", className)} {...props} />;
}
