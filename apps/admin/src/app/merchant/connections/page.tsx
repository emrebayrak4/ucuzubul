"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info, KeyRound, MapPin, RefreshCw } from "lucide-react";
import type { CommerceConnectionDto, CommerceProviderId, CommerceProviderInfo, CommerceSyncResponse, UpsertCommerceConnectionRequest } from "@pricora/contracts";
import { Badge, Button, ErrorState, Input, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { count, dateTime, relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/field";

const KEYS = [["merchant", "connections"], ["merchant", "local", "status"]];

export default function MerchantConnectionsPage() {
  const q = useQuery({ queryKey: ["merchant", "connections"], queryFn: ({ signal }) => getApi().merchant.connections.list({ signal }) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Store connections"
        description="Connect your store platform to keep products, prices and per-store stock in sync automatically. Credentials are encrypted and never shown again after saving."
      />
      <p className="flex items-start gap-2 text-sm text-text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Prefer files? CSV/XML uploads remain available under{" "}
          <Link href="/merchant/feeds" className="text-primary underline-offset-4 hover:underline">
            Feed upload
          </Link>
          .
        </span>
      </p>
      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : q.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data.providers.map((p) => {
            const conn = q.data.items.find((c) => c.provider === p.id) ?? null;
            return <ProviderCard key={`${p.id}-${conn?.id ?? "none"}`} provider={p} connection={conn} />;
          })}
        </div>
      ) : null}
    </div>
  );
}

function ProviderCard({ provider, connection }: { provider: CommerceProviderInfo; connection: CommerceConnectionDto | null }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of provider.fields) v[f.key] = f.secret ? "" : (connection?.config[f.key] ?? "");
    return v;
  });
  const [sync, setSync] = useState<CommerceSyncResponse | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = useApiMutation((body: UpsertCommerceConnectionRequest) => getApi().merchant.connections.upsert(body), {
    success: (c) => `${provider.name} saved — ${c.status === "live" ? "connected" : c.status.replace(/_/g, " ")}`,
    invalidate: KEYS,
    // Never keep secrets in memory after they were sent.
    onSuccess: () => setValues((v) => Object.fromEntries(Object.entries(v).map(([k, val]) => [k, provider.fields.find((f) => f.key === k)?.secret ? "" : val]))),
  });
  const runSync = useApiMutation((id: CommerceProviderId) => getApi().merchant.connections.sync(id), {
    onSuccess: (r) => setSync(r),
    invalidate: KEYS,
  });
  const remove = useApiMutation((id: CommerceProviderId) => getApi().merchant.connections.remove(id), { success: `${provider.name} disconnected`, invalidate: KEYS });

  function submit(e: FormEvent) {
    e.preventDefault();
    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const f of provider.fields) {
      const v = (values[f.key] ?? "").trim();
      if (f.secret) {
        if (v) secrets[f.key] = v; // empty = keep the stored secret
      } else config[f.key] = v;
    }
    save.mutate({ provider: provider.id, config, secrets: Object.keys(secrets).length ? secrets : undefined });
  }

  const stored = new Set(connection?.storedSecrets ?? []);

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5" aria-labelledby={`p-${provider.id}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id={`p-${provider.id}`} className="text-md font-semibold">
            {provider.name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
            {provider.supportsLocations ? (
              <Badge variant="info" size="sm">
                <MapPin aria-hidden /> Syncs store locations
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Products only
              </Badge>
            )}
            {provider.docsUrl ? (
              <a href={provider.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary hover:underline">
                Setup guide <ExternalLink className="size-3" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
        {connection ? <StatusBadge value={connection.status} /> : <Badge size="sm">Not connected</Badge>}
      </div>

      {provider.platformStatus === "pending_configuration" ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
          Pending configuration: WhichLess has not finished setting up this platform yet. You can save your details now; syncing starts once it is configured.
        </p>
      ) : null}
      {provider.note ? <p className="text-xs text-text-muted">{provider.note}</p> : null}

      {connection ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-text-muted">Last sync</dt>
            <dd title={dateTime(connection.lastSyncAt)}>{connection.lastSyncAt ? relative(connection.lastSyncAt) : "Never"}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Items synced</dt>
            <dd className="price">{count(connection.itemsSynced)}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Next sync</dt>
            <dd>{connection.nextSyncAt ? relative(connection.nextSyncAt) : "—"}</dd>
          </div>
        </dl>
      ) : null}
      {connection?.lastError ? (
        <p role="alert" className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-xs break-words text-error">
          Last error: {connection.lastError}
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        {provider.fields.map((f) => {
          const fid = `${provider.id}-${f.key}`;
          return (
            <Field
              key={f.key}
              id={fid}
              label={f.label}
              hint={f.secret ? (stored.has(f.key) ? "Stored. Leave empty to keep the current value." : "Encrypted after saving; never shown again.") : undefined}
            >
              <div className="relative">
                <Input
                  id={fid}
                  type={f.secret ? "password" : "text"}
                  autoComplete={f.secret ? "new-password" : "off"}
                  placeholder={f.secret && stored.has(f.key) ? "•••••••• (stored)" : (f.placeholder ?? undefined)}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  aria-describedby={f.secret ? `${fid}-hint` : undefined}
                  className={f.secret ? "pr-20 font-mono" : undefined}
                />
                {f.secret && stored.has(f.key) ? (
                  <span className="absolute top-1/2 right-2 inline-flex -translate-y-1/2 items-center gap-1 text-2xs text-success">
                    <KeyRound className="size-3" aria-hidden /> stored
                  </span>
                ) : null}
              </div>
            </Field>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={save.isPending}>
            {connection ? "Save" : "Connect"}
          </Button>
          {connection ? (
            <>
              <Button type="button" size="sm" variant="secondary" loading={runSync.isPending} onClick={() => runSync.mutate(provider.id)}>
                <RefreshCw aria-hidden /> Sync now
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-error" onClick={() => setConfirmRemove(true)}>
                Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </form>

      {sync ? (
        <div
          role="status"
          className={
            "rounded-md border px-3 py-2 text-xs " +
            (sync.status === "ok"
              ? "border-success/30 bg-success-soft text-success"
              : sync.status === "error"
                ? "border-error/30 bg-error-soft text-error"
                : "border-border bg-surface-2 text-text")
          }
        >
          <span className="font-medium">Sync {sync.status.replace(/_/g, " ")}</span>
          {sync.status === "ok" || sync.status === "queued" ? ` · ${count(sync.products)} products, ${count(sync.locations)} locations` : null}
          {sync.message ? <span className="block">{sync.message}</span> : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Disconnect ${provider.name}?`}
        description="Stored credentials are deleted and automatic syncing stops. Products already imported stay until you remove them or they expire."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => remove.mutateAsync(provider.id)}
      />
    </section>
  );
}
