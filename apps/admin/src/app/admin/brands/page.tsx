"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AdminUpsertBrandRequest, type AdminBrand, type EndpointBody } from "@pricora/contracts";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Separator, StoreLogo } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { count, dateTime, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { LogoUploader } from "@/components/logo-uploader";
import { useSession } from "@/components/session-context";

const BRAND_KEYS = [["admin", "brands"]] as const;

export default function BrandsPage() {
  const { canEdit } = useSession();
  const list = useListState({ sort: "name", order: "asc" });
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const q = useQuery({
    queryKey: ["admin", "brands", list.query],
    queryFn: ({ signal }) => getApi().request("admin.brands.list", { query: list.query, signal }),
    placeholderData: keepPreviousData,
  });
  const current = editing && editing !== "new" ? (q.data?.items.find((b) => b.id === editing) ?? null) : null;

  const columns: Column<AdminBrand>[] = [
    {
      key: "name",
      header: "Brand",
      sortKey: "name",
      cell: (b) => (
        <div className="flex items-center gap-2.5">
          <StoreLogo name={b.name} logoUrl={b.logoUrl} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{b.name}</div>
            <div className="truncate font-mono text-xs text-text-muted">{b.slug}</div>
          </div>
        </div>
      ),
    },
    {
      key: "website",
      header: "Website",
      cell: (b) =>
        b.website ? (
          <a href={b.website} target="_blank" rel="noreferrer noopener" className="text-sm text-primary hover:underline">
            {b.website.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { key: "products", header: "Products", sortKey: "productCount", numeric: true, cell: (b) => count(b.productCount) },
    { key: "updated", header: "Updated", sortKey: "updatedAt", cell: (b) => <span title={dateTime(b.updatedAt)}>{relative(b.updatedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (b) =>
        canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(b.id)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brands"
        description="Brand names, slugs, websites and logos."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> New brand
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(b) => b.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search brands"
        caption="Brands"
      />
      {editing ? <BrandDialog key={editing} brand={current} canEdit={canEdit} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function BrandDialog({ brand, canEdit, onClose }: { brand: AdminBrand | null; canEdit: boolean; onClose: () => void }) {
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [website, setWebsite] = useState(brand?.website ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useApiMutation(
    (v: { id: string; patch: EndpointBody<"admin.brands.update"> } | { create: EndpointBody<"admin.brands.create"> }) =>
      "create" in v
        ? getApi().request("admin.brands.create", { body: v.create })
        : getApi().request("admin.brands.update", { params: { id: v.id }, body: v.patch }),
    { success: brand ? "Brand updated" : "Brand created", invalidate: BRAND_KEYS.map((k) => [...k]), onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const candidate = { name: name.trim(), slug: slug.trim() || undefined, website: website.trim() || null };
    const parsed = AdminUpsertBrandRequest.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (!brand) return save.mutate({ create: parsed.data });
    const patch: EndpointBody<"admin.brands.update"> = {};
    if (candidate.name !== brand.name) patch.name = candidate.name;
    if (candidate.slug && candidate.slug !== brand.slug) patch.slug = candidate.slug;
    if (candidate.website !== brand.website) patch.website = candidate.website;
    if (Object.keys(patch).length === 0) return onClose();
    save.mutate({ id: brand.id, patch });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{brand ? `Edit ${brand.name}` : "New brand"}</DialogTitle>
        </DialogHeader>
        {brand ? (
          <>
            <LogoUploader
              entity="brand"
              id={brand.id}
              name={brand.name}
              logoUrl={brand.logoUrl}
              logoSource={brand.logoSource}
              logoUpdatedAt={brand.logoUpdatedAt}
              canEdit={canEdit}
              invalidate={BRAND_KEYS}
            />
            <Separator />
          </>
        ) : null}
        <form id="brand-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field id="b-name" label="Name" required error={errors.name}>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
          </Field>
          <Field id="b-slug" label="Slug" hint={brand ? "Changing it changes public URLs" : "Empty = generate from name"} error={errors.slug}>
            <Input id="b-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" invalid={!!errors.slug} />
          </Field>
          <div className="sm:col-span-2">
            <Field id="b-web" label="Website" hint="https://…" error={errors.website}>
              <Input id="b-web" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} invalid={!!errors.website} />
            </Field>
          </div>
          {!brand ? <p className="text-xs text-text-muted sm:col-span-2">Upload a logo after the brand is created.</p> : null}
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="brand-form" loading={save.isPending}>
            {brand ? "Save" : "Create brand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
