"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, Eraser, PencilLine, ShieldOff } from "lucide-react";
import type { PrivacyRequestResponse, PrivacyRequestType } from "@pricora/contracts";
import { Button, FieldMessage, Input, Label, Switch } from "@pricora/ui";
import { api, errorMessage, fieldErrors } from "@/lib/api-browser";
import { useSession } from "@/lib/session";
import { GpcNotice, PreferencesForm, useConsent } from "./consent-provider";

/** One-click "Do Not Sell or Share" switch (advertising & affiliate measurement off). */
function OptOutCard() {
  const { consent, gpc, save } = useConsent();
  const optedOut = gpc || !consent?.advertising;
  return (
    <section id="opt-out" className="scroll-mt-24 rounded-lg border border-border bg-surface p-4" aria-labelledby="opt-out-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="opt-out-title" className="text-lg font-semibold">
            Do Not Sell or Share My Personal Information
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            We don&apos;t sell personal information for money. Affiliate measurement (letting a store know a purchase came from our link) and any
            future advertising cookies may count as “selling” or “sharing” under California and other state laws. Opting out turns them off on this
            browser{consent ? "" : " and records your choice"}; signed-in choices are also saved to your account.
          </p>
          <GpcNotice className="mt-2" />
        </div>
        <Switch
          checked={optedOut}
          disabled={gpc}
          aria-label="Opt out of sale/sharing"
          data-testid="opt-out-switch"
          onCheckedChange={(v) => save({ functional: consent?.functional ?? false, analytics: consent?.analytics ?? false, advertising: !v })}
        />
      </div>
      <p className="mt-2 text-sm font-medium" data-testid="opt-out-status">
        Status: {optedOut ? "Opted out of sale/sharing" : "Sale/sharing allowed (affiliate measurement on)"}
      </p>
    </section>
  );
}

const REQUESTS: Array<{ type: PrivacyRequestType; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }> = [
  { type: "access", label: "Access / export my data", icon: Download },
  { type: "delete", label: "Delete my data", icon: Eraser },
  { type: "correct", label: "Correct my data", icon: PencilLine },
  { type: "opt_out", label: "Opt out of sale/sharing & targeted ads", icon: ShieldOff },
];

/** Data subject request form for visitors without an account session. */
function DsarForm() {
  const [type, setType] = React.useState<PrivacyRequestType>("access");
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PrivacyRequestResponse | null>(null);
  const id = React.useId();

  if (result) {
    return (
      <div role="status" className="rounded-md border border-success/40 bg-success-soft p-3 text-sm" data-testid="dsar-result">
        <p className="flex items-center gap-1.5 font-semibold">
          <CheckCircle2 aria-hidden className="size-4 text-success" /> Request received
        </p>
        <p className="mt-1 text-text">{result.message}</p>
        <p className="mt-1 text-text-muted">We respond by {new Date(result.dueAt).toLocaleDateString("en-US", { dateStyle: "long" })} (45 days).</p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setErrors({});
        setBusy(true);
        try {
          setResult(await api.privacy.createRequest({ type, email, state: state || undefined, details: details || undefined }));
        } catch (err) {
          const fe = fieldErrors(err);
          setErrors(Object.keys(fe).length ? fe : { form: errorMessage(err) });
        } finally {
          setBusy(false);
        }
      }}
      data-testid="dsar-form"
    >
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-semibold">What would you like to do?</legend>
        {REQUESTS.map((r) => (
          <label key={r.type} className={"flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm " + (type === r.type ? "border-primary bg-primary-soft" : "border-border")}>
            <input type="radio" name="dsar-type" value={r.type} checked={type === r.type} onChange={() => setType(r.type)} className="accent-[var(--color-primary)]" />
            <r.icon aria-hidden className="size-4 text-primary" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-email`}>Email address</Label>
          <Input id={`${id}-email`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} required />
          {errors.email ? <FieldMessage tone="error">{errors.email}</FieldMessage> : <FieldMessage>We verify requests with this address.</FieldMessage>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-state`}>State (optional)</Label>
          <Input id={`${id}-state`} maxLength={2} placeholder="CA" value={state} onChange={(e) => setState(e.target.value.replace(/[^a-z]/gi, "").toUpperCase())} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-details`}>Details (optional)</Label>
        <textarea
          className="rounded-md border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={`${id}-details`}
          rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="For corrections, tell us what is wrong." />
      </div>
      {errors.form ? <FieldMessage tone="error">{errors.form}</FieldMessage> : null}
      <Button type="submit" loading={busy} className="self-start" data-testid="dsar-submit">
        Submit request
      </Button>
      <p className="text-xs text-text-muted">An authorized agent may submit on your behalf; we will ask for proof of authorization. We won&apos;t discriminate against you for exercising your rights.</p>
    </form>
  );
}

export function PrivacyChoicesView() {
  const { user } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <OptOutCard />
      <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="prefs-title">
        <h2 id="prefs-title" className="text-lg font-semibold">
          Cookie preferences
        </h2>
        <PreferencesForm onDone={() => undefined} />
      </section>
      <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="rights-title">
        <h2 id="rights-title" className="text-lg font-semibold">
          Access, delete or correct your data
        </h2>
        {user ? (
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <p className="text-text-muted">You&apos;re signed in, so you can act on your account data right away:</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/account/privacy">
                  <Download aria-hidden /> Export my data
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/account/privacy">
                  <Eraser aria-hidden /> Delete my account
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/account/settings">
                  <PencilLine aria-hidden /> Correct my profile
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <DsarForm />
          </div>
        )}
      </section>
      <p className="text-xs text-text-muted">
        Questions? See our <Link href="/legal/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link> or call/email the
        contact listed there. Draft — needs legal review.
      </p>
    </div>
  );
}
