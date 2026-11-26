"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, TriangleAlert, XCircle } from "lucide-react";
import {
  Button,
  EmptyState,
  ErrorState,
  SearchInput,
  Select,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pricora/ui";
import { errorMessage } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { INTEGRATION_GROUPS, INTEGRATIONS_KEY, saveIntegration, testPassed, useIntegrations, type AdminIntegration } from "@/lib/integrations";
import { count, dateTime, relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-context";
import { IntegrationSheet } from "./integration-sheet";

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "live", label: "Live" },
  { value: "configured", label: "Configured (untested)" },
  { value: "pending_configuration", label: "Not connected" },
  { value: "error", label: "Error" },
  { value: "disabled", label: "Disabled" },
];

export function IntegrationsView() {
  const { isAdmin } = useSession();
  const q = useIntegrations(isAdmin);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<AdminIntegration | null>(null);

  const toggle = useApiMutation((v: { id: string; enabled: boolean }) => saveIntegration(v.id, { fields: {}, enabled: v.enabled }), {
    success: (i) => `${i.name} ${i.enabled ? "enabled" : "disabled"}`,
    invalidate: [INTEGRATIONS_KEY, ["health"]],
  });

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (!group || i.group === group) &&
        (!status || i.status === status) &&
        (!s || i.name.toLowerCase().includes(s) || i.id.includes(s) || i.fields.some((f) => f.key.toLowerCase().includes(s))),
    );
  }, [items, search, group, status]);
  const n = (s: string) => items.filter((i) => i.status === s).length;

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Integrations" />
        <EmptyState title="Admins only" description="Managing API connections and credentials requires the ADMIN role." />
      </div>
    );
  }

  const selected = items.find((i) => i.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Every external connection in one place: credentials, enablement and live connection tests. Secret values are never displayed — only whether they are set."
      />
      {q.data && !q.data.encryptionConfigured ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Credential encryption is not configured on the API, so credentials cannot be stored from here. Values from the server environment (.env) still apply.
        </p>
      ) : null}
      {q.data ? (
        <p className="text-sm text-text-muted">
          <span className="font-medium text-success">{count(n("live"))} live</span> · {count(n("configured"))} configured ·{" "}
          {count(n("pending_configuration"))} not connected · <span className={n("error") ? "font-medium text-error" : undefined}>{count(n("error"))} error</span> ·{" "}
          {count(n("disabled"))} disabled · {count(items.length)} total
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          size="sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch("")}
          placeholder="Search name or env key"
          aria-label="Search integrations"
          containerClassName="w-full sm:w-64"
        />
        <Select size="sm" aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)} containerClassName="w-52">
          <option value="">All groups</option>
          {INTEGRATION_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
        <Select size="sm" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} containerClassName="w-52">
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {q.error ? (
        <ErrorState title="Integrations unavailable" description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No integrations match" description="Clear the filters to see all connections." />
      ) : (
        INTEGRATION_GROUPS.map((g) => {
          const rows = filtered.filter((i) => i.group === g.id);
          if (rows.length === 0) return null;
          return (
            <section key={g.id} className="flex flex-col gap-2" aria-labelledby={`grp-${g.id}`}>
              <h2 id={`grp-${g.id}`} className="text-md font-semibold">
                {g.label} <span className="text-sm font-normal text-text-muted">({rows.length})</span>
              </h2>
              <div className="overflow-hidden rounded-md border border-border bg-surface">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Integration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Credentials</TableHead>
                      <TableHead>Last test</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((i) => {
                      const req = i.fields.filter((f) => f.required);
                      const set = req.filter((f) => f.isSet).length;
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <div className="min-w-0 max-w-md">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{i.name}</span>
                                {i.docsUrl ? (
                                  <a href={i.docsUrl} target="_blank" rel="noreferrer noopener" className="text-text-muted hover:text-text" aria-label={`${i.name} documentation (opens in new tab)`}>
                                    <ExternalLink className="size-3.5" aria-hidden />
                                  </a>
                                ) : null}
                              </div>
                              <div className="truncate text-xs text-text-muted" title={i.goLive}>
                                {i.goLive}
                              </div>
                              {i.error ? <div className="text-xs text-error">{i.error}</div> : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge value={i.status} />
                          </TableCell>
                          <TableCell className="text-xs text-text-muted">
                            {req.length ? (
                              <span className={set === req.length ? "text-success" : undefined}>
                                {set}/{req.length} required set
                              </span>
                            ) : (
                              "No credentials"
                            )}
                          </TableCell>
                          <TableCell>
                            {i.lastTest ? (
                              <span className="inline-flex items-center gap-1.5 text-sm" title={`${dateTime(i.lastTest.at)}${i.lastTest.message ? " — " + i.lastTest.message : ""}`}>
                                {testPassed(i.lastTest.status) ? (
                                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                                ) : i.lastTest.status === "unverified" ? (
                                  <TriangleAlert className="size-4 text-warning" aria-hidden />
                                ) : (
                                  <XCircle className="size-4 text-error" aria-hidden />
                                )}
                                <StatusBadge value={i.lastTest.status} /> {relative(i.lastTest.at)}
                              </span>
                            ) : (
                              <span className="text-xs text-text-muted">Never tested</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={i.enabled}
                              disabled={toggle.isPending}
                              aria-label={`${i.enabled ? "Disable" : "Enable"} ${i.name}`}
                              onCheckedChange={(enabled) => (enabled ? toggle.mutate({ id: i.id, enabled }) : setDisabling(i))}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="secondary" onClick={() => setOpenId(i.id)}>
                              Configure
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })
      )}

      <IntegrationSheet integration={selected} encryptionConfigured={q.data?.encryptionConfigured ?? false} onClose={() => setOpenId(null)} />
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(o) => !o && setDisabling(null)}
        destructive
        title={`Disable ${disabling?.name ?? ""}?`}
        description="The API stops calling this provider immediately. Stored credentials are kept, so you can re-enable it later."
        confirmLabel="Disable"
        onConfirm={async () => {
          if (disabling) await toggle.mutateAsync({ id: disabling.id, enabled: false });
        }}
      />
    </div>
  );
}
