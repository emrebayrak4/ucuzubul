import { Badge, type BadgeProps } from "@pricora/ui";
import { humanize } from "@/lib/format";

type Variant = NonNullable<BadgeProps["variant"]>;

const MAP: Record<string, Variant> = {
  // generic
  active: "success",
  live: "success",
  up: "success",
  ok: "success",
  verified: "success",
  approved: "success",
  completed: "success",
  matched: "success",
  auto_matched: "info",
  configured: "info",
  unverified: "warning",
  in_stock: "success",
  // pending
  pending: "warning",
  pending_review: "warning",
  pending_configuration: "neutral",
  queued: "info",
  processing: "info",
  degraded: "warning",
  low_stock: "warning",
  preorder: "info",
  draft: "neutral",
  unknown: "neutral",
  disabled: "neutral",
  archived: "neutral",
  // bad
  error: "error",
  down: "error",
  failed: "error",
  rejected: "error",
  suspended: "error",
  deleted: "error",
  out_of_stock: "neutral",
  unmatched: "neutral",
  high: "error",
  medium: "warning",
  low: "neutral",
};

const LABEL: Record<string, string> = {
  pending_configuration: "Not connected",
  configured: "Configured (untested)",
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <Badge variant={MAP[value] ?? "neutral"} size="sm" className={className}>
      {LABEL[value] ?? humanize(value)}
    </Badge>
  );
}
