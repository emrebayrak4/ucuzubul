"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button, ErrorState, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { PUBLIC_API_URL } from "@/lib/env";
import { dateTime, humanize } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const CHECK_LABEL = { db: "PostgreSQL", redis: "Redis (cache, rate limit, BullMQ queues)", search: "Meilisearch" } as const;

export default function HealthPage() {
  const q = useQuery({ queryKey: ["health"], queryFn: ({ signal }) => getApi().health({ signal }), refetchInterval: 30_000 });
  const d = q.data;
  const kinds = d ? Array.from(new Set(d.adapters.map((a) => a.kind))) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="System health"
        description={d ? `API ${d.version} · checked ${dateTime(d.time)} · auto-refresh 30s` : `GET ${PUBLIC_API_URL}/v1/health`}
        badge={d ? <StatusBadge value={d.status} /> : undefined}
        actions={
          <Button size="sm" variant="secondary" onClick={() => void q.refetch()} loading={q.isFetching}>
            <RefreshCw className="size-4" aria-hidden /> Refresh
          </Button>
        }
      />
      {q.error ? (
        <ErrorState title="Health endpoint unreachable" description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        {(["db", "redis", "search"] as const).map((k) => (
          <div key={k} className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{CHECK_LABEL[k]}</span>
              {d ? <StatusBadge value={d.checks[k].status} /> : q.isLoading ? <Skeleton className="h-5 w-12" /> : null}
            </div>
            <p className="mt-2 price text-xs text-text-muted">{d ? (d.checks[k].latencyMs != null ? `${d.checks[k].latencyMs} ms` : "No latency reported") : ""}</p>
            {d?.checks[k].message ? <p className="mt-1 text-xs text-text-muted">{d.checks[k].message}</p> : null}
          </div>
        ))}
      </section>
      <p className="text-xs text-text-muted">
        Queue depth / worker status is not part of /v1/health yet (requested from A04); Redis status above covers the BullMQ connection only.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-md font-semibold">Adapters</h2>
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adapter</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kinds.flatMap((kind) =>
                (d?.adapters ?? [])
                  .filter((a) => a.kind === kind)
                  .map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <span className="font-medium">{a.name}</span> <span className="font-mono text-xs text-text-muted">{a.id}</span>
                      </TableCell>
                      <TableCell>{humanize(kind)}</TableCell>
                      <TableCell>
                        <StatusBadge value={a.status} />
                      </TableCell>
                    </TableRow>
                  )),
              )}
            </TableBody>
          </Table>
          {d && d.adapters.length === 0 ? <p className="border-t border-border p-4 text-sm text-text-muted">No adapters registered.</p> : null}
        </div>
        <p className="text-xs text-text-muted">“Not connected” means credentials are not configured (pending_configuration). Such adapters return no results — never placeholder data.</p>
      </section>
    </div>
  );
}
