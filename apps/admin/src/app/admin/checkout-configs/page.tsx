"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminUpsertCheckoutConfigRequest, type AdminCheckoutConfig, type RetailerSummary } from "@pricora/contracts";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  SearchInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  StoreLogo,
  Switch,
} from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, relative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-context";

const CONFIG_KEY = ["admin", "checkout-configs"];
const KEYS = [CONFIG_KEY];
const SELECTORS = [
  { key: "couponInputSelector", label: "Coupon input", core: true },
  { key: "applyButtonSelector", label: "Apply button", core: true },
  { key: "totalSelector", label: "Order total", core: true },
  { key: "successIndicatorSelector", label: "Success indicator", core: false },
  { key: "errorIndicatorSelector", label: "Error indicator", core: false },
  { key: "removeButtonSelector", label: "Remove code button", core: false },
] as const;
type SelectorKey = (typeof SELECTORS)[number]["key"];

interface Row {
  retailer: RetailerSummary;
  config: AdminCheckoutConfig | null;
}

function coreReady(c: Pick<AdminCheckoutConfig, SelectorKey> | null): boolean {
  return !!c && SELECTORS.filter((s) => s.core).every((s) => !!c[s.key]?.trim());
}

export default function CheckoutConfigsPage() {
  const { isAdmin, canEdit } = useSession();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Row | null>(null);
  const [disabling, setDisabling] = useState<Row | null>(null);

  const configs = useQuery({ queryKey: CONFIG_KEY, queryFn: ({ signal }) => getApi().request("admin.checkoutConfigs.list", { signal }), enabled: isAdmin });
  const retailers = useQuery({ queryKey: ["catalog", "retailers"], queryFn: ({ signal }) => getApi().catalog.retailers({ signal }), staleTime: 60_000 });

  const rows = useMemo<Row[]>(() => {
    const byRetailer = new Map((configs.data?.items ?? []).map((c) => [c.retailerId, c]));
    const s = search.trim().toLowerCase();
    return (retailers.data?.items ?? [])
      .map((r) => ({ retailer: r, config: byRetailer.get(r.id) ?? null }))
      .filter((r) => !s || r.retailer.name.toLowerCase().includes(s) || r.retailer.domain.includes(s))
      .sort((a, b) => Number(!!b.config) - Number(!!a.config) || a.retailer.name.localeCompare(b.retailer.name));
  }, [configs.data, retailers.data, search]);

  const toggle = useApiMutation((v: { retailerId: string; enabled: boolean }) => getApi().request("admin.checkoutConfigs.upsert", { params: { id: v.retailerId }, body: { enabled: v.enabled } }), {
    success: (c) => `${c.retailerName}: checkout config ${c.enabled ? "enabled" : "disabled"} (v${c.version})`,
    invalidate: KEYS,
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Checkout configs" />
        <EmptyState title="Admins only" description="Browser-extension checkout configs require the ADMIN role." />
      </div>
    );
  }

  const columns: Column<Row>[] = [
    {
      key: "store",
      header: "Store",
      cell: ({ retailer: r }) => (
        <div className="flex items-center gap-2">
          <StoreLogo name={r.name} logoUrl={r.logoUrl} brandColor={r.brandColor} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{r.name}</div>
            <div className="truncate text-xs text-text-muted">{r.domain}</div>
          </div>
        </div>
      ),
    },
    {
      key: "hosts",
      header: "Host patterns",
      cell: ({ config: c }) => (c ? <span className="line-clamp-1 max-w-56 font-mono text-xs">{c.hostPatterns.join(", ") || "—"}</span> : <span className="text-xs text-text-muted">Not configured</span>),
    },
    {
      key: "selectors",
      header: "Core selectors",
      cell: ({ config: c }) =>
        c ? (
          coreReady(c) ? (
            <Badge variant="success" size="sm">3/3 set</Badge>
          ) : (
            <Badge variant="warning" size="sm">{SELECTORS.filter((s) => s.core && c[s.key]?.trim()).length}/3 set</Badge>
          )
        ) : (
          "—"
        ),
    },
    { key: "version", header: "Version", numeric: true, cell: ({ config: c }) => (c ? `v${c.version}` : "—") },
    { key: "updated", header: "Updated", cell: ({ config: c }) => (c ? <span title={dateTime(c.updatedAt)}>{relative(c.updatedAt)}</span> : "—") },
    {
      key: "enabled",
      header: "Enabled",
      cell: (row) => {
        const ready = coreReady(row.config);
        return (
          <Switch
            checked={!!row.config?.enabled}
            disabled={!canEdit || toggle.isPending || (!row.config?.enabled && !ready)}
            title={!ready && !row.config?.enabled ? "Set the coupon input, apply button and total selectors first" : undefined}
            aria-label={`${row.config?.enabled ? "Disable" : "Enable"} checkout config for ${row.retailer.name}`}
            onCheckedChange={(enabled) => (enabled ? toggle.mutate({ retailerId: row.retailer.id, enabled }) : setDisabling(row))}
          />
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setOpen(row)}>
          {row.config ? "Configure" : "Add config"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checkout configs"
        description="Per-store rules the browser extension uses to find the coupon field at checkout and try codes. Saving bumps the config version that extensions download."
      />
      <div className="flex items-center gap-2">
        <SearchInput size="sm" value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} placeholder="Search stores" aria-label="Search stores" containerClassName="w-full sm:w-64" />
        <span className="ml-auto text-xs text-text-muted">
          {configs.data ? `${configs.data.items.filter((c) => c.enabled).length} enabled · ${configs.data.items.length} configured` : ""}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={configs.data && retailers.data ? rows : undefined}
        rowKey={(r) => r.retailer.id}
        isLoading={configs.isLoading || retailers.isLoading}
        error={configs.error ?? retailers.error}
        onRetry={() => void configs.refetch()}
        emptyTitle="No stores match"
        caption="Checkout configs"
      />
      <p className="text-xs text-text-muted">
        A “tested on / by” note per config is not in the API yet (requested from A04). The extension cannot verify selectors against real checkouts — test manually before enabling.
      </p>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
          {open ? <ConfigEditor key={open.retailer.id} row={open} canEdit={canEdit} onDone={() => setOpen(null)} /> : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(o) => !o && setDisabling(null)}
        destructive
        title={`Disable checkout config for ${disabling?.retailer.name ?? ""}?`}
        description="Extensions stop auto-applying codes on this store after their next config refresh. The config itself is kept."
        confirmLabel="Disable"
        onConfirm={async () => {
          if (disabling) await toggle.mutateAsync({ retailerId: disabling.retailer.id, enabled: false });
        }}
      />
    </div>
  );
}

function ConfigEditor({ row, canEdit, onDone }: { row: Row; canEdit: boolean; onDone: () => void }) {
  const c = row.config;
  const [hosts, setHosts] = useState(c ? c.hostPatterns.join("\n") : `${row.retailer.domain}`);
  const [urls, setUrls] = useState(c ? c.checkoutUrlPatterns.join("\n") : "/checkout*\n/cart*");
  const [sel, setSel] = useState<Record<SelectorKey, string>>(() =>
    Object.fromEntries(SELECTORS.map((s) => [s.key, c?.[s.key] ?? ""])) as Record<SelectorKey, string>,
  );
  const [enabled, setEnabled] = useState(c?.enabled ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ready = SELECTORS.filter((s) => s.core).every((s) => sel[s.key].trim());
  const save = useApiMutation((body: AdminUpsertCheckoutConfigRequest) => getApi().request("admin.checkoutConfigs.upsert", { params: { id: row.retailer.id }, body }), {
    success: (r) => `${r.retailerName} saved (v${r.version})`,
    invalidate: KEYS,
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const lines = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    const body = {
      hostPatterns: lines(hosts).map((h) => h.toLowerCase()),
      checkoutUrlPatterns: lines(urls),
      ...Object.fromEntries(SELECTORS.map((s) => [s.key, sel[s.key].trim() || null])),
      enabled: enabled && ready,
    };
    const errs: Record<string, string> = {};
    for (const p of body.checkoutUrlPatterns) {
      if (p.startsWith("re:")) {
        try {
          new RegExp(p.slice(3), "i");
        } catch {
          errs.checkoutUrlPatterns = `Invalid regex: ${p}`;
        }
      }
    }
    if (enabled && !ready) errs.enabled = "Set the three core selectors before enabling.";
    const parsed = AdminUpsertCheckoutConfigRequest.safeParse(body);
    if (!parsed.success) Object.assign(errs, issuesToFieldErrors(parsed.error.issues));
    if (Object.keys(errs).length) return setErrors(errs);
    setErrors({});
    save.mutate(parsed.data as AdminUpsertCheckoutConfigRequest);
  }

  return (
    <>
      <SheetHeader className="border-b border-border p-5">
        <SheetTitle>{row.retailer.name} checkout config</SheetTitle>
        <SheetDescription>{c ? `Version ${c.version} · updated ${relative(c.updatedAt)}` : "No config yet — saving creates version 1."}</SheetDescription>
      </SheetHeader>
      <form id="checkout-config-form" onSubmit={submit} noValidate className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <Field id="cc-hosts" label="Host patterns" hint="One per line, e.g. target.com or *.target.com (max 20)" error={errors.hostPatterns}>
            <textarea id="cc-hosts" rows={3} value={hosts} onChange={(e) => setHosts(e.target.value)} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Field id="cc-urls" label="Checkout URL patterns" error={errors.checkoutUrlPatterns}>
              <textarea id="cc-urls" rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm" />
            </Field>
            <div className="rounded-md bg-surface-2 p-3 text-xs text-text-muted">
              <p className="mb-1 font-medium text-text">Pattern syntax (one per line)</p>
              <ul className="space-y-0.5">
                <li>
                  <code className="font-mono">/checkout*</code> — glob on path + query
                </li>
                <li>
                  <code className="font-mono">https://www.example.com/cart/*</code> — full-URL glob
                </li>
                <li>
                  <code className="font-mono">re:^/checkout/(payment|review)</code> — regular expression (case-insensitive)
                </li>
              </ul>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SELECTORS.map((s) => (
              <Field key={s.key} id={`cc-${s.key}`} label={s.label} required={s.core} hint={s.core ? "Required to enable" : "Optional"} error={errors[s.key]}>
                <Input
                  id={`cc-${s.key}`}
                  value={sel[s.key]}
                  onChange={(e) => setSel((v) => ({ ...v, [s.key]: e.target.value }))}
                  placeholder="CSS selector"
                  className="font-mono"
                  spellCheck={false}
                />
              </Field>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div>
              <label htmlFor="cc-enabled" className="text-sm font-medium">
                Enabled
              </label>
              <p className="text-xs text-text-muted">{ready ? "Extensions will use this config after their next refresh." : "Set coupon input, apply button and total first."}</p>
              {errors.enabled ? <p className="text-xs text-error">{errors.enabled}</p> : null}
            </div>
            <Switch id="cc-enabled" checked={enabled && ready} disabled={!ready} onCheckedChange={setEnabled} />
          </div>
        </fieldset>
      </form>
      <SheetFooter className="border-t border-border p-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        {canEdit ? (
          <Button type="submit" form="checkout-config-form" loading={save.isPending}>
            Save
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}
