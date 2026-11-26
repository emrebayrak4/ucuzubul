"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { AdminUpsertGuideRequest, type AdminGuide, type AdminUpdateGuideRequest } from "@pricora/contracts";
import { Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@pricora/ui";
import { getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime, relative } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MarkdownPreview } from "@/components/markdown-preview";
import { useSession } from "@/components/session-context";

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function GuideEditor({ guide }: { guide: AdminGuide | null }) {
  const router = useRouter();
  const { canEdit } = useSession();
  const [f, setF] = useState({
    slug: guide?.slug ?? "",
    title: guide?.title ?? "",
    description: guide?.description ?? "",
    city: guide?.city ?? "",
    country: guide?.country ?? "",
    countryIso2: guide?.countryIso2 ?? "",
    iataCityCode: guide?.iataCityCode ?? "",
    cityId: guide?.cityId != null ? String(guide.cityId) : "",
    bestTimeToVisit: guide?.bestTimeToVisit ?? "",
    neighborhoods: guide?.neighborhoods.join(", ") ?? "",
    tags: guide?.tags.join(", ") ?? "",
    lastReviewed: guide?.lastReviewed ?? "",
    bodyMarkdown: guide?.bodyMarkdown ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = useApiMutation(
    (v: { create: AdminUpsertGuideRequest } | { patch: AdminUpdateGuideRequest }) =>
      "create" in v
        ? getApi().request("admin.guides.create", { body: v.create })
        : getApi().request("admin.guides.update", { params: { id: (guide as AdminGuide).id }, body: v.patch }),
    {
      success: (g) => (g.status === "published" ? "Guide saved · published" : "Guide saved · draft"),
      invalidate: [["admin", "guides"], ["admin", "guide-detail"]],
      onSuccess: (g) => {
        if (!guide) router.replace(`/admin/guides/${g.id}`);
      },
    },
  );
  // Delete: navigate away first; only the list is invalidated (refetching the deleted detail would 404).
  const remove = useApiMutation(() => getApi().request("admin.guides.delete", { params: { id: (guide as AdminGuide).id } }), {
    success: "Guide deleted",
    invalidate: [["admin", "guides"]],
    onSuccess: () => router.push("/admin/guides"),
  });

  function build(status: "draft" | "published") {
    const candidate = {
      slug: f.slug.trim(),
      title: f.title.trim(),
      description: f.description.trim(),
      city: f.city.trim(),
      country: f.country.trim(),
      countryIso2: f.countryIso2.trim().toUpperCase(),
      iataCityCode: f.iataCityCode.trim() ? f.iataCityCode.trim().toUpperCase() : null,
      cityId: f.cityId.trim() ? Number(f.cityId) : null,
      bestTimeToVisit: f.bestTimeToVisit.trim() || null,
      neighborhoods: list(f.neighborhoods),
      tags: list(f.tags).map((t) => t.toLowerCase()),
      lastReviewed: f.lastReviewed || null,
      bodyMarkdown: f.bodyMarkdown,
      status,
    };
    const parsed = AdminUpsertGuideRequest.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  function submit(status: "draft" | "published") {
    const body = build(status);
    if (!body) return;
    if (!guide) return save.mutateAsync({ create: body });
    return save.mutateAsync({ patch: body });
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    void submit(guide?.status ?? "draft")?.catch(() => undefined);
  }

  const published = guide?.status === "published";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/guides" className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> All guides
      </Link>
      <PageHeader
        title={guide ? guide.title : "New travel guide"}
        badge={guide ? <Badge variant={published ? "success" : "neutral"} size="sm">{published ? "Published" : "Draft"}</Badge> : undefined}
        description={
          guide
            ? `Updated ${relative(guide.updatedAt)}${guide.publishedAt ? ` · published ${dateTime(guide.publishedAt)}` : ""}${guide.adminEditedAt ? " · protected from file sync (edited in admin)" : ""}`
            : "Drafts are not visible on the site until published."
        }
        actions={
          canEdit ? (
            <>
              {guide ? (
                <Button size="sm" variant="ghost" className="text-error" onClick={() => setConfirm("delete")}>
                  Delete
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" type="submit" form="guide-form" loading={save.isPending}>
                {guide ? "Save" : "Save draft"}
              </Button>
              {published ? (
                <Button size="sm" variant="secondary" onClick={() => build("draft") && setConfirm("unpublish")}>
                  Unpublish
                </Button>
              ) : (
                <Button size="sm" onClick={() => build("published") && setConfirm("publish")}>
                  Publish
                </Button>
              )}
            </>
          ) : null
        }
      />
      {Object.keys(errors).length ? (
        <p role="alert" className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm text-error">
          Fix the highlighted fields: {Object.keys(errors).join(", ")}.
        </p>
      ) : null}

      <form id="guide-form" onSubmit={onSave} noValidate className="flex flex-col gap-6">
        <fieldset disabled={!canEdit} className="grid gap-4 rounded-md border border-border bg-surface p-5 md:grid-cols-2 xl:grid-cols-4">
          <legend className="sr-only">Guide details</legend>
          <div className="md:col-span-2">
            <Field id="g-title" label="Title" required error={errors.title}>
              <Input id="g-title" value={f.title} onChange={set("title")} invalid={!!errors.title} />
            </Field>
          </div>
          <Field id="g-slug" label="Slug" required error={errors.slug} hint={guide ? "Changing it changes the public URL" : undefined}>
            <Input id="g-slug" value={f.slug} onChange={set("slug")} className="font-mono" invalid={!!errors.slug} />
          </Field>
          <Field id="g-reviewed" label="Last reviewed" error={errors.lastReviewed}>
            <Input id="g-reviewed" type="date" value={f.lastReviewed} onChange={set("lastReviewed")} />
          </Field>
          <div className="md:col-span-2 xl:col-span-4">
            <Field id="g-desc" label="Description" required hint="20–400 characters; used for SEO and cards" error={errors.description}>
              <Input id="g-desc" value={f.description} onChange={set("description")} invalid={!!errors.description} />
            </Field>
          </div>
          <Field id="g-city" label="City" required error={errors.city}>
            <Input id="g-city" value={f.city} onChange={set("city")} invalid={!!errors.city} />
          </Field>
          <Field id="g-country" label="Country" required error={errors.country}>
            <Input id="g-country" value={f.country} onChange={set("country")} invalid={!!errors.country} />
          </Field>
          <Field id="g-iso" label="Country code" required hint="ISO 3166 alpha-2, e.g. US" error={errors.countryIso2}>
            <Input id="g-iso" value={f.countryIso2} onChange={set("countryIso2")} maxLength={2} className="font-mono uppercase" invalid={!!errors.countryIso2} />
          </Field>
          <Field id="g-iata" label="IATA city code" hint="e.g. NYC" error={errors.iataCityCode}>
            <Input id="g-iata" value={f.iataCityCode} onChange={set("iataCityCode")} maxLength={3} className="font-mono uppercase" invalid={!!errors.iataCityCode} />
          </Field>
          <Field id="g-cityid" label="GeoNames city id" hint="Links hotel search" error={errors.cityId}>
            <Input id="g-cityid" value={f.cityId} onChange={set("cityId")} inputMode="numeric" className="font-mono" invalid={!!errors.cityId} />
          </Field>
          <Field id="g-best" label="Best time to visit" error={errors.bestTimeToVisit}>
            <Input id="g-best" value={f.bestTimeToVisit} onChange={set("bestTimeToVisit")} />
          </Field>
          <Field id="g-neigh" label="Neighborhoods" hint="Comma separated" error={errors.neighborhoods}>
            <Input id="g-neigh" value={f.neighborhoods} onChange={set("neighborhoods")} invalid={!!errors.neighborhoods} />
          </Field>
          <Field id="g-tags" label="Tags" hint="Comma separated, lowercase-with-dashes" error={errors.tags}>
            <Input id="g-tags" value={f.tags} onChange={set("tags")} className="font-mono" invalid={!!errors.tags} />
          </Field>
        </fieldset>

        <section className="flex flex-col gap-2" aria-labelledby="body-heading">
          <div className="flex items-center justify-between">
            <h2 id="body-heading" className="text-md font-semibold">
              Body (Markdown)
            </h2>
            <span className="text-xs text-text-muted">{f.bodyMarkdown.length.toLocaleString("en-US")} / 200,000 characters</span>
          </div>
          {errors.bodyMarkdown ? <p className="text-sm text-error">{errors.bodyMarkdown}</p> : null}
          {/* Side by side on large screens; tabs on small screens. */}
          <div className="hidden gap-4 lg:grid lg:grid-cols-2">
            <MarkdownSource value={f.bodyMarkdown} onChange={set("bodyMarkdown")} disabled={!canEdit} />
            <PreviewPane source={f.bodyMarkdown} />
          </div>
          <Tabs defaultValue="write" className="lg:hidden">
            <TabsList variant="segmented">
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <MarkdownSource value={f.bodyMarkdown} onChange={set("bodyMarkdown")} disabled={!canEdit} />
            </TabsContent>
            <TabsContent value="preview">
              <PreviewPane source={f.bodyMarkdown} />
            </TabsContent>
          </Tabs>
        </section>
      </form>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm === "delete" || confirm === "unpublish"}
        title={confirm === "publish" ? "Publish this guide?" : confirm === "unpublish" ? "Unpublish this guide?" : "Delete this guide?"}
        description={
          confirm === "publish"
            ? `“${f.title}” becomes visible on the site at /travel/guides/${f.slug} and in the sitemap. Current edits are saved first.`
            : confirm === "unpublish"
              ? "The guide is removed from the site and sitemap and kept as a draft. Current edits are saved too."
              : "The guide is deleted permanently. Unpublishing keeps it as a draft instead."
        }
        confirmLabel={confirm === "publish" ? "Publish" : confirm === "unpublish" ? "Unpublish" : "Delete"}
        typeToConfirm={confirm === "delete" ? f.slug : undefined}
        onConfirm={async () => {
          if (confirm === "delete") await remove.mutateAsync(undefined);
          else if (confirm) await submit(confirm === "publish" ? "published" : "draft");
        }}
      />
    </div>
  );
}

function MarkdownSource({ value, onChange, disabled }: { value: string; onChange: (e: { target: { value: string } }) => void; disabled: boolean }) {
  return (
    <textarea
      aria-label="Guide body Markdown"
      value={value}
      onChange={onChange}
      disabled={disabled}
      spellCheck
      className="h-[60vh] min-h-80 w-full resize-y rounded-md border border-border-strong bg-surface p-3 font-mono text-sm leading-relaxed"
    />
  );
}

function PreviewPane({ source }: { source: string }) {
  return (
    <div className="h-[60vh] min-h-80 overflow-y-auto rounded-md border border-border bg-surface p-4" aria-label="Preview">
      {source.trim() ? <MarkdownPreview source={source} className="text-base" /> : <p className="text-sm text-text-muted">Nothing to preview yet.</p>}
      <p className="mt-6 border-t border-border pt-2 text-2xs text-text-muted">Preview: raw HTML is shown as text; only http(s)/mailto links are kept. The API sanitises again on save.</p>
    </div>
  );
}
