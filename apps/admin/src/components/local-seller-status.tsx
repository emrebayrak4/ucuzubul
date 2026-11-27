import { CheckCircle2, Circle } from "lucide-react";
import type { LocalSellerStatusResponse } from "@pricora/contracts";
import { StatusBadge } from "@/components/status-badge";
import { dateTime } from "@/lib/format";
import { LISTING_POLICY, VERIFICATION_LABEL } from "@/lib/local";

/** Verification badge + onboarding checklist from `merchant.local.status` / `merchant.local.apply`. */
export function LocalSellerStatus({ status, title = "Local seller onboarding" }: { status: LocalSellerStatusResponse; title?: string }) {
  const m = status.merchant;
  const done = status.checklist.filter((c) => c.done).length;
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5" aria-labelledby="local-status-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="local-status-title" className="text-md font-semibold">
          {title}
        </h2>
        <StatusBadge value={m.verificationStatus} />
        <span className="sr-only">{VERIFICATION_LABEL[m.verificationStatus]}</span>
        <span className="ml-auto text-xs text-text-muted">
          {done}/{status.checklist.length} steps done
        </span>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-text-muted">Business</dt>
          <dd>{m.companyName}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Submitted</dt>
          <dd>{dateTime(m.submittedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Reviewed</dt>
          <dd>{dateTime(m.reviewedAt)}</dd>
        </div>
      </dl>
      {m.reviewNote ? (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
          <span className="font-medium">Reviewer note:</span> {m.reviewNote}
        </p>
      ) : null}
      {status.checklist.length ? (
        <ul className="flex flex-col gap-2">
          {status.checklist.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-sm">
              {c.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />}
              <span>
                <span className={c.done ? "text-text-muted line-through" : "font-medium"}>{c.label}</span>
                <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
                {!c.done && c.hint ? <span className="block text-xs text-text-muted">{c.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-text-muted">{LISTING_POLICY}</p>
    </section>
  );
}
