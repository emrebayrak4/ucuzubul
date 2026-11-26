"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { StockStatus, UpdateMerchantOfferRequest, type MerchantOffer } from "@pricora/contracts";
import { parseMoneyToCents } from "@pricora/utils";
import { Button, DemoDataBadge, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, PriceTag, Select, Switch } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, humanize, money, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";

export default function MerchantOffersPage() {
  const list = useListState();
  const [editing, setEditing] = useState<MerchantOffer | null>(null);
  const query = { page: list.state.page, pageSize: list.state.pageSize, q: list.state.q || undefined };
  const q = useQuery({
    queryKey: ["merchant", "offers", query],
    queryFn: ({ signal }) => getApi().merchant.offers.list(query, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<MerchantOffer>[] = [
    {
      key: "title",
      header: "Offer",
      cell: (o) => (
        <div className="min-w-0 max-w-sm">
          <div className="truncate font-medium">{o.title}</div>
          <div className="truncate font-mono text-xs text-text-muted">{o.sku ?? "no SKU"}</div>
        </div>
      ),
    },
    { key: "match", header: "Catalog match", cell: (o) => <StatusBadge value={o.matchStatus} /> },
    {
      key: "price",
      header: "Price",
      numeric: true,
      cell: (o) => (
        <span className="inline-flex items-center gap-2">
          {o.source === "demo" ? <DemoDataBadge size="sm" /> : null}
          <PriceTag cents={o.priceCents} size="sm" />
        </span>
      ),
    },
    { key: "shipping", header: "Shipping", numeric: true, cell: (o) => (o.shippingCents === null ? <span className="text-xs text-text-muted">Unknown</span> : o.shippingCents === 0 ? "Free" : money(o.shippingCents)) },
    { key: "stock", header: "Stock", cell: (o) => <StatusBadge value={o.stock} /> },
    { key: "condition", header: "Condition", cell: (o) => humanize(o.condition) },
    { key: "active", header: "Listed", cell: (o) => (o.isActive ? <StatusBadge value="active" /> : <StatusBadge value="disabled" />) },
    { key: "updated", header: "Updated", cell: (o) => <span title={dateTime(o.updatedAt)}>{relative(o.updatedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (o) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Offers" description="Your listings. Edit price, shipping and stock here; bulk changes go through a feed upload." />
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
        searchPlaceholder="Search title or SKU"
        emptyTitle="No offers yet"
        emptyDescription="Upload a feed to create offers."
        caption="Your offers"
      />
      {editing ? <OfferDialog offer={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function OfferDialog({ offer, onClose }: { offer: MerchantOffer; onClose: () => void }) {
  const [price, setPrice] = useState((offer.priceCents / 100).toFixed(2));
  const [shipping, setShipping] = useState(offer.shippingCents === null ? "" : (offer.shippingCents / 100).toFixed(2));
  const [stock, setStock] = useState(offer.stock);
  const [isActive, setIsActive] = useState(offer.isActive);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<UpdateMerchantOfferRequest | null>(null);

  const save = useApiMutation((body: UpdateMerchantOfferRequest) => getApi().merchant.offers.update(offer.id, body), {
    success: "Offer updated",
    invalidate: [["merchant", "offers"]],
    onSuccess: onClose,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const priceCents = parseMoneyToCents(price);
    if (priceCents === null || priceCents <= 0) errs.price = "Enter a price greater than 0, e.g. 19.99";
    const shippingCents = shipping.trim() === "" ? null : parseMoneyToCents(shipping);
    if (shipping.trim() !== "" && (shippingCents === null || shippingCents < 0)) errs.shipping = "Enter 0 for free shipping or leave empty if unknown";
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});

    const patch: UpdateMerchantOfferRequest = {};
    if (priceCents !== offer.priceCents && priceCents !== null) patch.priceCents = priceCents;
    if (shippingCents !== offer.shippingCents) patch.shippingCents = shippingCents;
    if (stock !== offer.stock) patch.stock = stock;
    if (isActive !== offer.isActive) patch.isActive = isActive;
    const parsed = UpdateMerchantOfferRequest.safeParse(patch);
    if (!parsed.success) return setErrors({ price: parsed.error.issues[0]?.message ?? "Invalid" });
    if (Object.keys(patch).length === 0) return onClose();
    // Large price moves (>50%) and delisting are double-checked.
    const bigMove = patch.priceCents !== undefined && Math.abs(patch.priceCents - offer.priceCents) / offer.priceCents > 0.5;
    if (bigMove || patch.isActive === false) setConfirm(patch);
    else save.mutate(patch);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="line-clamp-2">{offer.title}</DialogTitle>
        </DialogHeader>
        <form id="offer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="o-price" label="Price (USD)" required error={errors.price}>
            <Input id="o-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" invalid={!!errors.price} />
          </Field>
          <Field id="o-ship" label="Shipping (USD)" hint="Empty = unknown, 0 = free" error={errors.shipping}>
            <Input id="o-ship" value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="decimal" invalid={!!errors.shipping} />
          </Field>
          <Field id="o-stock" label="Stock">
            <Select id="o-stock" value={stock} onChange={(e) => setStock(e.target.value as MerchantOffer["stock"])}>
              {StockStatus.options.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-3 self-end rounded-md border border-border px-3 py-2.5">
            <label htmlFor="o-active" className="text-sm">
              Listed
            </label>
            <Switch id="o-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="offer-form" loading={save.isPending}>
            Save
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(o) => !o && setConfirm(null)}
          destructive={confirm?.isActive === false}
          title="Confirm change"
          confirmLabel="Apply"
          description={
            <ul className="list-disc space-y-1 pl-4">
              {confirm?.priceCents !== undefined ? (
                <li>
                  Price changes from {money(offer.priceCents)} to {money(confirm.priceCents)}.
                </li>
              ) : null}
              {confirm?.isActive === false ? <li>The offer will be removed from the site until you list it again.</li> : null}
            </ul>
          }
          onConfirm={async () => {
            if (confirm) await save.mutateAsync(confirm);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
