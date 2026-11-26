"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AdminUpsertCategoryRequest, type CategoryNode, type EndpointBody } from "@pricora/contracts";
import { Button, CategoryIcon, EmptyState, ErrorState, Input, SearchInput, Select, Skeleton, cn } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { flattenTree, useCategoryTree } from "@/lib/categories";
import { count } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-context";

type Selection = { mode: "edit"; node: CategoryNode } | { mode: "create"; parentId: string | null } | null;

export function CategoriesView() {
  const { canEdit } = useSession();
  const tree = useCategoryTree();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [filter, setFilter] = useState("");

  const flat = useMemo(() => flattenTree(tree.data?.items ?? []), [tree.data]);
  const matches = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return null;
    const hit = new Set<string>();
    for (const c of flat) {
      if (c.node.name.toLowerCase().includes(f) || c.node.slug.includes(f)) {
        hit.add(c.node.id);
        c.path.forEach((p) => hit.add(p));
      }
    }
    return hit;
  }, [filter, flat]);

  function toggle(id: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function renderNodes(nodes: CategoryNode[], depth: number) {
    return (
      <ul role={depth === 0 ? "tree" : "group"} aria-label={depth === 0 ? "Categories" : undefined}>
        {nodes
          .filter((n) => !matches || matches.has(n.id))
          .map((n) => {
            const open = matches ? true : expanded.has(n.id);
            const selected = selection?.mode === "edit" && selection.node.id === n.id;
            return (
              <li key={n.id} role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-selected={selected}>
                <div
                  className={cn("flex h-8 items-center gap-1 rounded-md pr-2 text-sm", selected ? "bg-primary-soft text-primary-soft-fg" : "hover:bg-surface-2")}
                  style={{ paddingLeft: depth * 16 + 4 }}
                >
                  {n.children.length ? (
                    <button type="button" onClick={() => toggle(n.id)} className="grid size-6 place-items-center rounded-sm text-text-muted hover:text-text" aria-label={open ? `Collapse ${n.name}` : `Expand ${n.name}`}>
                      {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                    </button>
                  ) : (
                    <span className="size-6" />
                  )}
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelection({ mode: "edit", node: n })}>
                    <CategoryIcon category={n.slug} size={14} className="shrink-0 text-text-muted" />
                    <span className="truncate">{n.name}</span>
                    <span className="ml-auto price text-xs text-text-muted">{count(n.productCount)}</span>
                  </button>
                </div>
                {n.children.length && open ? renderNodes(n.children, depth + 1) : null}
              </li>
            );
          })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Category tree (DB-driven). Select a category to edit it, or add a child. Counts are products per category."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setSelection({ mode: "create", parentId: null })}>
              <Plus className="size-4" aria-hidden /> New root category
            </Button>
          ) : null
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput size="sm" value={filter} onChange={(e) => setFilter(e.target.value)} onClear={() => setFilter("")} placeholder="Filter categories" aria-label="Filter categories" containerClassName="w-full sm:w-64" />
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(flat.filter((f) => f.node.children.length).map((f) => f.node.id)))}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
              Collapse all
            </Button>
            <span className="ml-auto text-xs text-text-muted">{count(flat.length)} categories</span>
          </div>
          {tree.error ? (
            <ErrorState description={errorMessage(tree.error)} onRetry={() => void tree.refetch()} />
          ) : tree.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : flat.length === 0 ? (
            <EmptyState size="sm" title="No categories" description="Run the seed or create a root category." />
          ) : (
            renderNodes(tree.data?.items ?? [], 0)
          )}
        </section>
        <aside className="h-fit rounded-md border border-border bg-surface p-4 lg:sticky lg:top-20">
          {selection ? (
            <CategoryEditor key={selection.mode === "edit" ? selection.node.id : `new-${selection.parentId ?? "root"}`} selection={selection} canEdit={canEdit} onDone={setSelection} />
          ) : (
            <p className="text-sm text-text-muted">Select a category to view or edit it.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function CategoryEditor({ selection, canEdit, onDone }: { selection: NonNullable<Selection>; canEdit: boolean; onDone: (s: Selection) => void }) {
  const tree = useCategoryTree();
  const flat = useMemo(() => flattenTree(tree.data?.items ?? []), [tree.data]);
  const node = selection.mode === "edit" ? selection.node : null;
  const [name, setName] = useState(node?.name ?? "");
  const [slug, setSlug] = useState(node?.slug ?? "");
  const [parentId, setParentId] = useState<string>(node ? (node.parentId ?? "") : (selection.mode === "create" ? (selection.parentId ?? "") : ""));
  const [icon, setIcon] = useState(node?.icon ?? "");
  const [sortOrder, setSortOrder] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmHide, setConfirmHide] = useState(false);

  // A node cannot be moved under itself or its descendants.
  const forbidden = useMemo(() => {
    if (!node) return new Set<string>();
    return new Set(flat.filter((f) => f.node.id === node.id || f.path.includes(node.id)).map((f) => f.node.id));
  }, [flat, node]);

  const save = useApiMutation(
    (v: { id: string; patch: EndpointBody<"admin.categories.update"> } | { create: EndpointBody<"admin.categories.create"> }) =>
      "create" in v ? getApi().admin.categories.create(v.create) : getApi().admin.categories.update(v.id, v.patch),
    { success: node ? "Category updated" : "Category created", invalidate: [["catalog", "categories"]], onSuccess: () => onDone(null) },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const candidate = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      parentId: parentId || null,
      icon: icon.trim() || null,
      sortOrder: sortOrder.trim() === "" ? undefined : Number(sortOrder),
      description: description.trim() || undefined,
    };
    const parsed = AdminUpsertCategoryRequest.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (!node) {
      save.mutate({ create: parsed.data });
      return;
    }
    const patch: EndpointBody<"admin.categories.update"> = {};
    if (candidate.name !== node.name) patch.name = candidate.name;
    if (candidate.slug && candidate.slug !== node.slug) patch.slug = candidate.slug;
    if (candidate.parentId !== node.parentId) patch.parentId = candidate.parentId;
    if (candidate.icon !== node.icon) patch.icon = candidate.icon;
    if (candidate.sortOrder !== undefined) patch.sortOrder = candidate.sortOrder;
    if (candidate.description !== undefined) patch.description = candidate.description;
    if (Object.keys(patch).length === 0) return onDone(null);
    save.mutate({ id: node.id, patch });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold">{node ? "Edit category" : "New category"}</h2>
        {node && canEdit ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => onDone({ mode: "create", parentId: node.id })}>
            <Plus className="size-4" aria-hidden /> Add child
          </Button>
        ) : null}
      </div>
      {node ? <p className="text-xs text-text-muted">{count(node.productCount)} products · id <code className="font-mono">{node.id}</code></p> : null}
      <fieldset disabled={!canEdit || save.isPending} className="flex flex-col gap-4">
        <Field id="c-name" label="Name" required error={errors.name}>
          <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} invalid={!!errors.name} />
        </Field>
        <Field id="c-slug" label="Slug" error={errors.slug} hint={node ? "Changing a slug changes public URLs" : "Leave empty to generate"}>
          <Input id="c-slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" invalid={!!errors.slug} />
        </Field>
        <Field id="c-parent" label="Parent">
          <Select id="c-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Root —</option>
            {flat.map((f) => (
              <option key={f.node.id} value={f.node.id} disabled={forbidden.has(f.node.id)}>
                {"  ".repeat(f.depth) + f.node.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="c-icon" label="Icon key" error={errors.icon}>
            <Input id="c-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="font-mono" />
          </Field>
          <Field id="c-sort" label="Sort order" error={errors.sortOrder} hint={node ? "Empty = unchanged" : undefined}>
            <Input id="c-sort" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <Field id="c-desc" label="Description" hint={node ? "Empty = unchanged" : undefined} error={errors.description}>
          <textarea id="c-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm" />
        </Field>
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" loading={save.isPending}>
            {node ? "Save" : "Create"}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onDone(null)}>
            Cancel
          </Button>
          {node ? (
            <Button type="button" size="sm" variant="ghost" className="ml-auto text-error" onClick={() => setConfirmHide(true)}>
              Deactivate
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-text-muted">Read-only: editing categories requires the EDITOR or ADMIN role.</p>
      )}
      {node ? (
        <ConfirmDialog
          open={confirmHide}
          onOpenChange={setConfirmHide}
          destructive
          title={`Deactivate “${node.name}”?`}
          description={`The category and its ${node.children.length} direct subcategories disappear from public navigation. Products keep their category assignment.`}
          confirmLabel="Deactivate"
          onConfirm={() => save.mutateAsync({ id: node.id, patch: { isActive: false } })}
        />
      ) : null}
    </form>
  );
}
