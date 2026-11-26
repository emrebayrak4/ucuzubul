"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus } from "lucide-react";
import { CouponSource, CouponStatus, type AdminCoupon, type AdminUpdateCouponRequest } from "@pricora/contracts";
import {
  Badge,
  Button,
  DemoDataBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  StoreLogo,
} from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { COUPON_STATUS_LABEL, formatDiscount, isExpired } from "@/lib/coupons";
import { dateTime, humanize, pct, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CouponForm, type CouponFormResult } from "@/components/coupon-form";
import { useSession } from "@/components/session-context";

const KEYS = [["admin", "coupons"]];

type Pending = { coupon: AdminCoupon; patch: AdminUpdateCouponRequest; title: string; description: string; destructive?: boolean } | { coupon: AdminCoupon; delete: true } | null;

export default function AdminCouponsPage() {
  const { canEdit } = useSession();
  const list = useListState();
  const [status, setStatus] = useState("");
  const [retailer, setRetailer] = useState("");
  const [source, setSource] = useState("");
  const [sheet, setSheet] = useState<AdminCoupon | "new" | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const query = {
    page: list.state.page,
    pageSize: list.state.pageSize,
    q: list.state.q || undefined,
    status: (status || undefined) as CouponStatus | undefined,
    retailer: retailer || undefined,
    source: (source || undefined) as CouponSource | undefined,
  };
  const q = useQuery({
    queryKey: ["admin", "coupons", query],
    queryFn: ({ signal }) => getApi().request("admin.coupons.list", { query, signal }),
    placeholderData: keepPreviousData,
  });
  const retailers = useQuery({ queryKey: ["catalog", "retailers"], queryFn: ({ signal }) => getApi().catalog.retailers({ signal }), staleTime: 60_000 });
  // Pending-approval count for the header hint (cheap: pageSize 1).
  const pendingCount = useQuery({
    queryKey: ["admin", "coupons", "pending-count"],
    queryFn: ({ signal }) => getApi().request("admin.coupons.list", { query: { status: "pending_approval", pageSize: 1 }, signal }),
  });

  const save = useApiMutation(
    (r: CouponFormResult | { kind: "patch"; id: string; patch: AdminUpdateCouponRequest }) => {
      if (r.kind === "admin-create") return getApi().request("admin.coupons.create", { body: r.body });
      if (r.kind === "admin-edit") return getApi().request("admin.coupons.update", { params: { id: (sheet as AdminCoupon).id }, body: r.patch });
      if (r.kind === "patch") return getApi().request("admin.coupons.update", { params: { id: r.id }, body: r.patch });
      throw new Error("Unsupported");
    },
    { success: (c) => `Coupon saved — ${COUPON_STATUS_LABEL[c.status]}`, invalidate: KEYS, onSuccess: () => setSheet(null) },
  );
  const remove = useApiMutation((id: string) => getApi().request("admin.coupons.delete", { params: { id } }), { success: "Coupon deleted", invalidate: KEYS });

  function quick(c: AdminCoupon, next: CouponStatus) {
    const map: Partial<Record<CouponStatus, { title: string; description: string; destructive?: boolean }>> = {
      active: { title: "Approve coupon?", description: `“${c.title}” for ${c.retailer.name} becomes visible on the site, in the extension and in apps.` },
      rejected: { title: "Reject coupon?", description: `“${c.title}” stays hidden. The submitter sees it as rejected.`, destructive: true },
      expired: { title: "Mark as expired?", description: `“${c.title}” is removed from live listings.`, destructive: true },
      reported: { title: "Mark as reported?", description: `“${c.title}” is flagged for review and hidden from the extension until resolved.`, destructive: true },
    };
    const m = map[next];
    if (m) setPending({ coupon: c, patch: { status: next }, ...m });
  }

  const columns: Column<AdminCoupon>[] = [
    {
      key: "store",
      header: "Store",
      cell: (c) => (
        <div className="flex items-center gap-2">
          <StoreLogo name={c.retailer.name} logoUrl={c.retailer.logoUrl} brandColor={c.retailer.brandColor} size="sm" />
          <span className="truncate text-sm">{c.retailer.name}</span>
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      cell: (c) => (
        <div className="flex items-center gap-1.5">
          {c.code ? <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{c.code}</code> : <span className="text-xs text-text-muted">No code (deal)</span>}
          {c.source === "demo" ? <DemoDataBadge size="sm" /> : null}
        </div>
      ),
    },
    {
      key: "title",
      header: "Title",
      cell: (c) => (
        <div className="min-w-0 max-w-xs">
          <div className="truncate font-medium" title={c.title}>
            {c.title}
          </div>
          {c.createdBy ? <div className="truncate text-2xs text-text-muted">by {c.createdBy.email}</div> : null}
        </div>
      ),
    },
    { key: "discount", header: "Discount", cell: (c) => <span className="price whitespace-nowrap text-sm">{formatDiscount(c)}</span> },
    {
      key: "expires",
      header: "Expires",
      cell: (c) =>
        c.expiresAt ? (
          <span title={dateTime(c.expiresAt)} className={isExpired(c) ? "text-error" : undefined}>
            {isExpired(c) ? "Expired " : ""}
            {relative(c.expiresAt)}
          </span>
        ) : (
          <span className="text-text-muted">No expiry</span>
        ),
    },
    { key: "source", header: "Source", cell: (c) => <span className="font-mono text-xs">{c.source}</span> },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
<StatusBadge value={c.status} className="whitespace-nowrap" />
      ),
    },
    {
      key: "votes",
      header: "Worked / failed",
      numeric: true,
      cell: (c) => (
        <span className="price whitespace-nowrap" title={c.stats.lastWorkedAt ? `Last worked ${dateTime(c.stats.lastWorkedAt)}` : "No successful reports yet"}>
          <span className="text-success">{c.stats.successCount}</span> / <span className={c.stats.failCount ? "text-error" : undefined}>{c.stats.failCount}</span>
          {c.stats.successRate != null ? <span className="text-text-muted"> · {pct(c.stats.successRate, 0)}</span> : null}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right whitespace-nowrap",
      cell: (c) =>
        canEdit ? (
          <div className="flex justify-end gap-1">
            {c.status === "pending_approval" ? (
              <Button size="sm" variant="soft" onClick={() => quick(c, "active")}>
                Approve
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSheet(c)}>
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label={`More actions for ${c.title}`} variant="ghost" size="sm">
                  <MoreHorizontal className="size-4" aria-hidden />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {c.status !== "active" ? <DropdownMenuItem onSelect={() => quick(c, "active")}>{c.status === "pending_approval" ? "Approve" : "Mark active"}</DropdownMenuItem> : null}
                {c.status === "pending_approval" ? <DropdownMenuItem onSelect={() => quick(c, "rejected")}>Reject</DropdownMenuItem> : null}
                {c.status !== "expired" ? <DropdownMenuItem onSelect={() => quick(c, "expired")}>Mark expired</DropdownMenuItem> : null}
                {c.status !== "reported" ? <DropdownMenuItem onSelect={() => quick(c, "reported")}>Mark reported</DropdownMenuItem> : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setPending({ coupon: c, delete: true })}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Coupons"
        description="Store coupons from feeds, affiliate networks, merchants and the community. Worked/failed counts come only from real usage reports."
        badge={
          pendingCount.data && pendingCount.data.total > 0 ? (
            <Badge variant="warning" size="sm">
              {pendingCount.data.total} pending approval
            </Badge>
          ) : undefined
        }
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setSheet("new")}>
              <Plus className="size-4" aria-hidden /> New coupon
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(c) => c.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search code or title"
        emptyTitle="No coupons match"
        caption="Coupons"
        toolbar={
          <>
            <Select size="sm" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); list.setPage(1); }} containerClassName="w-44">
              <option value="">All statuses</option>
              {CouponStatus.options.map((s) => (
                <option key={s} value={s}>
                  {COUPON_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
            <Select size="sm" aria-label="Store" value={retailer} onChange={(e) => { setRetailer(e.target.value); list.setPage(1); }} containerClassName="w-44">
              <option value="">All stores</option>
              {(retailers.data?.items ?? []).map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Select size="sm" aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); list.setPage(1); }} containerClassName="w-36">
              <option value="">All sources</option>
              {CouponSource.options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </>
        }
      />
      <p className="text-xs text-text-muted">Click counts per coupon are not in the API response yet (requested from A04).</p>

      <Sheet open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          {sheet ? (
            <>
              <SheetHeader className="border-b border-border p-5">
                <SheetTitle>{sheet === "new" ? "New coupon" : `Edit coupon · ${sheet.retailer.name}`}</SheetTitle>
                <SheetDescription>
                  {sheet === "new" ? "Admin-created coupons can go live immediately." : `Source: ${sheet.source} · created ${relative(sheet.createdAt)}`}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5">
                <CouponForm
                  key={sheet === "new" ? "new" : sheet.id}
                  id="coupon-form"
                  mode={sheet === "new" ? "admin-create" : "admin-edit"}
                  coupon={sheet === "new" ? null : sheet}
                  retailers={(retailers.data?.items ?? []).map((r) => ({ id: r.id, name: r.name }))}
                  onSubmit={(r) => {
                    if (r.kind === "admin-edit" && Object.keys(r.patch).length === 0) return setSheet(null);
                    save.mutate(r);
                  }}
                />
              </div>
              <SheetFooter className="border-t border-border p-4">
                <Button variant="secondary" onClick={() => setSheet(null)}>
                  Cancel
                </Button>
                <Button type="submit" form="coupon-form" loading={save.isPending}>
                  {sheet === "new" ? "Create coupon" : "Save"}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        destructive={pending ? ("delete" in pending ? true : pending.destructive) : false}
        title={pending ? ("delete" in pending ? "Delete coupon?" : pending.title) : ""}
        description={
          pending
            ? "delete" in pending
              ? `“${pending.coupon.title}” (${pending.coupon.code ?? "no code"}) and its usage stats are deleted permanently. Prefer “Mark expired” to keep history.`
              : pending.description
            : ""
        }
        confirmLabel={pending ? ("delete" in pending ? "Delete" : "Confirm") : "Confirm"}
        onConfirm={async () => {
          if (!pending) return;
          if ("delete" in pending) await remove.mutateAsync(pending.coupon.id);
          else await save.mutateAsync({ kind: "patch", id: pending.coupon.id, patch: pending.patch });
        }}
      />
    </div>
  );
}
