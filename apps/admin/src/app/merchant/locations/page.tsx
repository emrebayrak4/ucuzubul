"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info, MapPin, Plus } from "lucide-react";
import type { MerchantLocation, StoreLocationInput, UpdateStoreLocationRequest } from "@pricora/contracts";
import {
  Button,
  DemoDataBadge,
  EmptyState,
  ErrorState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
} from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { count, money } from "@/lib/format";
import { GEO_PRECISION_LABEL, ZIP_GEO_NOTE, formatHours } from "@/lib/local";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StoreLocationFields, draftFromLocation, emptyLocationDraft, parseLocationDraft, type LocationDraft } from "@/components/store-location-fields";

const KEYS = [["merchant", "locations"], ["merchant", "local", "status"]];

export default function MerchantLocationsPage() {
  const q = useQuery({ queryKey: ["merchant", "locations"], queryFn: ({ signal }) => getApi().merchant.locations.list({ signal }) });
  const [sheet, setSheet] = useState<MerchantLocation | "new" | null>(null);
  const [toDelete, setToDelete] = useState<MerchantLocation | null>(null);

  const toggle = useApiMutation((v: { id: string; isActive: boolean }) => getApi().merchant.locations.update(v.id, { isActive: v.isActive }), {
    success: (l) => (l.isActive ? `${l.name} is active` : `${l.name} is paused`),
    invalidate: KEYS,
  });
  const remove = useApiMutation((id: string) => getApi().merchant.locations.remove(id), { success: "Location removed", invalidate: KEYS });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Store locations"
        description="Physical stores where shoppers can buy or pick up your products. New and edited locations are reviewed before they show as verified."
        actions={
          <Button onClick={() => setSheet("new")}>
            <Plus aria-hidden /> Add location
          </Button>
        }
      />
      <p className="flex items-start gap-2 text-xs text-text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {ZIP_GEO_NOTE}
      </p>

      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      ) : q.data && q.data.items.length === 0 ? (
        <EmptyState
          icon={<MapPin aria-hidden />}
          title="No store locations yet"
          description="Add your first store so nearby shoppers can find your in-store prices and pickup options."
          action={<Button onClick={() => setSheet("new")}>Add location</Button>}
          className="rounded-md border border-border bg-surface"
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {q.data?.items.map((l) => (
            <li key={l.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="truncate font-medium">{l.name}</h2>
                    <StatusBadge value={l.verificationStatus} />
                    {l.source === "demo" ? <DemoDataBadge size="sm" /> : null}
                  </div>
                  <p className="text-sm text-text-muted">
                    {[l.address1, l.city, l.state].filter(Boolean).join(", ")} {l.zip}
                  </p>
                  {l.geoPrecision === "zip_centroid" ? (
                    <p className="mt-0.5 text-xs text-warning">Approx. location (ZIP centroid)</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-text-muted">{GEO_PRECISION_LABEL[l.geoPrecision]}</p>
                  )}
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-text-muted">
                  <Switch
                    checked={l.isActive}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) => toggle.mutate({ id: l.id, isActive: v })}
                    aria-label={`${l.name} active`}
                  />
                  {l.isActive ? "Active" : "Paused"}
                </label>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-text-muted">Inventory</dt>
                  <dd className="price">
                    {count(l.inventoryCount)} items ·{" "}
                    <Link href={`/merchant/locations/${l.id}/stock`} className="font-sans text-primary underline underline-offset-2" data-testid="manage-stock">
                      Manage stock
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Pickup</dt>
                  <dd>{l.pickup ? (l.pickupMinimumCents ? `Yes, min ${money(l.pickupMinimumCents)}` : "Yes") : "No"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Delivery</dt>
                  <dd>
                    {l.deliveryRadiusMiles ? `${l.deliveryRadiusMiles} mi${l.deliveryMinimumCents ? `, min ${money(l.deliveryMinimumCents)}` : ""}` : "No"}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-text-muted">{formatHours(l.hours)}</p>
              <div className="mt-auto flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSheet(l)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-error" onClick={() => setToDelete(l)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <LocationSheet key={sheet === null ? "closed" : sheet === "new" ? "new" : sheet.id} target={sheet} onClose={() => setSheet(null)} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this location?"
        description={
          toDelete ? (
            <>
              <strong className="text-text">{toDelete.name}</strong> and its per-store stock ({count(toDelete.inventoryCount)} items) are removed. Shoppers will no longer see this store.
            </>
          ) : null
        }
        confirmLabel="Delete location"
        destructive
        onConfirm={() => (toDelete ? remove.mutateAsync(toDelete.id) : undefined)}
      />
    </div>
  );
}

function LocationSheet({ target, onClose }: { target: MerchantLocation | "new" | null; onClose: () => void }) {
  const editing = target !== null && target !== "new" ? target : null;
  const [draft, setDraft] = useState<LocationDraft>(() => (editing ? draftFromLocation(editing) : emptyLocationDraft()));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useApiMutation(
    (body: StoreLocationInput) => {
      if (editing) {
        const patch: UpdateStoreLocationRequest = body;
        return getApi().merchant.locations.update(editing.id, patch);
      }
      return getApi().merchant.locations.create(body);
    },
    { success: (l) => (editing ? `${l.name} saved` : `${l.name} added — pending review`), invalidate: KEYS, onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const r = parseLocationDraft(draft);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    save.mutate(r.data);
  }

  return (
    <Sheet open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border px-5 py-4">
            <SheetTitle>{editing ? `Edit ${editing.name}` : "Add store location"}</SheetTitle>
            <SheetDescription>{ZIP_GEO_NOTE}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <StoreLocationFields idPrefix="loc" draft={draft} onChange={setDraft} errors={errors} />
          </div>
          <SheetFooter className="border-t border-border px-5 py-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {editing ? "Save changes" : "Add location"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
