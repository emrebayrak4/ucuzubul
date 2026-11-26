"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AdminAnomaly } from "@pricora/contracts";
import { getApi } from "@/lib/api";
import { dateTime, humanize, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export default function AnomaliesPage() {
  const list = useListState({ sort: "detectedAt" });
  const q = useQuery({
    queryKey: ["admin", "anomalies", list.query],
    queryFn: ({ signal }) => getApi().admin.anomalies.list(list.query, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminAnomaly>[] = [
    { key: "severity", header: "Severity", sortKey: "severity", cell: (a) => <StatusBadge value={a.severity} /> },
    { key: "kind", header: "Type", sortKey: "kind", cell: (a) => humanize(a.kind) },
    { key: "message", header: "Details", cell: (a) => <span className="line-clamp-2 max-w-md">{a.message}</span> },
    {
      key: "target",
      header: "Product / retailer",
      cell: (a) => (
        <div className="font-mono text-xs">
          <div>{a.productSlug ?? "—"}</div>
          <div className="text-text-muted">{a.retailerSlug ?? ""}</div>
        </div>
      ),
    },
    { key: "detected", header: "Detected", sortKey: "detectedAt", cell: (a) => <span title={dateTime(a.detectedAt)}>{relative(a.detectedAt)}</span> },
    {
      key: "resolved",
      header: "Status",
      cell: (a) => (a.resolvedAt ? <span title={dateTime(a.resolvedAt)}><StatusBadge value="completed" /></span> : <StatusBadge value="pending" />),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Price anomalies"
        description="Spikes, outlier drops, stale offers, fake-discount flags and feed errors detected by the pipeline. Resolving from here needs an API endpoint (requested from A04)."
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(a) => a.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search message, product, retailer"
        emptyTitle="No anomalies detected"
        caption="Price anomalies"
      />
    </div>
  );
}
