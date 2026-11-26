"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { AdminCoupon, MerchantCreateCouponRequest } from "@pricora/contracts";
import { Button, Pagination, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { COUPON_STATUS_LABEL, formatDiscount, isExpired } from "@/lib/coupons";
import { dateTime, pct, relative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CouponForm } from "@/components/coupon-form";

const STATUS_HELP: Partial<Record<AdminCoupon["status"], string>> = {
  pending_approval: "Waiting for review by our team",
  rejected: "Not approved — contact support for details",
  reported: "Shoppers reported it not working; under review",
};

export default function MerchantCouponsPage() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["merchant", "coupons", page],
    queryFn: ({ signal }) => getApi().request("merchant.coupons.list", { query: { page, pageSize: 25 }, signal }),
    placeholderData: keepPreviousData,
  });
  const create = useApiMutation((body: Parameters<typeof submitCoupon>[0]) => submitCoupon(body), {
    success: "Coupon submitted — pending approval",
    invalidate: [["merchant", "coupons"]],
    onSuccess: () => setOpen(false),
  });

  const columns: Column<AdminCoupon>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => (c.code ? <code className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{c.code}</code> : <span className="text-xs text-text-muted">No code (deal)</span>),
    },
    { key: "title", header: "Title", cell: (c) => <span className="line-clamp-2 max-w-xs font-medium">{c.title}</span> },
    { key: "discount", header: "Discount", cell: (c) => <span className="price whitespace-nowrap text-sm">{formatDiscount(c)}</span> },
    {
      key: "expires",
      header: "Expires",
      cell: (c) =>
        c.expiresAt ? (
          <span title={dateTime(c.expiresAt)} className={isExpired(c) ? "text-error" : undefined}>
            {relative(c.expiresAt)}
          </span>
        ) : (
          <span className="text-text-muted">No expiry</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <div className="flex flex-col gap-0.5">
          <StatusBadge value={c.status} className="w-fit whitespace-nowrap" />
          {STATUS_HELP[c.status] ? <span className="text-2xs text-text-muted">{STATUS_HELP[c.status]}</span> : null}
        </div>
      ),
    },
    {
      key: "votes",
      header: "Worked / failed",
      numeric: true,
      cell: (c) => (
        <span className="price whitespace-nowrap">
          <span className="text-success">{c.stats.successCount}</span> / <span className={c.stats.failCount ? "text-error" : undefined}>{c.stats.failCount}</span>
          {c.stats.successRate != null ? <span className="text-text-muted"> · {pct(c.stats.successRate, 0)}</span> : null}
        </span>
      ),
    },
    { key: "created", header: "Submitted", cell: (c) => <span title={dateTime(c.createdAt)}>{relative(c.createdAt)}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Coupons"
        description="Submit coupons for your store. New coupons are reviewed by our team before they appear on the site and in the browser extension."
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden /> Submit coupon
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(c) => c.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyTitle="No coupons yet"
        emptyDescription="Submit your first coupon to reach shoppers comparing prices."
        caption="Your coupons"
      />
      {q.data && q.data.totalPages > 1 ? <Pagination page={page} pageCount={q.data.totalPages} onPageChange={setPage} /> : null}
      <p className="text-xs text-text-muted">Status legend: {Object.values(COUPON_STATUS_LABEL).join(" · ")}. Worked/failed counts come from real shopper reports only.</p>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border p-5">
            <SheetTitle>Submit a coupon</SheetTitle>
            <SheetDescription>For your own store only. It goes live after approval.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            {open ? <CouponForm id="merchant-coupon-form" mode="merchant" onSubmit={(r) => r.kind === "merchant" && create.mutate(r.body)} /> : null}
          </div>
          <SheetFooter className="border-t border-border p-4">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="merchant-coupon-form" loading={create.isPending}>
              Submit for approval
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function submitCoupon(body: MerchantCreateCouponRequest) {
  return getApi().request("merchant.coupons.create", { body });
}
