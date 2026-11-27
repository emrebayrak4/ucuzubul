import { TriangleAlert } from "lucide-react";

/** Reading-width column (max-w-3xl) that stays left-aligned with the header logo and breadcrumbs. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="container-content py-6">
      <article className="max-w-3xl">
      <div role="note" className="mb-6 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="legal-draft">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>DRAFT — needs legal review.</strong> This text is a working draft and is not yet a binding policy.
        </span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-text-muted">Draft last updated {updated}</p>
      <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-text [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">{children}</div>
      </article>
    </div>
  );
}
