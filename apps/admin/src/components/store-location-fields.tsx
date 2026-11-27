"use client";

import { Checkbox, Input, Switch } from "@pricora/ui";
import { StoreLocationInput, type MerchantLocation } from "@pricora/contracts";
import { Field, issuesToFieldErrors } from "@/components/field";
import { WEEKDAYS, centsToDollars, defaultWeek, dollarsToCents, hoursFromWeek, weekFromHours, type DayHours } from "@/lib/local";

/** Form state for one store location (strings as typed; converted to the contract shape on submit). */
export interface LocationDraft {
  name: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  listHours: boolean;
  week: DayHours[];
  pickup: boolean;
  deliveryRadiusMiles: string;
  pickupMinimum: string;
  deliveryMinimum: string;
}

export function emptyLocationDraft(name = ""): LocationDraft {
  return {
    name,
    address1: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    listHours: true,
    week: defaultWeek(),
    pickup: true,
    deliveryRadiusMiles: "",
    pickupMinimum: "",
    deliveryMinimum: "",
  };
}

export function draftFromLocation(l: MerchantLocation): LocationDraft {
  return {
    name: l.name,
    address1: l.address1 ?? "",
    city: l.city ?? "",
    state: l.state ?? "",
    zip: l.zip,
    phone: l.phone ?? "",
    listHours: !!l.hours && l.hours.length > 0,
    week: weekFromHours(l.hours),
    pickup: l.pickup,
    deliveryRadiusMiles: l.deliveryRadiusMiles === null ? "" : String(l.deliveryRadiusMiles),
    pickupMinimum: centsToDollars(l.pickupMinimumCents),
    deliveryMinimum: centsToDollars(l.deliveryMinimumCents),
  };
}

const LOCATION_MESSAGES: Record<string, string> = {
  name: "Enter the store name (2–120 characters).",
  address1: "Enter the street address.",
  city: "Enter the city.",
  state: "Use the 2-letter state code, e.g. TX.",
  zip: "Enter a 5-digit US ZIP code.",
  phone: "Up to 30 characters.",
  deliveryRadiusMiles: "Whole miles, 0–100.",
  pickupMinimumCents: "Up to $10,000.",
  deliveryMinimumCents: "Up to $10,000.",
};

export type ParseResult = { ok: true; data: StoreLocationInput } | { ok: false; errors: Record<string, string> };

export function parseLocationDraft(d: LocationDraft): ParseResult {
  const errors: Record<string, string> = {};
  const pickupMinimumCents = dollarsToCents(d.pickupMinimum);
  const deliveryMinimumCents = dollarsToCents(d.deliveryMinimum);
  if (pickupMinimumCents === null) errors.pickupMinimumCents = "Enter a dollar amount like 10 or 12.50.";
  if (deliveryMinimumCents === null) errors.deliveryMinimumCents = "Enter a dollar amount like 25 or 30.00.";
  const radius = d.deliveryRadiusMiles.trim();
  if (radius && !/^\d+$/.test(radius)) errors.deliveryRadiusMiles = "Whole miles, 0–100.";
  if (d.listHours) {
    d.week.forEach((day, i) => {
      if (!day.closed && day.open >= day.close) errors.hours = `${WEEKDAYS[i]}: closing time must be after opening time.`;
    });
  }

  const parsed = StoreLocationInput.safeParse({
    name: d.name,
    address1: d.address1,
    city: d.city,
    state: d.state,
    zip: d.zip,
    phone: d.phone.trim() || undefined,
    hours: d.listHours ? hoursFromWeek(d.week) : undefined,
    pickup: d.pickup,
    deliveryRadiusMiles: radius && !errors.deliveryRadiusMiles ? Number(radius) : undefined,
    pickupMinimumCents: pickupMinimumCents ?? undefined,
    deliveryMinimumCents: deliveryMinimumCents ?? undefined,
  });
  if (!parsed.success) {
    const fe = issuesToFieldErrors(parsed.error.issues);
    for (const k of Object.keys(fe)) fe[k] = LOCATION_MESSAGES[k] ?? fe[k] ?? "Check this field.";
    Object.assign(errors, { ...fe, ...errors });
  }
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

export function StoreLocationFields({
  idPrefix,
  draft,
  onChange,
  errors,
}: {
  idPrefix: string;
  draft: LocationDraft;
  onChange: (next: LocationDraft) => void;
  errors: Record<string, string>;
}) {
  const set = <K extends keyof LocationDraft>(k: K, v: LocationDraft[K]) => onChange({ ...draft, [k]: v });
  const setDay = (i: number, patch: Partial<DayHours>) => set("week", draft.week.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <div className="flex flex-col gap-4">
      <Field id={id("name")} label="Store name" required error={errors.name} hint="As shoppers see it, e.g. “Main Street Market — Downtown”.">
        <Input id={id("name")} value={draft.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} maxLength={120} />
      </Field>
      <Field id={id("address1")} label="Street address" required error={errors.address1}>
        <Input id={id("address1")} autoComplete="address-line1" value={draft.address1} onChange={(e) => set("address1", e.target.value)} invalid={!!errors.address1} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_90px_130px]">
        <Field id={id("city")} label="City" required error={errors.city}>
          <Input id={id("city")} autoComplete="address-level2" value={draft.city} onChange={(e) => set("city", e.target.value)} invalid={!!errors.city} />
        </Field>
        <Field id={id("state")} label="State" required error={errors.state}>
          <Input
            id={id("state")}
            autoComplete="address-level1"
            value={draft.state}
            onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
            invalid={!!errors.state}
            placeholder="CA"
            maxLength={2}
          />
        </Field>
        <Field id={id("zip")} label="ZIP code" required error={errors.zip}>
          <Input id={id("zip")} autoComplete="postal-code" inputMode="numeric" value={draft.zip} onChange={(e) => set("zip", e.target.value)} invalid={!!errors.zip} maxLength={10} />
        </Field>
      </div>
      <Field id={id("phone")} label="Store phone" error={errors.phone}>
        <Input id={id("phone")} type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} invalid={!!errors.phone} />
      </Field>

      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Opening hours</legend>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={!draft.listHours} onCheckedChange={(c) => set("listHours", c !== true)} />
          Don’t list opening hours
        </label>
        {draft.listHours ? (
          <div className="flex flex-col gap-1.5">
            {draft.week.map((d, i) => (
              <div key={WEEKDAYS[i]} className="grid grid-cols-[96px_auto_minmax(0,1fr)] items-center gap-3 text-sm">
                <span>{WEEKDAYS[i]}</span>
                <label className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Switch checked={!d.closed} onCheckedChange={(open) => setDay(i, { closed: !open })} aria-label={`${WEEKDAYS[i]} open`} />
                  {d.closed ? "Closed" : "Open"}
                </label>
                {d.closed ? (
                  <span className="text-xs text-text-muted">—</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Input type="time" size="sm" value={d.open} onChange={(e) => setDay(i, { open: e.target.value })} aria-label={`${WEEKDAYS[i]} opens`} className="w-28" />
                    <span className="text-text-muted">to</span>
                    <Input type="time" size="sm" value={d.close} onChange={(e) => setDay(i, { close: e.target.value })} aria-label={`${WEEKDAYS[i]} closes`} className="w-28" />
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {errors.hours ? <p role="alert" className="text-xs text-error">{errors.hours}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Pickup & delivery</legend>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.pickup} onCheckedChange={(v) => set("pickup", v)} aria-label="In-store pickup" />
          Offers in-store pickup
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={id("radius")} label="Delivery radius (miles)" hint="Leave empty or 0 if you don’t deliver." error={errors.deliveryRadiusMiles}>
            <Input id={id("radius")} inputMode="numeric" value={draft.deliveryRadiusMiles} onChange={(e) => set("deliveryRadiusMiles", e.target.value)} invalid={!!errors.deliveryRadiusMiles} />
          </Field>
          <Field id={id("pmin")} label="Pickup minimum ($)" error={errors.pickupMinimumCents}>
            <Input id={id("pmin")} inputMode="decimal" placeholder="0.00" value={draft.pickupMinimum} onChange={(e) => set("pickupMinimum", e.target.value)} invalid={!!errors.pickupMinimumCents} />
          </Field>
          <Field id={id("dmin")} label="Delivery minimum ($)" error={errors.deliveryMinimumCents}>
            <Input id={id("dmin")} inputMode="decimal" placeholder="0.00" value={draft.deliveryMinimum} onChange={(e) => set("deliveryMinimum", e.target.value)} invalid={!!errors.deliveryMinimumCents} />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}
