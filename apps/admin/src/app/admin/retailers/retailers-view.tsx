"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AdminUpdateRetailerRequest, type AdminRetailer, type EndpointBody } from "@pricora/contracts";
import { parseMoneyToCents } from "@pricora/utils";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Separator, StoreLogo, Switch } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { count, dateTime, money, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field, issuesToFieldErrors } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LogoUploader } from "@/components/logo-uploader";
import { useSession } from "@/components/session-context";

const RETAILER_KEYS = [["admin", "retailers"], ["catalog", "retailers"]] as const;

export function RetailersView() {
  const { isAdmin, canEdit } = useSession();
  const list = useListState({ sort: "name", order: "asc" });
  const [editingId, setEditingId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "retailers", list.query],
    queryFn: ({ signal }) => getApi().admin.retailers.list(list.query, { signal }),
    placeholderData: keepPreviousData,
  });
  const editing = q.data?.items.find((r) => r.id === editingId) ?? null;

  const columns: Column<AdminRetailer>[] = [
    {
      key: "name",
      header: "Retailer",
      sortKey: "name",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <StoreLogo name={r.name} brandColor={r.brandColor} logoUrl={r.logoUrl} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name}</div>
            <div className="truncate text-xs text-text-muted">{r.domain}</div>
          </div>
        </div>
      ),
    },
    { key: "integration", header: "Integration", sortKey: "integrationStatus", cell: (r) => <StatusBadge value={r.integrationStatus} /> },
    { key: "active", header: "Listed", cell: (r) => (r.isActive ? <StatusBadge value="active" /> : <StatusBadge value="disabled" />) },
    { key: "offers", header: "Offers", sortKey: "offerCount", numeric: true, cell: (r) => count(r.offerCount) },
    { key: "ingest", header: "Last ingest", sortKey: "lastIngestAt", cell: (r) => <span title={dateTime(r.lastIngestAt)}>{r.lastIngestAt ? relative(r.lastIngestAt) : "Never"}</span> },
    {
      key: "errors",
      header: "Errors 24h",
      numeric: true,
      cell: (r) => <span className={r.errorCount24h > 0 ? "font-medium text-error" : "text-text-muted"}>{count(r.errorCount24h)}</span>,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (r) =>
        canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setEditingId(r.id)}>
            {isAdmin ? "Edit" : "Logo"}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Retailers"
        description="Integration status per retailer. “Not connected” = adapter has no credentials (pending_configuration); no results are faked for those. Credentials live under Settings → Integrations."
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(r) => r.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search name or domain"
        caption="Retailers"
      />
      {editing ? <RetailerDialog key={editing.id} retailer={editing} isAdmin={isAdmin} canEdit={canEdit} onClose={() => setEditingId(null)} /> : null}
    </div>
  );
}

function RetailerDialog({ retailer, isAdmin, canEdit, onClose }: { retailer: AdminRetailer; isAdmin: boolean; canEdit: boolean; onClose: () => void }) {
  const [name, setName] = useState(retailer.name);
  const [isActive, setIsActive] = useState(retailer.isActive);
  const [brandColor, setBrandColor] = useState(retailer.brandColor ?? "");
  const [threshold, setThreshold] = useState(retailer.freeShippingThresholdCents != null ? (retailer.freeShippingThresholdCents / 100).toFixed(2) : "");
  const [hosts, setHosts] = useState(retailer.allowedRedirectHosts.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<EndpointBody<"admin.retailers.update"> | null>(null);

  const save = useApiMutation((body: EndpointBody<"admin.retailers.update">) => getApi().admin.retailers.update(retailer.id, body), {
    success: "Retailer updated",
    invalidate: RETAILER_KEYS.map((k) => [...k]),
    onSuccess: onClose,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const patch: EndpointBody<"admin.retailers.update"> = {};
    if (name.trim() !== retailer.name) patch.name = name.trim();
    if (isActive !== retailer.isActive) patch.isActive = isActive;
    const color = brandColor.trim() || null;
    if (color !== retailer.brandColor) patch.brandColor = color;
    const thresholdCents = threshold.trim() === "" ? null : parseMoneyToCents(threshold);
    if (threshold.trim() !== "" && thresholdCents === null) {
      setErrors({ freeShippingThresholdCents: "Enter an amount like 35.00" });
      return;
    }
    if (thresholdCents !== retailer.freeShippingThresholdCents) patch.freeShippingThresholdCents = thresholdCents;
    const hostList = hosts.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (hostList.join(",") !== retailer.allowedRedirectHosts.join(",")) patch.allowedRedirectHosts = hostList;

    const parsed = AdminUpdateRetailerRequest.safeParse(patch);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (Object.keys(patch).length === 0) return onClose();
    // Disabling a retailer or changing the redirect allow-list affects live outbound traffic → confirm.
    if (patch.isActive === false || patch.allowedRedirectHosts) setConfirm(patch);
    else save.mutate(patch);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isAdmin ? `Edit ${retailer.name}` : `${retailer.name} logo`}</DialogTitle>
        </DialogHeader>
        <LogoUploader
          entity="retailer"
          id={retailer.id}
          name={retailer.name}
          logoUrl={retailer.logoUrl}
          logoSource={retailer.logoSource}
          logoUpdatedAt={retailer.logoUpdatedAt}
          canEdit={canEdit}
          invalidate={RETAILER_KEYS}
        />
        {isAdmin ? (
          <>
            <Separator />
            <form id="retailer-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field id="r-name" label="Display name" error={errors.name}>
                <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field id="r-color" label="Brand color" hint="#RRGGBB, used for the monogram tile" error={errors.brandColor}>
                <Input id="r-color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="font-mono" placeholder="#0071CE" />
              </Field>
              <Field
                id="r-threshold"
                label="Free-shipping threshold (USD)"
                hint={retailer.freeShippingThresholdCents != null ? `Current ${money(retailer.freeShippingThresholdCents)}` : "Empty = none published"}
                error={errors.freeShippingThresholdCents}
              >
                <Input id="r-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3">
                <label htmlFor="r-active" className="text-sm">
                  Listed on site
                </label>
                <Switch id="r-active" checked={isActive} onCheckedChange={setIsActive} />
              </div>
              <div className="sm:col-span-2">
                <Field id="r-hosts" label="Outbound redirect allow-list" hint="Comma or space separated hosts. /go redirects only to these." error={errors.allowedRedirectHosts}>
                  <Input id="r-hosts" value={hosts} onChange={(e) => setHosts(e.target.value)} className="font-mono" />
                </Field>
              </div>
            </form>
          </>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {isAdmin ? "Cancel" : "Close"}
          </Button>
          {isAdmin ? (
            <Button type="submit" form="retailer-form" loading={save.isPending}>
              Save
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm?.isActive === false}
        title="Apply high-impact change?"
        description={
          <ul className="list-disc space-y-1 pl-4">
            {confirm?.isActive === false ? <li>{retailer.name} and its offers will be hidden from the site and outbound links stop.</li> : null}
            {confirm?.allowedRedirectHosts ? <li>The outbound allow-list becomes: {confirm.allowedRedirectHosts.join(", ") || "(empty — all redirects blocked)"}</li> : null}
          </ul>
        }
        confirmLabel="Apply"
        onConfirm={async () => {
          if (confirm) await save.mutateAsync(confirm);
        }}
      />
    </Dialog>
  );
}
