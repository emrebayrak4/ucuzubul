"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Plus, TriangleAlert } from "lucide-react";
import { CreateApiKeyRequest, type ApiKeySummary, type CreateApiKeyResponse } from "@pricora/contracts";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, toast } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, relative } from "@/lib/format";
import { DataTable, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Scope = CreateApiKeyRequest["scopes"][number];
const SCOPES: { value: Scope; label: string }[] = [
  { value: "offers:read", label: "Read offers" },
  { value: "offers:write", label: "Update offers (price, stock)" },
  { value: "feeds:write", label: "Upload feeds" },
  { value: "analytics:read", label: "Read analytics" },
];

export default function ApiKeysPage() {
  const q = useQuery({ queryKey: ["merchant", "api-keys"], queryFn: ({ signal }) => getApi().merchant.apiKeys.list({ signal }) });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [revoking, setRevoking] = useState<ApiKeySummary | null>(null);

  const revoke = useApiMutation((id: string) => getApi().merchant.apiKeys.revoke(id), { success: "API key revoked", invalidate: [["merchant", "api-keys"]] });

  const columns: Column<ApiKeySummary>[] = [
    { key: "name", header: "Name", cell: (k) => <span className="font-medium">{k.name}</span> },
    { key: "prefix", header: "Key", cell: (k) => <code className="font-mono text-xs">{k.prefix}…</code> },
    { key: "scopes", header: "Scopes", cell: (k) => <span className="font-mono text-xs">{k.scopes.join(", ")}</span> },
    { key: "status", header: "Status", cell: (k) => (k.revokedAt ? <span title={dateTime(k.revokedAt)}><StatusBadge value="disabled" /></span> : <StatusBadge value="active" />) },
    { key: "used", header: "Last used", cell: (k) => <span title={dateTime(k.lastUsedAt)}>{k.lastUsedAt ? relative(k.lastUsedAt) : "Never"}</span> },
    { key: "created", header: "Created", cell: (k) => <span title={dateTime(k.createdAt)}>{relative(k.createdAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (k) =>
        k.revokedAt ? null : (
          <Button size="sm" variant="ghost" className="text-error" onClick={() => setRevoking(k)}>
            Revoke
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API keys"
        description="Keys for the merchant API. The full secret is shown once at creation — store it in a secrets manager."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Create key
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(k) => k.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        emptyTitle="No API keys"
        emptyDescription="Create a key to integrate your inventory system."
        caption="API keys"
      />
      {creating ? <CreateKeyDialog onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); setCreated(r); }} /> : null}
      {created ? <SecretOnceDialog result={created} onClose={() => setCreated(null)} /> : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        destructive
        title="Revoke API key?"
        description={
          <>
            <strong className="text-text">{revoking?.name}</strong> (<code className="font-mono">{revoking?.prefix}…</code>) stops working immediately. Integrations using it will fail. This cannot be undone.
          </>
        }
        typeToConfirm={revoking?.name}
        confirmLabel="Revoke key"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking.id);
        }}
      />
    </div>
  );
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: CreateApiKeyResponse) => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["offers:read"]);
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation((body: CreateApiKeyRequest) => getApi().merchant.apiKeys.create(body), {
    invalidate: [["merchant", "api-keys"]],
    onSuccess: onCreated,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateApiKeyRequest.safeParse({ name: name.trim(), scopes });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.path[0] === "scopes" ? "Pick at least one scope." : "Enter a name (1–80 characters).");
      return;
    }
    setError(null);
    create.mutate(parsed.data);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
        </DialogHeader>
        <form id="key-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field id="k-name" label="Name" required hint="e.g. “ERP sync”">
            <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Scopes</legend>
            {SCOPES.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(s.value)}
                  onCheckedChange={(c) => setScopes((cur) => (c === true ? [...cur, s.value] : cur.filter((x) => x !== s.value)))}
                />
                {s.label} <code className="font-mono text-xs text-text-muted">{s.value}</code>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="key-form" loading={create.isPending}>
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretOnceDialog({ result, onClose }: { result: CreateApiKeyResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && ack && onClose()}>
      <DialogContent size="md" hideClose onEscapeKeyDown={(e) => !ack && e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Copy your new API key</DialogTitle>
          <DialogDescription>
            <span className="inline-flex items-center gap-1.5 text-warning">
              <TriangleAlert className="size-4" aria-hidden /> This is the only time the full key is shown.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm whitespace-nowrap select-all">{result.secret}</code>
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.secret);
                setCopied(true);
              } catch {
                toast.error("Copy failed — select the key and copy it manually.");
              }
            }}
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-text-muted">
          {result.key.name} · scopes {result.key.scopes.join(", ")}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={ack} onCheckedChange={(c) => setAck(c === true)} /> I have stored this key securely
        </label>
        <DialogFooter>
          <Button disabled={!ack} onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
