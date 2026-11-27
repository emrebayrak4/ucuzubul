"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Info } from "lucide-react";
import type { MerchantInventoryUpsertRequest, MerchantLocationInventoryResponse } from "@pricora/contracts";
import { Button, EmptyState, ErrorState, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { money, relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

type Item = MerchantLocationInventoryResponse["items"][number];
type Stock = NonNullable<Item["stock"]>;
type Draft = { stock: Stock; price: string; pickupToday: boolean };

const STOCK_LABEL: Record<Stock, string> = { in_stock: "In stock", low_stock: "Limited", out_of_stock: "Out of stock", unknown: "Unknown" };

/** Per-store stock for every product in the merchant's catalog → what shoppers see under "Available nearby". */
export default function LocationStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({ queryKey: ["merchant", "locations", id, "inventory"], queryFn: ({ signal }) => getApi().merchant.locations.inventoryGet(id, { signal }) });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [filter, setFilter] = useState("");

  const save = useApiMutation((body: MerchantInventoryUpsertRequest) => getApi().merchant.locations.inventory(id, body), {
    success: (r) => `Saved ${r.updated} item${r.updated === 1 ? "" : "s"}${r.skipped.length ? ` (${r.skipped.length} skipped)` : ""}`,
    invalidate: [["merchant", "locations"]],
    onSuccess: () => setDrafts({}),
  });

  const items = useMemo(() => (q.data?.items ?? []).filter((i) => i.title.toLowerCase().includes(filter.trim().toLowerCase())), [q.data, filter]);
  const draftOf = (i: Item): Draft => drafts[i.offerId] ?? { stock: i.stock ?? "unknown", price: i.storePriceCents !== null ? (i.storePriceCents / 100).toFixed(2) : "", pickupToday: i.pickupToday };
  const setDraft = (i: Item, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [i.offerId]: { ...draftOf(i), ...patch } }));
  const dirty = Object.keys(drafts);

  const submit = () => {
    const body: MerchantInventoryUpsertRequest = {
      items: dirty.slice(0, 500).map((offerId) => {
        const d = drafts[offerId] as Draft;
        const cents = Math.round(Number(d.price) * 100);
        return { offerId, stock: d.stock, pickupToday: d.pickupToday, ...(d.price && Number.isFinite(cents) && cents > 0 ? { priceCents: cents } : {}) };
      }),
    };
    if (body.items.length) save.mutate(body);
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/merchant/locations" className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Store locations
      </Link>
      <PageHeader
        title={q.data ? `Stock at ${q.data.location.name}` : "Store stock"}
        description="Set what's on the shelf at this store. Shoppers within your area see the store price, stock and “Pickup today” under “Available nearby” once your store is approved."
        actions={
          <Button onClick={submit} disabled={!dirty.length} loading={save.isPending} data-testid="stock-save">
            Save {dirty.length ? `(${dirty.length})` : ""}
          </Button>
        }
      />
      {q.data ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <StatusBadge value={q.data.location.verificationStatus} />
          {q.data.pendingMatches ? (
            <span className="inline-flex items-center gap-1">
              <Info className="size-3.5" aria-hidden /> {q.data.pendingMatches} uploaded {q.data.pendingMatches === 1 ? "item is" : "items are"} waiting to be matched to our catalog (add UPC/GTIN to match automatically).
            </span>
          ) : null}
        </div>
      ) : null}

      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !q.data?.items.length ? (
        <EmptyState
          title="No products yet"
          description="Upload a CSV/XML feed under Feeds or connect your store platform under Connections. Matched products appear here."
          action={
            <Link href="/merchant/connections" className="text-sm font-medium text-primary underline underline-offset-2">
              Connect a store platform
            </Link>
          }
          className="rounded-md border border-border bg-surface"
        />
      ) : (
        <div className="rounded-md border border-border bg-surface">
          <div className="border-b border-border p-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter products"
              aria-label="Filter products"
              className="h-9 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Store price ($)</th>
                  <th className="px-3 py-2 font-medium">Pickup today</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i) => {
                  const d = draftOf(i);
                  return (
                    <tr key={i.offerId} className={drafts[i.offerId] ? "bg-primary-soft/40" : undefined}>
                      <td className="px-3 py-2">
                        <span className="block text-text">{i.title}</span>
                        <span className="text-xs text-text-muted">
                          {i.sizeLabel ? `${i.sizeLabel} · ` : ""}catalog price {money(i.onlinePriceCents)}
                          {i.offerActive ? "" : " · not live yet"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={d.stock}
                          onChange={(e) => setDraft(i, { stock: e.target.value as Stock })}
                          aria-label={`Stock for ${i.title}`}
                          className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
                        >
                          {(Object.keys(STOCK_LABEL) as Stock[]).map((s) => (
                            <option key={s} value={s}>
                              {STOCK_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {i.stock === null && !drafts[i.offerId] ? <span className="ml-2 text-xs text-text-muted">not set</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={d.price}
                          onChange={(e) => setDraft(i, { price: e.target.value.replace(/[^0-9.]/g, "") })}
                          placeholder={(i.onlinePriceCents / 100).toFixed(2)}
                          aria-label={`Store price for ${i.title}`}
                          className="h-8 w-24 rounded-md border border-border bg-surface px-2 text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={d.pickupToday} onChange={(e) => setDraft(i, { pickupToday: e.target.checked })} aria-label={`Pickup today for ${i.title}`} />
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted">{i.lastCheckedAt ? relative(i.lastCheckedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
