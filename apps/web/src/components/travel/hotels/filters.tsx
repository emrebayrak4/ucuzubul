"use client";

import * as React from "react";
import { ChevronDown, Star, X } from "lucide-react";
import {
  BOARD_TYPE_LABELS,
  HOTEL_ACCESSIBILITY_LABELS,
  HOTEL_AMENITY_LABELS,
  HOTEL_PROPERTY_TYPE_LABELS,
  type BoardType,
  type HotelFacetBucket,
  type HotelFacets,
  type HotelPropertyType,
} from "@pricora/contracts";
import { cn } from "@pricora/ui";
import { PriceHistogram } from "./price-histogram";
import { fmtUsd, useHotelParams } from "./url-state";

/** Amenities shown first (the rest collapse behind "Show all"). */
const POPULAR_AMENITIES = ["wifi", "parking", "pool", "fitness_center", "spa", "pets", "airport_shuttle", "ev_charging", "kitchen", "breakfast", "restaurant", "air_conditioning"];

function Section({ title, children, defaultOpen = true, testId }: { title: string; children: React.ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <section className="border-b border-border py-4 last:border-b-0" data-testid={testId}>
      <h3>
        <button type="button" className="flex w-full items-center justify-between text-left text-sm font-bold" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {title}
          <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </h3>
      <div id={id} hidden={!open} className="mt-3">
        {children}
      </div>
    </section>
  );
}

function CheckRow({ label, count, checked, onChange, disabled, children }: { label: string; count?: number; checked: boolean; onChange: () => void; disabled?: boolean; children?: React.ReactNode }) {
  const isDisabled = disabled ?? (!checked && count === 0);
  return (
    <label className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm py-1 text-sm", isDisabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="size-[18px] shrink-0 accent-[var(--color-hotels)]" checked={checked} disabled={isDisabled} onChange={onChange} />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">{children ?? label}</span>
      {count !== undefined ? <span className="price text-xs text-text-muted">{count}</span> : null}
    </label>
  );
}

function BucketList({ buckets, selected, onToggle, labelFor, max = 8, testId }: { buckets: HotelFacetBucket[]; selected: string[]; onToggle: (v: string) => void; labelFor?: (b: HotelFacetBucket) => React.ReactNode; max?: number; testId?: string }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? buckets : buckets.slice(0, max);
  if (buckets.length === 0) return <p className="text-sm text-text-muted">No options for this search.</p>;
  return (
    <div data-testid={testId}>
      <ul>
        {shown.map((b) => (
          <li key={b.value}>
            <CheckRow label={b.label} count={b.count} checked={selected.includes(b.value)} onChange={() => onToggle(b.value)}>
              {labelFor ? labelFor(b) : undefined}
            </CheckRow>
          </li>
        ))}
      </ul>
      {buckets.length > max ? (
        <button type="button" className="mt-1 text-sm font-semibold text-hotels-soft-fg hover:underline" onClick={() => setAll((a) => !a)}>
          {all ? "Show less" : `Show all ${buckets.length}`}
        </button>
      ) : null}
    </div>
  );
}

export function HotelFilters({ facets, total, onDone }: { facets: HotelFacets; total: number; onDone?: () => void }) {
  const { sp, update, list, toggleIn, clearFilters, pending } = useHotelParams();
  const num = (k: string) => {
    const v = sp.get(k);
    return v ? Number(v) : undefined;
  };
  const amenities = [...facets.amenities].sort((a, b) => {
    const ia = POPULAR_AMENITIES.indexOf(a.value);
    const ib = POPULAR_AMENITIES.indexOf(b.value);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || b.count - a.count;
  });

  return (
    <div aria-busy={pending} data-testid="hotel-filters">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-md font-extrabold">Filter by</h2>
        <button type="button" onClick={clearFilters} className="text-sm font-semibold text-hotels-soft-fg hover:underline">
          Clear all
        </button>
      </div>

      <Section title="Your budget (per night)" testId="filter-price">
        {facets.price ? (
          <PriceHistogram price={facets.price} min={num("minPrice")} max={num("maxPrice")} onCommit={(lo, hi) => update({ minPrice: lo === null ? null : String(lo), maxPrice: hi === null ? null : String(hi) })} />
        ) : (
          <p className="text-sm text-text-muted">No prices for these dates.</p>
        )}
      </Section>

      <Section title="Popular">
        <CheckRow label="Free cancellation" count={facets.freeCancellation} checked={sp.get("freeCancellation") === "1"} onChange={() => update({ freeCancellation: sp.get("freeCancellation") === "1" ? null : "1" })} />
        <CheckRow label="Pay at the property" count={facets.payAtProperty} checked={sp.get("payAtProperty") === "1"} onChange={() => update({ payAtProperty: sp.get("payAtProperty") === "1" ? null : "1" })} />
        {facets.meals.find((m) => m.value === "breakfast") ? (
          <CheckRow label="Breakfast included" count={facets.meals.find((m) => m.value === "breakfast")?.count} checked={list("meals").includes("breakfast")} onChange={() => toggleIn("meals", "breakfast")} />
        ) : null}
      </Section>

      <Section title="Property type" testId="filter-types">
        <BucketList buckets={facets.propertyTypes} selected={list("types")} onToggle={(v) => toggleIn("types", v)} labelFor={(b) => HOTEL_PROPERTY_TYPE_LABELS[b.value as HotelPropertyType] ?? b.label} />
      </Section>

      <Section title="Property class" testId="filter-stars">
        <BucketList
          buckets={facets.stars}
          selected={list("stars")}
          onToggle={(v) => toggleIn("stars", v)}
          labelFor={(b) =>
            b.value === "0" ? (
              "Unrated"
            ) : (
              <span className="inline-flex items-center gap-1" title="Official/hotel-declared star class — not a guest rating">
                {b.value}
                <Star aria-hidden className="size-3.5 fill-warning text-warning" />
                <span className="sr-only">stars</span>
              </span>
            )
          }
        />
      </Section>

      <Section title="Distance from center">
        <ul>
          {facets.distance.map((b) => (
            <li key={b.value}>
              <CheckRow label={b.label} count={b.count} checked={sp.get("maxDistanceKm") === b.value} onChange={() => update({ maxDistanceKm: sp.get("maxDistanceKm") === b.value ? null : b.value })} />
            </li>
          ))}
        </ul>
        {facets.distance.length === 0 ? <p className="text-sm text-text-muted">No location data.</p> : null}
      </Section>

      <Section title="Neighborhood" testId="filter-neighborhoods">
        <BucketList buckets={facets.neighborhoods} selected={list("neighborhoods")} onToggle={(v) => toggleIn("neighborhoods", v)} />
      </Section>

      <Section title="Facilities" testId="filter-amenities">
        <BucketList buckets={amenities} selected={list("amenities")} onToggle={(v) => toggleIn("amenities", v)} labelFor={(b) => HOTEL_AMENITY_LABELS[b.value] ?? b.label} max={10} />
      </Section>

      <Section title="Meals">
        <BucketList buckets={facets.meals} selected={list("meals")} onToggle={(v) => toggleIn("meals", v)} labelFor={(b) => BOARD_TYPE_LABELS[b.value as BoardType] ?? b.label} />
      </Section>

      <Section title="Accessibility" defaultOpen={false}>
        <BucketList buckets={facets.accessibility} selected={list("accessibility")} onToggle={(v) => toggleIn("accessibility", v)} labelFor={(b) => HOTEL_ACCESSIBILITY_LABELS[b.value] ?? b.label} />
      </Section>

      <Section title="Chain / brand" defaultOpen={false}>
        <BucketList buckets={facets.chains} selected={list("chains")} onToggle={(v) => toggleIn("chains", v)} />
      </Section>

      {onDone ? (
        <div className="sticky bottom-0 -mx-6 mt-2 border-t border-border bg-surface px-6 pt-3">
          <button type="button" onClick={onDone} className="h-12 w-full rounded-md bg-hotels text-md font-bold text-hotels-fg" data-testid="filters-done">
            Show {total} {total === 1 ? "property" : "properties"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Applied filter chips (removable), shown above results. */
export function AppliedChips() {
  const { sp, update, list, toggleIn, clearFilters } = useHotelParams();
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  const minP = sp.get("minPrice");
  const maxP = sp.get("maxPrice");
  if (minP || maxP) chips.push({ key: "price", label: `${minP ? fmtUsd(Number(minP)) : "Any"} – ${maxP ? fmtUsd(Number(maxP)) : "any"} / night`, remove: () => update({ minPrice: null, maxPrice: null }) });
  if (sp.get("freeCancellation") === "1") chips.push({ key: "fc", label: "Free cancellation", remove: () => update({ freeCancellation: null }) });
  if (sp.get("payAtProperty") === "1") chips.push({ key: "pap", label: "Pay at the property", remove: () => update({ payAtProperty: null }) });
  if (sp.get("maxDistanceKm")) chips.push({ key: "dist", label: `< ${sp.get("maxDistanceKm")} km from center`, remove: () => update({ maxDistanceKm: null }) });
  if (sp.get("minStars")) chips.push({ key: "minStars", label: `${sp.get("minStars")}+ stars`, remove: () => update({ minStars: null }) });
  if (sp.get("bbox")) chips.push({ key: "bbox", label: "Map area", remove: () => update({ bbox: null }) });
  const multi: Array<[string, (v: string) => string]> = [
    ["types", (v) => HOTEL_PROPERTY_TYPE_LABELS[v as HotelPropertyType] ?? v],
    ["stars", (v) => (v === "0" ? "Unrated" : `${v} stars`)],
    ["amenities", (v) => HOTEL_AMENITY_LABELS[v] ?? v],
    ["meals", (v) => BOARD_TYPE_LABELS[v as BoardType] ?? v],
    ["neighborhoods", (v) => v],
    ["accessibility", (v) => HOTEL_ACCESSIBILITY_LABELS[v] ?? v],
    ["chains", (v) => (v === "independent" ? "Independent" : v)],
  ];
  for (const [key, label] of multi) for (const v of list(key)) chips.push({ key: `${key}:${v}`, label: label(v), remove: () => toggleIn(key, v) });
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Applied filters" data-testid="applied-chips">
      {chips.map((c) => (
        <li key={c.key}>
          <button type="button" onClick={c.remove} className="inline-flex h-8 items-center gap-1 rounded-full border border-hotels bg-hotels-soft pl-3 pr-2 text-sm font-semibold text-hotels-soft-fg hover:bg-hotels-soft/70" aria-label={`Remove filter: ${c.label}`}>
            {c.label}
            <X aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
      <li>
        <button type="button" onClick={clearFilters} className="h-8 px-2 text-sm font-semibold text-text-muted hover:text-text hover:underline">
          Clear all
        </button>
      </li>
    </ul>
  );
}
