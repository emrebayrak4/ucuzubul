"use client";

import { useMemo, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  AdminUpsertProductRequest,
  ProductCondition,
  type AdminProduct,
  type EndpointBody,
} from "@pricora/contracts";
import {
  Button,
  DemoDataBadge,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PriceTag,
  Select,
} from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { flattenTree, useCategoryTree } from "@/lib/categories";
import { count, dateTime, humanize, relative } from "@/lib/format";
import { DataTable, useListState, type Column } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Field, issuesToFieldErrors } from "@/components/field";
import { useSession } from "@/components/session-context";

const STATUSES = ["active", "draft", "archived"] as const;

export function ProductsView() {
  const { canEdit } = useSession();
  const list = useListState({ sort: "updatedAt" });
  const [editing, setEditing] = useState<AdminProduct | "new" | null>(null);

  const q = useQuery({
    queryKey: ["admin", "products", list.query],
    queryFn: ({ signal }) => getApi().admin.products.list(list.query, { signal }),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AdminProduct>[] = [
    {
      key: "title",
      header: "Product",
      sortKey: "title",
      cell: (p) => (
        <div className="min-w-0 max-w-md">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{p.title}</span>
            {p.isDemo ? <DemoDataBadge size="sm" /> : null}
          </div>
          <div className="truncate font-mono text-xs text-text-muted">{p.slug}</div>
        </div>
      ),
    },
    { key: "brand", header: "Brand", cell: (p) => p.brandName ?? <span className="text-text-muted">—</span> },
    { key: "category", header: "Category", cell: (p) => <span className="font-mono text-xs">{p.categorySlug ?? "—"}</span> },
    { key: "condition", header: "Condition", cell: (p) => humanize(p.condition) },
    { key: "status", header: "Status", sortKey: "status", cell: (p) => <StatusBadge value={p.status} /> },
    { key: "offers", header: "Offers", sortKey: "offerCount", numeric: true, cell: (p) => count(p.offerCount) },
    { key: "lowest", header: "Lowest", numeric: true, cell: (p) => <PriceTag cents={p.lowestPriceCents} size="sm" unavailableText="—" /> },
    { key: "updated", header: "Updated", sortKey: "updatedAt", cell: (p) => <span title={dateTime(p.updatedAt)}>{relative(p.updatedAt)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "text-right",
      cell: (p) =>
        canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
            Edit
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="Canonical products. Different conditions (new / refurbished / used / open box) are separate products and are never merged."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> New product
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={columns}
        rows={q.data?.items}
        rowKey={(p) => p.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        list={list}
        total={q.data?.total}
        totalPages={q.data?.totalPages}
        searchPlaceholder="Search title, slug, brand"
        caption="Products"
      />
      {editing ? <ProductDialog product={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: AdminProduct | null; onClose: () => void }) {
  const tree = useCategoryTree();
  const flat = useMemo(() => flattenTree(tree.data?.items ?? []), [tree.data]);
  const initialCategoryId = product?.categorySlug ? (flat.find((f) => f.node.slug === product.categorySlug)?.node.id ?? "") : "";

  const [title, setTitle] = useState(product?.title ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>(product?.status ?? "draft");
  const [condition, setCondition] = useState<AdminProduct["condition"]>(product?.condition ?? "new");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [mpn, setMpn] = useState("");
  const [gtin, setGtin] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const effectiveCategory = categoryId ?? initialCategoryId;

  const save = useApiMutation(
    (v: { id: string; patch: EndpointBody<"admin.products.update"> } | { create: EndpointBody<"admin.products.create"> }) =>
      "create" in v ? getApi().admin.products.create(v.create) : getApi().admin.products.update(v.id, v.patch),
    { success: product ? "Product updated" : "Product created", invalidate: [["admin", "products"]], onSuccess: onClose },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const candidate = {
      title: title.trim(),
      slug: slug.trim() || undefined,
      status,
      condition,
      categoryId: effectiveCategory || null,
      ...(product
        ? {}
        : {
            model: model.trim() || null,
            mpn: mpn.trim() || null,
            description: description.trim() || null,
            identifiers: gtin.trim() ? [{ type: "GTIN", value: gtin.trim() }] : undefined,
          }),
    };
    const parsed = AdminUpsertProductRequest.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (product) {
      // PATCH only what changed (list rows do not carry description/model/MPN, so those are not editable here).
      const patch: EndpointBody<"admin.products.update"> = {};
      if (candidate.title !== product.title) patch.title = candidate.title;
      if (candidate.slug && candidate.slug !== product.slug) patch.slug = candidate.slug;
      if (status !== product.status) patch.status = status;
      if (condition !== product.condition) patch.condition = condition;
      if (effectiveCategory !== initialCategoryId) patch.categoryId = effectiveCategory || null;
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      save.mutate({ id: product.id, patch });
    } else {
      save.mutate({ create: parsed.data });
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2">
            <Field id="p-title" label="Title" required error={errors.title}>
              <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} invalid={!!errors.title} />
            </Field>
          </div>
          <Field id="p-slug" label="Slug" hint={product ? undefined : "Leave empty to generate from title"} error={errors.slug}>
            <Input id="p-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" invalid={!!errors.slug} />
          </Field>
          <Field id="p-category" label="Category" error={errors.categoryId}>
            <Select id="p-category" value={effectiveCategory} onChange={(e) => setCategoryId(e.target.value)} disabled={tree.isLoading}>
              <option value="">— None —</option>
              {flat.map((f) => (
                <option key={f.node.id} value={f.node.id}>
                  {"  ".repeat(f.depth) + f.node.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="p-status" label="Status">
            <Select id="p-status" value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="p-condition" label="Condition" hint="Each condition is its own canonical product">
            <Select id="p-condition" value={condition} onChange={(e) => setCondition(e.target.value as AdminProduct["condition"])}>
              {ProductCondition.options.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
          </Field>
          {!product ? (
            <>
              <Field id="p-model" label="Model">
                <Input id="p-model" value={model} onChange={(e) => setModel(e.target.value)} />
              </Field>
              <Field id="p-mpn" label="MPN">
                <Input id="p-mpn" value={mpn} onChange={(e) => setMpn(e.target.value)} className="font-mono" />
              </Field>
              <Field id="p-gtin" label="GTIN / UPC" hint="Optional, digits only">
                <Input id="p-gtin" value={gtin} onChange={(e) => setGtin(e.target.value)} className="font-mono" inputMode="numeric" />
              </Field>
              <div className="sm:col-span-2">
                <Field id="p-desc" label="Description" error={errors.description}>
                  <textarea
                    id="p-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                  />
                </Field>
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted sm:col-span-2">
              Brand, description, model, MPN and identifiers are not returned by the admin product list, so they are not editable here yet.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={save.isPending}>
            {product ? "Save changes" : "Create product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
