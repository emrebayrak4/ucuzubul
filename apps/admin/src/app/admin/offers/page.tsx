"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DataSource, type AdminOffer } from "@pricora/contracts";
import { DemoDataBadge, PriceTag, Select } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { dateTime, humanize, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const STALE_MS = 24 * 60 * 60 * 1000;

export default function OffersPage() {
  const list = useListState({ sort: "lastCheckedAt" });
  const [retailer, setRetailer] = useState("");
  const [source, setSource] = useState("");

  const retailers = useQuery({ queryKey: ["catalog", "retailers"], queryFn: ({ signal }) => getApi().catalog.retailers({ signal }), staleTime: 60_000 });
  const query = { ...list.query, retailer: retailer || undefined, source: (source || undefined) as AdminOffer["source"] | undefined };
  const q = useQuery({
    queryKey: ["admin", "offers", query],
    queryFn: ({ signal }) => getApi().admin.offers.list(query, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminOffer>[] = [
    {
      key: "product",
      header: "Product",
      cell: (o) => (
        <div className="min-w-0 max-w-sm">
          <div className="truncate font-medium">{o.productTitle}</div>
          <div className="truncate font-mono text-xs text-text-muted">{o.productSlug}</div>
        </div>
      ),
    },
    { key: "retailer", header: "Retailer", sortKey: "retailer", cell: (o) => <span className="font-mono text-xs">{o.retailerSlug}</span> },
    {
      key: "price",
      header: "Price",
      sortKey: "priceCents",
      numeric: true,
      cell: (o) => (
        <span className="inline-flex items-center gap-2">
          {o.source === "demo" ? <DemoDataBadge size="sm" /> : null}
          <PriceTag cents={o.priceCents} size="sm" />
        </span>
      ),
    },
    {
      key: "shipping",
      header: "Shipping",
      numeric: true,
      cell: (o) => (o.shippingCents === null ? <span className="text-xs text-text-muted">Unknown</span> : o.shippingCents === 0 ? "Free" : <PriceTag cents={o.shippingCents} size="sm" />),
    },
    { key: "stock", header: "Stock", cell: (o) => <StatusBadge value={o.stock} /> },
    { key: "condition", header: "Condition", cell: (o) => humanize(o.condition) },
    { key: "source", header: "Source", sortKey: "source", cell: (o) => <span className="font-mono text-xs">{o.source}</span> },
    { key: "active", header: "Active", cell: (o) => (o.isActive ? <StatusBadge value="active" /> : <StatusBadge value="disabled" />) },
    {
      key: "checked",
      header: "Checked",
      sortKey: "lastCheckedAt",
      cell: (o) => {
        const stale = Date.now() - new Date(o.lastCheckedAt).getTime() > STALE_MS;
        return (
          <span title={dateTime(o.lastCheckedAt)} className={stale ? "text-warning" : undefined}>
            {relative(o.lastCheckedAt)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Offers"
        description="All retailer offers. Read-only: the admin API has no offer edit endpoint (merchants edit their own offers). Checked > 24h ago is highlighted."
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(o) => o.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search product"
        caption="Offers"
        toolbar={
          <>
            <Select size="sm" aria-label="Retailer" value={retailer} onChange={(e) => { setRetailer(e.target.value); list.setPage(1); }} containerClassName="w-44">
              <option value="">All retailers</option>
              {(retailers.data?.items ?? []).map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Select size="sm" aria-label="Source" value={source} onChange={(e) => { setSource(e.target.value); list.setPage(1); }} containerClassName="w-40">
              <option value="">All sources</option>
              {DataSource.options.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </>
        }
      />
    </div>
  );
}
