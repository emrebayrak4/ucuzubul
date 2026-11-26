import { TriangleAlert } from "lucide-react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="container-content max-w-3xl py-8">
      <div role="note" className="mb-6 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="legal-draft">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>DRAFT — needs legal review.</strong> This text is a working draft and is not yet a binding policy.
        </span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-text-muted">Draft last updated {updated}</p>
      <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-text">{children}</div>
    </article>
  );
}
