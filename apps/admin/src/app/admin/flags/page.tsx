"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureFlag } from "@pricora/contracts";
import { Button, EmptyState, ErrorState, Input, Skeleton, Switch } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-context";

/** Flags whose toggle has legal / money / disclosure impact get an extra confirmation. */
const SENSITIVE = new Set(["cashback.payouts", "sponsored.placements"]);

export default function FlagsPage() {
  const { isAdmin } = useSession();
  const q = useQuery({ queryKey: ["admin", "flags"], queryFn: ({ signal }) => getApi().admin.flags.list({ signal }) });
  const [pending, setPending] = useState<{ flag: FeatureFlag; enabled?: boolean; rolloutPercent?: number } | null>(null);
  const [rollout, setRollout] = useState<Record<string, string>>({});

  const update = useApiMutation(
    (v: { key: string; enabled?: boolean; rolloutPercent?: number }) => getApi().admin.flags.update(v.key, { enabled: v.enabled, rolloutPercent: v.rolloutPercent }),
    { success: (f) => `${f.key} ${f.enabled ? "enabled" : "disabled"} · ${f.rolloutPercent}%`, invalidate: [["admin", "flags"]] },
  );

  function request(flag: FeatureFlag, change: { enabled?: boolean; rolloutPercent?: number }) {
    // Turning a flag off, or touching a sensitive flag, always asks first.
    if (change.enabled === false || SENSITIVE.has(flag.key)) setPending({ flag, ...change });
    else update.mutate({ key: flag.key, ...change });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Feature flags" description={isAdmin ? "Toggle features and rollout percentage. Changes are audited." : "Read-only: toggling flags requires the ADMIN role."} />
      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : (
        <div className="divide-y divide-border rounded-md border border-border bg-surface">
          {q.isLoading
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-5 w-64" />
                </div>
              ))
            : (q.data?.items ?? []).map((f) => {
                const r = rollout[f.key] ?? String(f.rolloutPercent);
                const rNum = Number(r);
                const rValid = Number.isInteger(rNum) && rNum >= 0 && rNum <= 100;
                return (
                  <div key={f.key} className="flex flex-wrap items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-medium">{f.key}</code>
                        {SENSITIVE.has(f.key) ? <span className="text-2xs text-warning">sensitive</span> : null}
                      </div>
                      <p className="text-xs text-text-muted">{f.description ?? "No description"}</p>
                      <p className="text-2xs text-text-muted" title={dateTime(f.updatedAt)}>
                        Updated {relative(f.updatedAt)}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-text-muted">
                      Rollout
                      <Input
                        size="sm"
                        className="w-16 text-right tabular-nums"
                        value={r}
                        disabled={!isAdmin}
                        invalid={!rValid}
                        inputMode="numeric"
                        onChange={(e) => setRollout((s) => ({ ...s, [f.key]: e.target.value }))}
                        aria-label={`Rollout percent for ${f.key}`}
                      />
                      %
                    </label>
                    {isAdmin && rValid && rNum !== f.rolloutPercent ? (
                      <Button size="sm" variant="secondary" onClick={() => request(f, { rolloutPercent: rNum })}>
                        Save
                      </Button>
                    ) : null}
                    <Switch
                      checked={f.enabled}
                      disabled={!isAdmin || update.isPending}
                      onCheckedChange={(enabled) => request(f, { enabled })}
                      aria-label={`${f.enabled ? "Disable" : "Enable"} ${f.key}`}
                    />
                  </div>
                );
              })}
          {q.data && q.data.items.length === 0 ? <EmptyState size="sm" title="No feature flags" /> : null}
        </div>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        destructive={pending?.enabled === false}
        title={pending ? `Change ${pending.flag.key}?` : ""}
        confirmLabel="Apply"
        description={
          pending ? (
            <>
              {pending.enabled !== undefined ? <p>{pending.enabled ? "Enable" : "Disable"} this feature for {pending.flag.rolloutPercent}% of traffic.</p> : null}
              {pending.rolloutPercent !== undefined ? <p>Set rollout from {pending.flag.rolloutPercent}% to {pending.rolloutPercent}%.</p> : null}
              {pending.flag.key === "cashback.payouts" ? <p className="mt-2 text-warning">Payouts must stay disabled until legal review is complete.</p> : null}
              {pending.flag.key === "sponsored.placements" ? <p className="mt-2 text-warning">Sponsored units must always carry a visible “Sponsored” label and never change organic ranking.</p> : null}
            </>
          ) : null
        }
        onConfirm={async () => {
          if (!pending) return;
          await update.mutateAsync({ key: pending.flag.key, enabled: pending.enabled, rolloutPercent: pending.rolloutPercent });
          setRollout((s) => {
            const n = { ...s };
            delete n[pending.flag.key];
            return n;
          });
        }}
      />
    </div>
  );
}
