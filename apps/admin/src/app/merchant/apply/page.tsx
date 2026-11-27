"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info, Store } from "lucide-react";
import { BusinessCategory, LocalSellerApplyRequest, type LocalSellerStatusResponse } from "@pricora/contracts";
import { Button, Checkbox, ErrorState, Input, Select, Skeleton } from "@pricora/ui";
import { errorMessage, getApi } from "@/lib/api";
import { useApiMutation } from "@/lib/mutation";
import { isMerchant } from "@/lib/roles";
import { BUSINESS_CATEGORY_LABEL, LISTING_POLICY, ZIP_GEO_NOTE, isNotAvailable } from "@/lib/local";
import { PageHeader } from "@/components/page-header";
import { Field, issuesToFieldErrors } from "@/components/field";
import { useSession } from "@/components/session-context";
import { LocalSellerStatus } from "@/components/local-seller-status";
import { StoreLocationFields, emptyLocationDraft, parseLocationDraft, type LocationDraft } from "@/components/store-location-fields";

export default function MerchantApplyPage() {
  const { user } = useSession();
  const merchant = isMerchant(user.role);
  // Existing merchants may already be local sellers: show their status instead of a second application.
  const existing = useQuery({
    queryKey: ["merchant", "local", "status"],
    queryFn: ({ signal }) => getApi().merchant.local.status({ signal }),
    enabled: merchant,
    retry: false,
  });
  const [result, setResult] = useState<LocalSellerStatusResponse | null>(null);

  const already = existing.data?.merchant.isLocalSeller ? existing.data : null;
  const shown = result ?? already;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="List your local store on WhichLess (free)"
        description="Shoppers near you see your in-store prices, stock and pickup options next to national retailers. We review every application before your store goes live."
      />
      {shown ? (
        <Submitted status={shown} justSubmitted={!!result} wasMerchant={merchant} />
      ) : merchant && existing.isLoading ? (
        <Skeleton className="h-60 w-full max-w-3xl" />
      ) : merchant && existing.error && !isNotAvailable(existing.error) ? (
        <ErrorState description={errorMessage(existing.error)} onRetry={() => void existing.refetch()} className="rounded-md border border-border bg-surface" />
      ) : merchant ? (
        // The API accepts applications only from accounts without a merchant profile (409 otherwise).
        <div className="flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-5 text-sm">
          <p className="font-medium">This account already has a merchant profile.</p>
          <p className="text-text-muted">You don’t need a separate application: add your physical stores under Store locations, then connect your store platform or upload a feed. {LISTING_POLICY}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/merchant/locations">Add store locations</Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href="/merchant">Merchant profile</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ApplyForm defaultEmail={user.email} onDone={setResult} />
      )}
    </div>
  );
}

function Submitted({ status, justSubmitted, wasMerchant }: { status: LocalSellerStatusResponse; justSubmitted: boolean; wasMerchant: boolean }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {justSubmitted ? (
        <div role="status" className="rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          Application received. Our team reviews new local sellers before their store appears on the site.
        </div>
      ) : (
        <p className="text-sm text-text-muted">This account is already registered as a local seller.</p>
      )}
      <LocalSellerStatus status={status} title="Your application" />
      <div className="flex flex-wrap items-center gap-3">
        {/* Full navigation on purpose: the merchant layout re-reads the (now MERCHANT) role from the API session. */}
        <Button asChild>
          <a href="/merchant">Go to the merchant dashboard</a>
        </Button>
        <Button asChild variant="secondary">
          <a href="/merchant/locations">Manage store locations</a>
        </Button>
      </div>
      {justSubmitted && !wasMerchant ? (
        <p className="text-xs text-text-muted">Your account was upgraded to a merchant account. If the dashboard still says “Access denied”, refresh the page.</p>
      ) : null}
    </div>
  );
}

function ApplyForm({ defaultEmail, onDone }: { defaultEmail: string; onDone: (s: LocalSellerStatusResponse) => void }) {
  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [businessPhone, setBusinessPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState<BusinessCategory | "">("");
  const [einLast4, setEinLast4] = useState("");
  const [location, setLocation] = useState<LocationDraft>(emptyLocationDraft());
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locErrors, setLocErrors] = useState<Record<string, string>>({});

  const apply = useApiMutation((body: LocalSellerApplyRequest) => getApi().merchant.local.apply(body), {
    success: "Application submitted",
    invalidate: [["merchant"]],
    onSuccess: (data) => onDone(data),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const loc = parseLocationDraft({ ...location, name: location.name.trim() || companyName.trim() });
    const parsed = LocalSellerApplyRequest.omit({ location: true }).safeParse({
      companyName,
      legalName,
      contactEmail: contactEmail.trim(),
      businessPhone,
      website: website.trim() || undefined,
      businessCategory: category || undefined,
      einLast4: einLast4.trim() || undefined,
      acceptTerms: terms,
    });
    const fe = parsed.success ? {} : issuesToFieldErrors(parsed.error.issues);
    if (fe.companyName) fe.companyName = "Enter your store or company name (2–120 characters).";
    if (fe.legalName) fe.legalName = "Enter the legal business name (2–160 characters).";
    if (fe.contactEmail) fe.contactEmail = "Enter a valid email address.";
    if (fe.businessPhone) fe.businessPhone = "Enter a phone number (at least 7 digits).";
    if (fe.website) fe.website = "Enter a full URL starting with https://, or leave empty.";
    if (fe.businessCategory) fe.businessCategory = "Choose the category that fits your store best.";
    if (fe.einLast4) fe.einLast4 = "Exactly 4 digits, or leave empty.";
    if (fe.acceptTerms) fe.acceptTerms = "You need to accept the seller terms to list your store.";
    setErrors(fe);
    setLocErrors(loc.ok ? {} : loc.errors);
    if (!parsed.success || !loc.ok) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    apply.mutate({ ...parsed.data, location: loc.data });
  }

  return (
    <form onSubmit={submit} noValidate className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5" aria-labelledby="biz-title">
          <h2 id="biz-title" className="text-md font-semibold">
            Business information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="a-company" label="Store / company name" required error={errors.companyName}>
              <Input id="a-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} invalid={!!errors.companyName} maxLength={120} />
            </Field>
            <Field id="a-legal" label="Legal business name" required error={errors.legalName} hint="As registered with your state.">
              <Input id="a-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} invalid={!!errors.legalName} maxLength={160} />
            </Field>
            <Field id="a-email" label="Contact email" required error={errors.contactEmail}>
              <Input id="a-email" type="email" autoComplete="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} invalid={!!errors.contactEmail} />
            </Field>
            <Field id="a-phone" label="Business phone" required error={errors.businessPhone}>
              <Input id="a-phone" type="tel" autoComplete="tel" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} invalid={!!errors.businessPhone} />
            </Field>
            <Field id="a-website" label="Website" error={errors.website} hint="Optional. https://…">
              <Input id="a-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} invalid={!!errors.website} />
            </Field>
            <Field id="a-category" label="Business category" required error={errors.businessCategory}>
              <Select id="a-category" value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory | "")} invalid={!!errors.businessCategory}>
                <option value="">Choose…</option>
                {BusinessCategory.options.map((c) => (
                  <option key={c} value={c}>
                    {BUSINESS_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="a-ein" label="EIN — last 4 digits" error={errors.einLast4} hint="Optional. Only the last 4 digits; we never ask for the full EIN.">
              <Input
                id="a-ein"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={einLast4}
                onChange={(e) => setEinLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                invalid={!!errors.einLast4}
                className="w-28 font-mono"
              />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5" aria-labelledby="loc-title">
          <div>
            <h2 id="loc-title" className="text-md font-semibold">
              First store location
            </h2>
            <p className="mt-1 text-xs text-text-muted">You can add more locations after your application is submitted. Store name defaults to your company name.</p>
          </div>
          <StoreLocationFields idPrefix="a-loc" draft={location} onChange={setLocation} errors={locErrors} />
          <p className="flex items-start gap-2 text-xs text-text-muted">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {ZIP_GEO_NOTE}
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-5">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={terms} onCheckedChange={(c) => setTerms(c === true)} aria-invalid={errors.acceptTerms ? true : undefined} className="mt-0.5" />
            <span>I accept the seller terms and listing policy, and confirm that I’m authorized to list this business and that prices and stock I provide are accurate.</span>
          </label>
          {errors.acceptTerms ? (
            <p role="alert" className="text-xs text-error">
              {errors.acceptTerms}
            </p>
          ) : null}
          <div>
            <Button type="submit" loading={apply.isPending}>
              Submit application
            </Button>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-md border border-primary/20 bg-primary-soft p-4 text-sm text-primary-soft-fg">
          <span className="flex items-center gap-2 font-medium">
            <Store className="size-4" aria-hidden /> Free listing
          </span>
          <p>{LISTING_POLICY}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 text-sm">
          <p className="font-medium">What happens next</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-text-muted">
            <li>We check your business details and address.</li>
            <li>Add products via a feed upload or connect Shopify, Square, Clover, WooCommerce or Google Merchant.</li>
            <li>After approval, your store appears in “Available nearby” for shoppers in your area.</li>
          </ol>
        </div>
      </aside>
    </form>
  );
}
