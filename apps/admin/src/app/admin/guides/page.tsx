"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { AdminGuideListResponse, GuideStatus } from "@pricora/contracts";
import { Button, Select } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { dateTime, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { useSession } from "@/components/session-context";

type Row = AdminGuideListResponse["items"][number];

export default function GuidesPage() {
  const { canEdit } = useSession();
  const list = useListState();
  const [status, setStatus] = useState<"" | GuideStatus>("");
  const query = { page: list.state.page, pageSize: list.state.pageSize, q: list.state.q || undefined, status: status || undefined };
  const q = useQuery({
    queryKey: ["admin", "guides", query],
    queryFn: ({ signal }) => getApi().request("admin.guides.list", { query, signal }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: "Guide",
      cell: (g) => (
        <Link href={`/admin/guides/${g.id}`} className="block min-w-0 max-w-md hover:underline">
          <div className="truncate font-medium">{g.title}</div>
          <div className="truncate font-mono text-xs text-text-muted">{g.slug}</div>
        </Link>
      ),
    },
    {
      key: "city",
      header: "City",
      cell: (g) => (
        <span className="whitespace-nowrap">
          {g.city}, <span className="text-text-muted">{g.countryIso2}</span>
        </span>
      ),
    },
    { key: "tags", header: "Tags", cell: (g) => <span className="line-clamp-1 max-w-48 text-xs text-text-muted">{g.tags.join(", ") || "—"}</span> },
    { key: "status", header: "Status", cell: (g) => <StatusBadge value={g.status === "published" ? "active" : "draft"} /> },
    { key: "reviewed", header: "Last reviewed", cell: (g) => <span className="text-sm">{g.lastReviewed ?? <span className="text-warning">Never</span>}</span> },
    { key: "updated", header: "Updated", cell: (g) => <span title={dateTime(g.updatedAt)}>{relative(g.updatedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (g) => (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/admin/guides/${g.id}`}>{canEdit ? "Edit" : "View"}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Travel guides"
        description="City guides shown on the travel pages. Edits made here are protected from the file-based content sync."
        actions={
          canEdit ? (
            <Button asChild size="sm">
              <Link href="/admin/guides/new">
                <Plus className="size-4" aria-hidden /> New guide
              </Link>
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(g) => g.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search title or city"
        emptyTitle="No guides"
        caption="Travel guides"
        toolbar={
          <Select size="sm" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as "" | GuideStatus); list.setPage(1); }} containerClassName="w-40">
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </Select>
        }
      />
    </div>
  );
}
