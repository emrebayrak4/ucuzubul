"use client";

import { useState, type FormEvent } from "react";
import {
  AdminCreateCouponRequest,
  AdminUpdateCouponRequest,
  CouponDiscountType,
  CouponStatus,
  MerchantCreateCouponRequest,
  type AdminCoupon,
} from "@pricora/contracts";
import { parseMoneyToCents } from "@pricora/utils";
import { Input, Select } from "@pricora/ui";
import { COUPON_STATUS_LABEL, DISCOUNT_TYPE_LABEL, dateToIso, isoToDate } from "@/lib/coupons";
import { Field, issuesToFieldErrors } from "./field";

export type CouponFormResult =
  | { kind: "admin-create"; body: AdminCreateCouponRequest }
  | { kind: "admin-edit"; patch: AdminUpdateCouponRequest }
  | { kind: "merchant"; body: MerchantCreateCouponRequest };

interface CouponFormProps {
  id: string;
  mode: "admin-create" | "admin-edit" | "merchant";
  coupon?: AdminCoupon | null;
  /** Retailers for admin-create (id + name). */
  retailers?: { id: string; name: string }[];
  onSubmit: (r: CouponFormResult) => void;
}

function valueToInput(c: AdminCoupon | null | undefined): string {
  if (!c || c.discountValue == null) return "";
  if (c.discountType === "percent") return String(c.discountValue / 100);
  if (c.discountType === "amount") return (c.discountValue / 100).toFixed(2);
  return "";
}

/** Shared coupon editor. Contract units: percent → basis points, amount/min spend → cents, dates → ISO. */
export function CouponForm({ id, mode, coupon, retailers = [], onSubmit }: CouponFormProps) {
  const [retailerId, setRetailerId] = useState(coupon?.retailer.id ?? "");
  const [code, setCode] = useState(coupon?.code ?? "");
  const [title, setTitle] = useState(coupon?.title ?? "");
  const [description, setDescription] = useState(coupon?.description ?? "");
  const [discountType, setDiscountType] = useState<CouponDiscountType>(coupon?.discountType ?? "percent");
  const [value, setValue] = useState(valueToInput(coupon));
  const [minSpend, setMinSpend] = useState(coupon?.minSpendCents != null ? (coupon.minSpendCents / 100).toFixed(2) : "");
  const [startsAt, setStartsAt] = useState(isoToDate(coupon?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(isoToDate(coupon?.expiresAt ?? null));
  const [affiliateUrl, setAffiliateUrl] = useState(coupon?.affiliateUrl ?? "");
  const [status, setStatus] = useState<CouponStatus>(coupon?.status ?? "active");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const needsValue = discountType === "percent" || discountType === "amount";
  const isAdmin = mode !== "merchant";

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    let discountValue: number | null = null;
    if (needsValue) {
      if (discountType === "percent") {
        const n = Number(value);
        if (!value.trim() || !Number.isFinite(n) || n <= 0 || n > 100) errs.discountValue = "Enter a percentage between 0 and 100";
        else discountValue = Math.round(n * 100);
      } else {
        const cents = parseMoneyToCents(value);
        if (cents === null || cents <= 0) errs.discountValue = "Enter an amount like 10.00";
        else discountValue = cents;
      }
    }
    const minSpendCents = minSpend.trim() === "" ? null : parseMoneyToCents(minSpend);
    if (minSpend.trim() !== "" && (minSpendCents === null || minSpendCents < 0)) errs.minSpendCents = "Enter an amount like 50.00";
    const starts = dateToIso(startsAt, false);
    const expires = dateToIso(expiresAt, true);
    if (starts && expires && new Date(expires) < new Date(starts)) errs.expiresAt = "Expiry is before the start date";
    if (Object.keys(errs).length) return setErrors(errs);

    const fields = {
      code: code.trim() ? code.trim().toUpperCase() : null,
      title: title.trim(),
      description: description.trim() || null,
      discountType,
      discountValue,
      minSpendCents,
      startsAt: starts,
      expiresAt: expires,
    };

    if (mode === "merchant") {
      const parsed = MerchantCreateCouponRequest.safeParse(fields);
      if (!parsed.success) return setErrors(issuesToFieldErrors(parsed.error.issues));
      setErrors({});
      return onSubmit({ kind: "merchant", body: parsed.data });
    }
    const adminFields = { ...fields, affiliateUrl: affiliateUrl.trim() || null, status };
    if (mode === "admin-create") {
      const parsed = AdminCreateCouponRequest.safeParse({ ...adminFields, retailerId });
      if (!parsed.success) return setErrors(issuesToFieldErrors(parsed.error.issues));
      setErrors({});
      return onSubmit({ kind: "admin-create", body: parsed.data });
    }
    // admin-edit: PATCH only what changed.
    const c = coupon as AdminCoupon;
    const patch: AdminUpdateCouponRequest = {};
    if (adminFields.code !== c.code) patch.code = adminFields.code;
    if (adminFields.title !== c.title) patch.title = adminFields.title;
    if (adminFields.description !== c.description) patch.description = adminFields.description;
    if (adminFields.discountType !== c.discountType) patch.discountType = adminFields.discountType;
    if (adminFields.discountValue !== c.discountValue) patch.discountValue = adminFields.discountValue;
    if (adminFields.minSpendCents !== c.minSpendCents) patch.minSpendCents = adminFields.minSpendCents;
    if (isoToDate(adminFields.startsAt) !== isoToDate(c.startsAt)) patch.startsAt = adminFields.startsAt;
    if (isoToDate(adminFields.expiresAt) !== isoToDate(c.expiresAt)) patch.expiresAt = adminFields.expiresAt;
    if (adminFields.affiliateUrl !== c.affiliateUrl) patch.affiliateUrl = adminFields.affiliateUrl;
    if (adminFields.status !== c.status) patch.status = adminFields.status;
    const parsed = AdminUpdateCouponRequest.safeParse(patch);
    if (!parsed.success) return setErrors(issuesToFieldErrors(parsed.error.issues));
    setErrors({});
    onSubmit({ kind: "admin-edit", patch: parsed.data });
  }

  return (
    <form id={id} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {mode === "admin-create" ? (
        <div className="sm:col-span-2">
          <Field id={`${id}-retailer`} label="Store" required error={errors.retailerId}>
            <Select id={`${id}-retailer`} value={retailerId} onChange={(e) => setRetailerId(e.target.value)} invalid={!!errors.retailerId}>
              <option value="">Choose a store…</option>
              {retailers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      <Field id={`${id}-code`} label="Code" hint="Letters, digits, - and _. Empty = deal without a code." error={errors.code}>
        <Input id={`${id}-code`} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" maxLength={40} invalid={!!errors.code} />
      </Field>
      <Field id={`${id}-type`} label="Discount type" required>
        <Select id={`${id}-type`} value={discountType} onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}>
          {CouponDiscountType.options.map((t) => (
            <option key={t} value={t}>
              {DISCOUNT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field id={`${id}-title`} label="Title" required hint="e.g. “20% off sitewide”" error={errors.title}>
          <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} invalid={!!errors.title} />
        </Field>
      </div>
      {needsValue ? (
        <Field id={`${id}-value`} label={discountType === "percent" ? "Percent off" : "Amount off (USD)"} required error={errors.discountValue}>
          <Input id={`${id}-value`} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" invalid={!!errors.discountValue} />
        </Field>
      ) : null}
      <Field id={`${id}-min`} label="Minimum spend (USD)" hint="Empty = none" error={errors.minSpendCents}>
        <Input id={`${id}-min`} value={minSpend} onChange={(e) => setMinSpend(e.target.value)} inputMode="decimal" invalid={!!errors.minSpendCents} />
      </Field>
      <Field id={`${id}-start`} label="Starts" error={errors.startsAt}>
        <Input id={`${id}-start`} type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </Field>
      <Field id={`${id}-exp`} label="Expires" hint="End of day, your local time" error={errors.expiresAt}>
        <Input id={`${id}-exp`} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} invalid={!!errors.expiresAt} />
      </Field>
      <div className="sm:col-span-2">
        <Field id={`${id}-desc`} label="Terms / description" error={errors.description}>
          <textarea
            id={`${id}-desc`}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
          />
        </Field>
      </div>
      {isAdmin ? (
        <>
          <Field id={`${id}-aff`} label="Affiliate URL" hint="Optional tracked landing URL (allow-listed host)" error={errors.affiliateUrl}>
            <Input id={`${id}-aff`} type="url" value={affiliateUrl} onChange={(e) => setAffiliateUrl(e.target.value)} invalid={!!errors.affiliateUrl} />
          </Field>
          <Field id={`${id}-status`} label="Status">
            <Select id={`${id}-status`} value={status} onChange={(e) => setStatus(e.target.value as CouponStatus)}>
              {CouponStatus.options.map((s) => (
                <option key={s} value={s}>
                  {COUPON_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </>
      ) : null}
    </form>
  );
}
