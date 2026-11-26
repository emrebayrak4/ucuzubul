"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditLogEntry } from "@pricora/contracts";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, EmptyState } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { useSession } from "@/components/session-context";

export default function AuditLogsPage() {
  const { isAdmin } = useSession();
  const list = useListState({ sort: "createdAt" });
  const [open, setOpen] = useState<AuditLogEntry | null>(null);
  const q = useQuery({
    queryKey: ["admin", "audit-logs", list.query],
    queryFn: ({ signal }) => getApi().admin.auditLogs.list(list.query, { signal }),
    placeholderData: keepPreviousData,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Audit logs" />
        <EmptyState title="Admins only" description="The audit log requires the ADMIN role." />
      </div>
    );
  }

  const columns: Column<AuditLogEntry>[] = [
    { key: "time", header: "Time", sortKey: "createdAt", cell: (e) => <span title={dateTime(e.createdAt)} className="whitespace-nowrap">{dateTime(e.createdAt)}</span> },
    { key: "actor", header: "Actor", cell: (e) => e.actor?.email ?? <span className="text-text-muted">System</span> },
    { key: "action", header: "Action", sortKey: "action", cell: (e) => <code className="font-mono text-xs">{e.action}</code> },
    {
      key: "entity",
      header: "Entity",
      sortKey: "entityType",
      cell: (e) => (
        <span className="font-mono text-xs">
          {e.entityType}
          {e.entityId ? <span className="text-text-muted"> · {e.entityId}</span> : null}
        </span>
      ),
    },
    { key: "ip", header: "IP", cell: (e) => <span className="font-mono text-xs text-text-muted">{e.ip ?? "—"}</span> },
    {
      key: "diff",
      header: <span className="sr-only">Diff</span>,
      className: "text-right",
      cell: (e) =>
        e.diff != null ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(e)}>
            View diff
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit logs" description="Every admin write (append-only, retained 7 years). Newest first." />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(e) => e.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search action, entity, actor"
        caption="Audit log"
      />
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {open?.action} · {open?.entityType}
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-surface-2 p-3 font-mono text-xs">{JSON.stringify(open?.diff, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
