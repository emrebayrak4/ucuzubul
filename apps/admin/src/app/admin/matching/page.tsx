"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AdminMatch } from "@pricora/contracts";
import { Badge, Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Tooltip, TooltipContent, TooltipTrigger } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, humanize, pct, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/field";
import { useSession } from "@/components/session-context";

type Action = { kind: "approve" | "reject"; match: AdminMatch } | { kind: "reassign"; match: AdminMatch } | null;

function confidenceTone(c: number): "success" | "warning" | "error" {
  if (c >= 0.98) return "success";
  if (c >= 0.85) return "warning";
  return "error";
}

export default function MatchingPage() {
  const { canEdit } = useSession();
  const list = useListState({ sort: "confidence", order: "asc" });
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");

  const q = useQuery({
    queryKey: ["admin", "matches", list.query],
    queryFn: ({ signal }) => getApi().admin.matches.list(list.query, { signal }),
    placeholderData: keepPreviousData,
  });

  const review = useApiMutation(
    (v: { id: string; decision: "approve" | "reject" | "reassign"; productId?: string; note?: string }) =>
      getApi().admin.matches.review(v.id, { decision: v.decision, productId: v.productId, note: v.note }),
    {
      success: (_d, v) => (v.decision === "approve" ? "Match approved" : v.decision === "reject" ? "Match rejected" : "Match reassigned"),
      invalidate: [["admin", "matches"], ["admin", "stats"]],
    },
  );

  function close() {
    setAction(null);
    setNote("");
    setProductId("");
  }

  const columns: Column<AdminMatch>[] = [
    {
      key: "candidate",
      header: "Retailer listing",
      cell: (m) => (
        <div className="min-w-0 max-w-xs">
          <div className="truncate font-medium" title={m.candidateTitle}>
            {m.candidateTitle}
          </div>
          <div className="font-mono text-xs text-text-muted">{m.retailerSlug}</div>
        </div>
      ),
    },
    {
      key: "product",
      header: "Proposed canonical product",
      cell: (m) =>
        m.productTitle ? (
          <div className="min-w-0 max-w-xs">
            <div className="truncate" title={m.productTitle}>
              {m.productTitle}
            </div>
            <div className="font-mono text-xs text-text-muted">{m.productId}</div>
          </div>
        ) : (
          <span className="text-text-muted">No candidate</span>
        ),
    },
    {
      key: "confidence",
      header: "Confidence",
      sortKey: "confidence",
      numeric: true,
      cell: (m) => (
        <Badge variant={confidenceTone(m.confidence)} size="sm" className="price">
          {pct(m.confidence)}
        </Badge>
      ),
    },
    { key: "method", header: "Method", cell: (m) => humanize(m.method) },
    {
      key: "conflicts",
      header: "Conflicts",
      cell: (m) =>
        m.conflicts.length === 0 ? (
          <span className="text-text-muted">None</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-sm text-warning underline decoration-dotted underline-offset-2">
                {m.conflicts.length} conflict{m.conflicts.length > 1 ? "s" : ""}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              <ul className="list-disc pl-4">
                {m.conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        ),
    },
    { key: "status", header: "Status", sortKey: "status", cell: (m) => <StatusBadge value={m.status} /> },
    { key: "created", header: "Created", sortKey: "createdAt", cell: (m) => <span title={dateTime(m.createdAt)}>{relative(m.createdAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right whitespace-nowrap",
      cell: (m) =>
        canEdit && (m.status === "pending_review" || m.status === "auto_matched") ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="soft" disabled={!m.productId} onClick={() => setAction({ kind: "approve", match: m })}>
              Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "reassign", match: m })}>
              Reassign
            </Button>
            <Button size="sm" variant="ghost" className="text-error" onClick={() => setAction({ kind: "reject", match: m })}>
              Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Product matching review"
        description="Thresholds: ≥ 98% auto-merge, 85–98% review, < 85% no merge. Never merge listings that differ in storage, color, size, pack or condition."
      />
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-muted">
        <strong className="text-text">Split</strong> (break an existing merged product into separate canonical products) is not supported by
        the API yet — requested from A04. Use <em>Reject</em> to keep a listing out of a product, or <em>Reassign</em> to point it at a different product.
      </p>
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(m) => m.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search listing or product"
        emptyTitle="Review queue is empty"
        caption="Match review queue"
      />

      <ConfirmDialog
        open={action?.kind === "approve" || action?.kind === "reject"}
        onOpenChange={(o) => !o && close()}
        destructive={action?.kind === "reject"}
        title={action?.kind === "approve" ? "Approve match?" : "Reject match?"}
        confirmLabel={action?.kind === "approve" ? "Approve" : "Reject"}
        description={
          action ? (
            <div className="space-y-3">
              <p>
                {action.kind === "approve" ? "Merge" : "Keep separate:"} <strong className="text-text">{action.match.candidateTitle}</strong>
                {action.kind === "approve" ? " into " : " and "}
                <strong className="text-text">{action.match.productTitle ?? "—"}</strong>.
              </p>
              {action.match.conflicts.length ? <p className="text-warning">Conflicts: {action.match.conflicts.join("; ")}</p> : null}
              <Field id="m-note" label="Note (optional)">
                <Input id="m-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </div>
          ) : null
        }
        onConfirm={async () => {
          if (!action || action.kind === "reassign") return;
          await review.mutateAsync({ id: action.match.id, decision: action.kind, note: note.trim() || undefined });
          close();
        }}
      />

      <Dialog open={action?.kind === "reassign"} onOpenChange={(o) => !o && close()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reassign to another product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-text-muted">{action?.match.candidateTitle}</p>
            <Field id="m-product" label="Target product ID" hint="Copy the ID from Products. Must be the same variant and condition." required>
              <Input id="m-product" value={productId} onChange={(e) => setProductId(e.target.value)} className="font-mono" />
            </Field>
            <Field id="m-note2" label="Note (optional)">
              <Input id="m-note2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              loading={review.isPending}
              disabled={!productId.trim()}
              onClick={async () => {
                if (action?.kind !== "reassign") return;
                try {
                  await review.mutateAsync({ id: action.match.id, decision: "reassign", productId: productId.trim(), note: note.trim() || undefined });
                  close();
                } catch {
                  // error toast already shown by useApiMutation
                }
              }}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
