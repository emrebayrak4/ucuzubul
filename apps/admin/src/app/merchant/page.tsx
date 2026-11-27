"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, ShieldAlert, ShieldQuestion } from "lucide-react";
import { UpdateMerchantProfileRequest, type MerchantProfile } from "@pricora/contracts";
import { Button, ErrorState, Input, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { dateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { LocalSellerStatus } from "@/components/local-seller-status";
import { isNotAvailable } from "@/lib/local";

const VERIFICATION: Record<MerchantProfile["verificationStatus"], { label: string; text: string; icon: typeof CheckCircle2; cls: string }> = {
  verified: { label: "Verified", text: "Your business is verified. Offers from your feeds are eligible to appear on the site.", icon: CheckCircle2, cls: "border-success/30 bg-success-soft text-success" },
  pending: { label: "Verification pending", text: "We are reviewing your business. You can upload feeds now; offers go live after verification.", icon: Clock, cls: "border-warning/30 bg-warning-soft text-warning" },
  unverified: { label: "Not verified", text: "Complete your profile (company name, contact email, website) to start verification.", icon: ShieldQuestion, cls: "border-border bg-surface-2 text-text" },
  rejected: { label: "Verification rejected", text: "Verification was rejected. Contact support to resolve it before offers can be listed.", icon: ShieldAlert, cls: "border-error/30 bg-error-soft text-error" },
};

export default function MerchantProfilePage() {
  const q = useQuery({ queryKey: ["merchant", "profile"], queryFn: ({ signal }) => getApi().merchant.profile({ signal }) });
  const v = q.data ? VERIFICATION[q.data.verificationStatus] : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Merchant profile" description="Your business details and verification status." />
      <LocalOnboardingCard />
      {q.error ? (
        <ErrorState description={errorMessage(q.error)} onRetry={() => void q.refetch()} className="rounded-md border border-border bg-surface" />
      ) : q.isLoading ? (
        <Skeleton className="h-40 w-full max-w-2xl" />
      ) : q.data && v ? (
        <div className="grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ProfileForm key={`${q.data.id}-${q.dataUpdatedAt}`} profile={q.data} />
          <aside className="flex flex-col gap-3">
            <div className={`flex flex-col gap-2 rounded-md border p-4 ${v.cls}`}>
              <span className="flex items-center gap-2 font-medium">
                <v.icon className="size-4" aria-hidden /> {v.label}
              </span>
              <p className="text-sm">{v.text}</p>
            </div>
            <dl className="rounded-md border border-border bg-surface p-4 text-sm">
              <dt className="text-xs text-text-muted">Linked retailer</dt>
              <dd className="mb-3">{q.data.retailer ? q.data.retailer.name : "Not linked yet (assigned during verification)"}</dd>
              <dt className="text-xs text-text-muted">Merchant since</dt>
              <dd>{dateTime(q.data.createdAt)}</dd>
            </dl>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/** Local seller onboarding checklist — only for local-seller accounts (the endpoint answers 404/409 otherwise → hidden). */
function LocalOnboardingCard() {
  const q = useQuery({
    queryKey: ["merchant", "local", "status"],
    queryFn: ({ signal }) => getApi().merchant.local.status({ signal }),
    retry: false,
  });
  if (q.isLoading) return null;
  if (q.error) {
    if (isNotAvailable(q.error)) return null;
    return (
      <p role="alert" className="max-w-4xl rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm text-error">
        Could not load local seller onboarding: {errorMessage(q.error)}
      </p>
    );
  }
  if (!q.data?.merchant.isLocalSeller) return null;
  return (
    <div className="max-w-4xl">
      <LocalSellerStatus status={q.data} />
    </div>
  );
}

function ProfileForm({ profile }: { profile: MerchantProfile }) {
  const [companyName, setCompanyName] = useState(profile.companyName);
  const [contactEmail, setContactEmail] = useState(profile.contactEmail);
  const [website, setWebsite] = useState(profile.website ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useApiMutation((body: UpdateMerchantProfileRequest) => getApi().merchant.updateProfile(body), {
    success: "Profile saved",
    invalidate: [["merchant", "profile"]],
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = UpdateMerchantProfileRequest.safeParse({
      companyName: companyName.trim(),
      contactEmail: contactEmail.trim(),
      website: website.trim() || null,
    });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5">
      <Field id="m-company" label="Company name" required error={errors.companyName}>
        <Input id="m-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} invalid={!!errors.companyName} />
      </Field>
      <Field id="m-email" label="Contact email" required error={errors.contactEmail}>
        <Input id="m-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} invalid={!!errors.contactEmail} />
      </Field>
      <Field id="m-website" label="Website" hint="https://…" error={errors.website}>
        <Input id="m-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} invalid={!!errors.website} />
      </Field>
      <div>
        <Button type="submit" loading={save.isPending}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
