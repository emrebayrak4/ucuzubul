"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Info, PlugZap, TriangleAlert, XCircle } from "lucide-react";
import type { AdminIntegrationField } from "@pricora/contracts";
import { Badge, Button, Input, Separator, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@pricora/ui";
import { errorMessage } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import {
  CATALOG_SOURCE_JOBS,
  INTEGRATIONS_KEY,
  runCatalogSource,
  type CatalogSourceJob,
  clearIntegration,
  saveIntegration,
  testIntegration,
  testPassed,
  type AdminIntegration,
  type AdminIntegrationTestResponse,
} from "@/lib/integrations";
import { dateTime, relative } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/field";

type TestView = { status: AdminIntegrationTestResponse["status"]; message: string | null; latencyMs: number | null; at: string | null };

export function IntegrationSheet({ integration, encryptionConfigured, onClose }: { integration: AdminIntegration | null; encryptionConfigured: boolean; onClose: () => void }) {
  return (
    <Sheet open={integration !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {integration ? <SheetBody key={integration.id} integration={integration} encryptionConfigured={encryptionConfigured} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ integration: i, encryptionConfigured, onClose }: { integration: AdminIntegration; encryptionConfigured: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  // Only touched fields go into the PUT body. Per contract: omitted/"" = keep, null = clear stored value.
  const [values, setValues] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState<AdminIntegrationField | "all" | null>(null);
  const [test, setTest] = useState<TestView | null>(null);

  const save = useApiMutation((fields: Record<string, string | null>) => saveIntegration(i.id, { fields }), {
    success: `${i.name} saved`,
    invalidate: [INTEGRATIONS_KEY, ["health"]],
    onSuccess: () => {
      setValues({});
      setCleared(new Set());
    },
  });
  const clearAll = useApiMutation(() => clearIntegration(i.id), { success: `${i.name}: stored credentials deleted`, invalidate: [INTEGRATIONS_KEY, ["health"]] });
  const runTest = useMutation({
    mutationFn: () => testIntegration(i.id),
    onSuccess: (r) => {
      setTest({ status: r.status, message: r.message, latencyMs: r.latencyMs, at: r.testedAt });
      void qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY });
    },
    onError: (err) => setTest({ status: "error", message: errorMessage(err), latencyMs: null, at: null }),
  });

  function pendingBody(): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    for (const f of i.fields) {
      if (cleared.has(f.key)) out[f.key] = null;
      else {
        const v = (values[f.key] ?? "").trim();
        if (v === "") continue;
        if (!f.secret && v === (f.masked ?? "")) continue;
        out[f.key] = v;
      }
    }
    return out;
  }
  const body = pendingBody();
  const dirty = Object.keys(body).length > 0;
  const missingRequired = i.fields.filter((f) => f.required && (cleared.has(f.key) || !(f.isSet || (values[f.key] ?? "").trim())));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (dirty) save.mutate(body);
  }

  const shown: TestView | null = test ?? (i.lastTest ? { status: i.lastTest.status, message: i.lastTest.message, latencyMs: i.lastTest.latencyMs, at: i.lastTest.at } : null);
  const tone = shown ? (testPassed(shown.status) ? "success" : shown.status === "unverified" || shown.status === "pending_configuration" ? "warning" : "error") : null;
  const toneCls = tone === "success" ? "border-success/30 bg-success-soft text-success" : tone === "warning" ? "border-warning/30 bg-warning-soft text-warning" : "border-error/30 bg-error-soft text-error";

  return (
    <>
      <SheetHeader className="border-b border-border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle>{i.name}</SheetTitle>
          <StatusBadge value={i.status} />
          {!i.enabled ? <Badge variant="neutral" size="sm">Disabled</Badge> : null}
        </div>
        <SheetDescription>{i.goLive}</SheetDescription>
        {i.docsUrl ? (
          <a href={i.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline">
            Provider documentation <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </SheetHeader>

      <div className="flex-1 overflow-y-auto p-5">
        {i.notes ? (
          <div className="mb-5 rounded-md border border-info/30 bg-info-soft p-3 text-sm text-info">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <Info className="size-4" aria-hidden /> Go-live notes
            </p>
            <p>{i.notes}</p>
          </div>
        ) : null}
        {i.error ? (
          <p role="alert" className="mb-5 rounded-md border border-error/30 bg-error-soft p-3 text-sm text-error">
            {i.error}
          </p>
        ) : null}
        {!encryptionConfigured ? (
          <p className="mb-5 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Credential encryption is not configured on the API — saving credentials will be rejected.
          </p>
        ) : null}

        <form id="integration-form" onSubmit={submit} className="flex flex-col gap-4" noValidate autoComplete="off">
          {i.fields.length === 0 ? <p className="text-sm text-text-muted">This integration has no configurable fields.</p> : null}
          {i.fields.map((f) => {
            const id = `f-${i.id}-${f.key}`;
            const isCleared = cleared.has(f.key);
            const storedInDb = f.source === "db";
            return (
              <div key={f.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-2xs text-text-muted">{f.key}</span>
                  <span className="flex items-center gap-1.5">
                    {f.source === "env" ? <Badge variant="info" size="sm">From server env</Badge> : null}
                    {isCleared ? (
                      <Badge variant="warning" size="sm">Will be cleared</Badge>
                    ) : f.isSet ? (
                      <Badge variant="success" size="sm">Set</Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">Not set</Badge>
                    )}
                    {storedInDb && !isCleared ? (
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-error" onClick={() => setConfirmClear(f)}>
                        Clear
                      </Button>
                    ) : null}
                    {isCleared ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() =>
                          setCleared((s) => {
                            const n = new Set(s);
                            n.delete(f.key);
                            return n;
                          })
                        }
                      >
                        Undo
                      </Button>
                    ) : null}
                  </span>
                </div>
                <Field
                  id={id}
                  label={f.label}
                  required={f.required}
                  hint={
                    f.help ??
                    (f.isSet
                      ? f.source === "env"
                        ? "Currently from the server environment. A value saved here overrides it."
                        : "Leave blank to keep the current value."
                      : undefined)
                  }
                >
                  <Input
                    id={id}
                    type={f.secret ? "password" : "text"}
                    autoComplete={f.secret ? "new-password" : "off"}
                    spellCheck={false}
                    className="font-mono"
                    disabled={isCleared}
                    value={values[f.key] ?? ""}
                    // Secrets: masked hint only ("••••1234"), never the value. Non-secrets: current value as placeholder.
                    placeholder={f.isSet ? (f.masked ?? "(set)") : "Not set"}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </Field>
              </div>
            );
          })}
          {missingRequired.length ? <p className="text-xs text-warning">Still required: {missingRequired.map((f) => f.label).join(", ")}</p> : null}
        </form>

        <Separator className="my-5" />

        <section aria-labelledby="test-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 id="test-heading" className="text-sm font-semibold">
              Connection test
            </h3>
            <Button type="button" size="sm" variant="secondary" loading={runTest.isPending} disabled={dirty} onClick={() => runTest.mutate()}>
              <PlugZap className="size-4" aria-hidden /> Test connection
            </Button>
          </div>
          {dirty ? <p className="text-xs text-text-muted">Save your changes first — the test runs against the stored configuration.</p> : null}
          {shown ? (
            <div role="status" className={`rounded-md border p-3 text-sm ${toneCls}`}>
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                {tone === "success" ? <CheckCircle2 className="size-4" aria-hidden /> : tone === "warning" ? <TriangleAlert className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                {shown.status === "live" ? "Connection OK" : shown.status === "unverified" ? "Reachable, not verified" : shown.status === "pending_configuration" ? "Not configured" : "Connection failed"}
                {shown.latencyMs != null ? <span className="price font-normal">· {shown.latencyMs} ms</span> : null}
              </p>
              {shown.message ? <p className="mt-1 break-words">{shown.message}</p> : null}
              {shown.at ? (
                <p className="mt-1 text-xs opacity-80" title={dateTime(shown.at)}>
                  Tested {relative(shown.at)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-text-muted">Not tested yet.</p>
          )}
        </section>

        {CATALOG_SOURCE_JOBS[i.id] ? <CatalogRunSection jobs={CATALOG_SOURCE_JOBS[i.id] ?? []} disabled={dirty} /> : null}

        <Separator className="my-5" />
        <div className="flex flex-col gap-1 text-xs text-text-muted">
          {i.updatedAt ? (
            <span title={dateTime(i.updatedAt)}>
              Last changed {relative(i.updatedAt)}
              {i.updatedBy ? ` by ${i.updatedBy.email}` : ""}
            </span>
          ) : null}
          {i.hasStoredCredentials ? (
            <Button type="button" size="sm" variant="ghost" className="w-fit px-0 text-error" onClick={() => setConfirmClear("all")}>
              Delete all stored credentials
            </Button>
          ) : null}
        </div>
      </div>

      <SheetFooter className="border-t border-border p-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" form="integration-form" loading={save.isPending} disabled={!dirty}>
          Save
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirmClear !== null}
        onOpenChange={(o) => !o && setConfirmClear(null)}
        destructive
        title={confirmClear === "all" ? `Delete all stored ${i.name} credentials?` : `Clear ${confirmClear?.label ?? ""}?`}
        description={
          confirmClear === "all"
            ? "Every value stored in the database for this integration is deleted. Values from the server environment (.env) still apply; without them the provider becomes “not connected”."
            : "The stored value is removed when you press Save. A value from the server environment, if any, then applies again."
        }
        typeToConfirm={confirmClear === "all" ? i.id : undefined}
        confirmLabel={confirmClear === "all" ? "Delete credentials" : "Mark for clearing"}
        onConfirm={async () => {
          if (confirmClear === "all") {
            await clearAll.mutateAsync(undefined);
            setValues({});
            setCleared(new Set());
            setTest(null);
          } else if (confirmClear) {
            const key = confirmClear.key;
            setCleared((s) => new Set(s).add(key));
            setValues((v) => {
              const n = { ...v };
              delete n[key];
              return n;
            });
          }
        }}
      />
    </>
  );
}

/** "Run now" for catalog-source jobs; the worker otherwise runs them on its schedule. */
function CatalogRunSection({ jobs, disabled }: { jobs: { job: CatalogSourceJob; label: string; hint: string }[]; disabled: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = useMutation({
    mutationFn: (job: CatalogSourceJob) => runCatalogSource(job),
    onSuccess: (r) => setResult({ ok: r.queued, message: r.message }),
    onError: (err) => setResult({ ok: false, message: errorMessage(err) }),
  });
  return (
    <>
      <Separator className="my-5" />
      <section aria-labelledby="catalog-run-heading" className="flex flex-col gap-3">
        <h3 id="catalog-run-heading" className="text-sm font-semibold">
          Import now
        </h3>
        {jobs.map((j) => (
          <div key={j.job} className="flex items-start justify-between gap-3">
            <p className="text-xs text-text-muted">{j.hint}</p>
            <Button type="button" size="sm" variant="secondary" loading={run.isPending && run.variables === j.job} disabled={disabled || run.isPending} onClick={() => run.mutate(j.job)}>
              {j.label}
            </Button>
          </div>
        ))}
        {result ? (
          <p role="status" className={`text-xs ${result.ok ? "text-success" : "text-warning"}`}>
            {result.message}
          </p>
        ) : null}
      </section>
    </>
  );
}
