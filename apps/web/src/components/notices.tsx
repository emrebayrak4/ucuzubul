"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FlaskConical, Info, RotateCw } from "lucide-react";
import { Button, cn } from "@pricora/ui";

export function Notice({
  tone = "info",
  children,
  className,
  testId,
}: {
  tone?: "info" | "warning" | "demo";
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "demo" ? FlaskConical : Info;
  return (
    <div
      role="status"
      data-testid={testId}
      className={cn(
        "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
        tone === "info" && "bg-info-soft text-info",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "demo" && "border border-demo-border bg-demo text-demo-fg",
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Mandatory slim notice when a page is composed of demo data (DESIGN_SYSTEM §9). */
export function DemoNotice({ className }: { className?: string }) {
  return (
    <Notice tone="demo" className={className} testId="demo-notice">
      Showing demo data — live store connections are not configured yet. Prices are samples, not live offers.
    </Notice>
  );
}

export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => start(() => router.refresh())}>
      <RotateCw aria-hidden />
      {label}
    </Button>
  );
}
