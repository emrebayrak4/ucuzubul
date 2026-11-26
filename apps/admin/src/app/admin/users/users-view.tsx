"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Role, type AdminUser } from "@pricora/contracts";
import { Badge, Button, EmptyState, Select } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { ROLE_LABEL } from "@/lib/roles";
import { dateTime, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-context";

type Pending =
  | { kind: "role"; user: AdminUser; role: AdminUser["role"] }
  | { kind: "status"; user: AdminUser; status: "active" | "suspended" }
  | null;

export function UsersView() {
  const { isAdmin, user: me } = useSession();
  const list = useListState({ sort: "createdAt" });
  const [pending, setPending] = useState<Pending>(null);

  const q = useQuery({
    queryKey: ["admin", "users", list.query],
    queryFn: ({ signal }) => getApi().admin.users.list(list.query, { signal }),
    placeholderData: keepPreviousData,
    enabled: isAdmin,
  });

  const update = useApiMutation(
    (v: { id: string; body: { role?: AdminUser["role"]; status?: "active" | "suspended" } }) => getApi().admin.users.update(v.id, v.body),
    { success: "User updated", invalidate: [["admin", "users"]] },
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Users" />
        <EmptyState title="Admins only" description="User management requires the ADMIN role." />
      </div>
    );
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "email",
      header: "User",
      sortKey: "email",
      cell: (u) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{u.email}</div>
          <div className="truncate text-xs text-text-muted">{u.name ?? "No name"}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      sortKey: "role",
      cell: (u) => (
        <Select
          size="sm"
          aria-label={`Role for ${u.email}`}
          value={u.role}
          disabled={u.id === me.id || update.isPending}
          title={u.id === me.id ? "You cannot change your own role" : undefined}
          onChange={(e) => setPending({ kind: "role", user: u, role: e.target.value as AdminUser["role"] })}
          containerClassName="w-32"
        >
          {Role.options.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      ),
    },
    { key: "status", header: "Status", sortKey: "status", cell: (u) => <StatusBadge value={u.status} /> },
    {
      key: "verified",
      header: "Email",
      cell: (u) => (u.emailVerified ? <Badge variant="success" size="sm">Verified</Badge> : <span className="text-xs text-text-muted">Unverified</span>),
    },
    { key: "createdAt", header: "Created", sortKey: "createdAt", cell: (u) => <span title={dateTime(u.createdAt)}>{relative(u.createdAt)}</span> },
    { key: "lastLoginAt", header: "Last login", sortKey: "lastLoginAt", cell: (u) => <span title={dateTime(u.lastLoginAt)}>{relative(u.lastLoginAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (u) =>
        u.status === "deleted" || u.id === me.id ? null : u.status === "suspended" ? (
          <Button size="sm" variant="secondary" onClick={() => setPending({ kind: "status", user: u, status: "active" })}>
            Reactivate
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="text-error" onClick={() => setPending({ kind: "status", user: u, status: "suspended" })}>
            Disable
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Change roles and disable accounts. Every change is written to the audit log by the API." />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(u) => u.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search email or name"
        caption="Users"
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === "role" ? "Change role?" : pending?.status === "suspended" ? "Disable account?" : "Reactivate account?"}
        destructive={pending?.kind === "status" && pending.status === "suspended"}
        confirmLabel={pending?.kind === "role" ? "Change role" : pending?.status === "suspended" ? "Disable account" : "Reactivate"}
        description={
          pending?.kind === "role" ? (
            <>
              <strong className="text-text">{pending.user.email}</strong> will change from {ROLE_LABEL[pending.user.role]} to{" "}
              <strong className="text-text">{ROLE_LABEL[pending.role]}</strong>. Permissions apply on their next request.
            </>
          ) : pending?.kind === "status" && pending.status === "suspended" ? (
            <>
              <strong className="text-text">{pending.user.email}</strong> will be signed out and unable to log in until reactivated.
            </>
          ) : pending ? (
            <>
              <strong className="text-text">{pending.user.email}</strong> will be able to log in again.
            </>
          ) : null
        }
        onConfirm={async () => {
          if (!pending) return;
          await update.mutateAsync({
            id: pending.user.id,
            body: pending.kind === "role" ? { role: pending.role } : { status: pending.status },
          });
        }}
      />
    </div>
  );
}
