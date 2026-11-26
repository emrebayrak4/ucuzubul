import type { ReactNode } from "react";
import { Badge } from "@pricora/ui";
import { PlugZap } from "lucide-react";

/**
 * Placeholder for a section whose API endpoint is not in @pricora/contracts yet.
 * Shows what will live here and which endpoints were requested — never sample/fake rows.
 */
export function ApiPending({
  feature,
  endpoints,
  children,
  label = "API pending",
}: {
  feature: string;
  endpoints: string[];
  children?: ReactNode;
  label?: string;
}) {
  return (
    <section className="rounded-md border border-dashed border-border-strong bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-text-muted">
          <PlugZap className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold">{feature}</h2>
            <Badge variant="neutral" size="sm">
              {label}
            </Badge>
          </div>
          <p className="text-sm text-text-muted">
            The API does not expose this yet, so nothing is shown here (no sample data). The endpoints below were requested in{" "}
            <code className="font-mono text-xs">docs/TASKS.md</code> → Requests (A08 → A04).
          </p>
          <ul className="space-y-1">
            {endpoints.map((e) => (
              <li key={e} className="font-mono text-xs text-text-muted">
                {e}
              </li>
            ))}
          </ul>
          {children ? <div className="pt-2 text-sm text-text-muted">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
