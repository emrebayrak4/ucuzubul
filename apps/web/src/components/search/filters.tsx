"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import type { FacetBucket, SearchFacets } from "@pricora/contracts";
import { Button, Checkbox, Input, Label, Select, Sheet, SheetContent, SheetTitle, Switch, cn, formatPrice } from "@pricora/ui";
import { BrandMark } from "@/components/brand-mark";
import { startNavFeedback } from "@/lib/nav-feedback";

type Hide = Partial<Record<"category" | "brand" | "retailer", boolean>>;

/** Params owned by the filter UI (cleared by "Clear all", respecting fixed params on brand/store pages). */
const FILTER_PARAMS = ["brand", "retailer", "minPrice", "maxPrice", "condition", "inStock", "freeShipping", "payOverTime", "minDiscount", "spec", "category"] as const;

function useParamUpdater() {
  const router = useRouter();
  const pathname = usePathname() ?? "/search";
  const urlParams = useSearchParams();
  const [pending, start] = React.useTransition();
  // Optimistic: controls reflect the new value on click instead of after the server round trip (the URL — and so
  // the checkbox state — only changes when the navigation commits). Reverts automatically if it fails.
  const [params, setOptimisticParams] = React.useOptimistic<URLSearchParams | ReturnType<typeof useSearchParams>, URLSearchParams>(urlParams, (_current, next) => next);
  const update = React.useCallback(
    (changes: Record<string, string | null>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepPage) next.delete("page");
      const s = next.toString();
      startNavFeedback(null); // progress bar; the page stays (no skeleton) and the control already shows the new value
      start(() => {
        setOptimisticParams(next);
        router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router, setOptimisticParams],
  );
  return { params, update, pending };
}

function csvOf(v: string | null): string[] {
  return (v ?? "").split(",").filter(Boolean);
}

function toggleCsv(current: string | null, value: string): string | null {
  const set = new Set(csvOf(current));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? Array.from(set).join(",") : null;
}

const dollars = (c: number) => formatPrice(c, { trimZeroCents: true });

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Section({ title, children, defaultOpen = true, count }: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const id = React.useId();
  return (
    <fieldset className="min-w-0 py-3" data-testid="filter-section">
      <legend className="float-left w-full">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold text-text"
        >
          <span>
            {title}
            {count ? <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold text-primary-fg">{count}</span> : null}
          </span>
          <ChevronDown aria-hidden className={cn("size-4 text-text-muted transition-transform duration-fast", open && "rotate-180")} />
        </button>
      </legend>
      <div id={id} hidden={!open} className="clear-both pt-2">
        {children}
      </div>
    </fieldset>
  );
}

function CheckList({
  buckets,
  isChecked,
  onToggle,
  idPrefix,
  max = 8,
  searchable = false,
  logo,
}: {
  buckets: FacetBucket[];
  isChecked: (b: FacetBucket) => boolean;
  onToggle: (b: FacetBucket) => void;
  idPrefix: string;
  max?: number;
  searchable?: boolean;
  logo?: "brand" | "store";
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const list = filter ? buckets.filter((b) => b.label.toLowerCase().includes(filter.toLowerCase())) : buckets;
  // Selected values always stay visible above the fold.
  const shown = expanded || filter ? list : [...list.filter(isChecked), ...list.filter((b) => !isChecked(b))].slice(0, Math.max(max, list.filter(isChecked).length));
  return (
    <div>
      {searchable && buckets.length > 10 ? (
        <div className="relative mb-2">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-muted" />
          <Input size="sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" aria-label="Filter options" className="pl-7" />
        </div>
      ) : null}
      <ul className={cn("space-y-1", expanded && "max-h-72 overflow-y-auto pr-1")}>
        {shown.map((b) => {
          const id = `${idPrefix}-${b.value}`;
          const checked = isChecked(b);
          return (
            <li key={b.value} className="flex items-center gap-2">
              <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(b)} disabled={!checked && b.count === 0} />
              <Label htmlFor={id} className={cn("flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm font-normal", !checked && b.count === 0 && "opacity-50")}>
                <span className="flex min-w-0 items-center gap-2">
                  {logo === "store" ? <BrandMark name={b.label} logoUrl={b.logoUrl ?? null} brandColor={b.color ?? null} size="tile-xs" /> : null}
                  {logo === "brand" && b.logoUrl ? <BrandMark name={b.label} logoUrl={b.logoUrl} size="tile-xs" /> : null}
                  {/* Keep names on one vertical line when only some brands have a logo. */}
                  {logo === "brand" && !b.logoUrl && shown.some((x) => x.logoUrl) ? <span aria-hidden className="size-5 shrink-0" /> : null}
                  <span className="truncate">{b.label}</span>
                </span>
                <span className="price shrink-0 text-xs text-text-muted">{b.count}</span>
              </Label>
            </li>
          );
        })}
      </ul>
      {!filter && list.length > max ? (
        <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show all ${list.length}`}
        </button>
      ) : null}
      {filter && !list.length ? <p className="text-xs text-text-muted">No matches</p> : null}
    </div>
  );
}

function ParamCheckList({ title, buckets, paramKey, logo, searchable, max }: { title: string; buckets: FacetBucket[]; paramKey: string; logo?: "brand" | "store"; searchable?: boolean; max?: number }) {
  const { params, update } = useParamUpdater();
  if (!buckets.length) return null;
  const current = params.get(paramKey);
  const selected = csvOf(current);
  return (
    <Section title={title} count={selected.length}>
      <CheckList
        buckets={buckets}
        idPrefix={`f-${paramKey}`}
        isChecked={(b) => selected.includes(b.value)}
        onToggle={(b) => update({ [paramKey]: toggleCsv(current, b.value) })}
        logo={logo}
        searchable={searchable}
        max={max}
      />
    </Section>
  );
}

const ALL_CONDITIONS = ["new", "open_box", "refurbished", "used"];

/** Current condition selection: no param = New only (default), "all" = every condition. */
function selectedConditions(raw: string | null): string[] {
  if (!raw) return ["new"];
  const list = csvOf(raw);
  return list.includes("all") ? [...ALL_CONDITIONS] : list.filter((c) => ALL_CONDITIONS.includes(c));
}

function conditionParam(list: string[]): string | null {
  if (list.length === 1 && list[0] === "new") return null; // default
  if (!list.length || ALL_CONDITIONS.every((c) => list.includes(c))) return "all";
  return ALL_CONDITIONS.filter((c) => list.includes(c)).join(",");
}

/** Condition: New is selected by default so second-hand never wins "lowest price" unless the shopper asks. */
function ConditionFilter({ buckets }: { buckets: FacetBucket[] }) {
  const { params, update } = useParamUpdater();
  const selected = selectedConditions(params.get("condition"));
  if (!buckets.length) return null;
  return (
    <Section title="Condition" count={params.get("condition") ? selected.length : 0}>
      <CheckList
        buckets={buckets}
        idPrefix="f-condition"
        isChecked={(b) => selected.includes(b.value)}
        onToggle={(b) => update({ condition: conditionParam(selected.includes(b.value) ? selected.filter((c) => c !== b.value) : [...selected, b.value]) })}
        max={4}
      />
      <p className="mt-1.5 text-xs text-text-muted">Prices and sorting use only the conditions you pick.</p>
    </Section>
  );
}

function SpecFilters({ facets }: { facets: SearchFacets["specs"] }) {
  const { params, update } = useParamUpdater();
  const current = params.get("spec");
  const selected = csvOf(current);
  return (
    <>
      {facets.map((f, i) => {
        const n = f.buckets.filter((b) => selected.includes(b.value)).length;
        return (
          <Section key={f.key} title={f.label} count={n} defaultOpen={i < 5 || n > 0}>
            <CheckList
              buckets={f.buckets}
              idPrefix={`f-spec-${f.key}`}
              isChecked={(b) => selected.includes(b.value)}
              onToggle={(b) => update({ spec: toggleCsv(current, b.value) })}
              searchable
              max={6}
            />
          </Section>
        );
      })}
    </>
  );
}

/** Dual-thumb price slider over a histogram of the current result set (price filter ignored), plus inputs. */
function PriceRange({ price }: { price: SearchFacets["price"] }) {
  const { params, update } = useParamUpdater();
  const bins = price.histogram;
  const lo = bins[0]?.fromCents ?? 0;
  const hi = bins[bins.length - 1]?.toCents ?? 0;
  const step = Math.max(100, bins.length ? bins[0]!.toCents - bins[0]!.fromCents : 100) / 4;
  const parse = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const urlMin = parse(params.get("minPrice"));
  const urlMax = parse(params.get("maxPrice"));
  const [range, setRange] = React.useState<[number, number]>([urlMin ?? lo, urlMax ?? hi]);
  const [text, setText] = React.useState<[string, string]>([urlMin !== null ? String(Math.round(urlMin / 100)) : "", urlMax !== null ? String(Math.round(urlMax / 100)) : ""]);
  React.useEffect(() => {
    setRange([urlMin ?? lo, urlMax ?? hi]);
    setText([urlMin !== null ? String(Math.round(urlMin / 100)) : "", urlMax !== null ? String(Math.round(urlMax / 100)) : ""]);
  }, [urlMin, urlMax, lo, hi]);
  if (!bins.length || hi <= lo) return null;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const commit = (min: number, max: number) => update({ minPrice: min > lo ? String(Math.round(min / 100) * 100) : null, maxPrice: max < hi ? String(Math.round(max / 100) * 100) : null });
  const applyText = (e: React.FormEvent) => {
    e.preventDefault();
    const c = (d: string) => (d && /^\d+$/.test(d) ? String(Number(d) * 100) : null);
    update({ minPrice: c(text[0]), maxPrice: c(text[1]) });
  };
  const active = urlMin !== null || urlMax !== null;
  return (
    <Section title="Price" count={active ? 1 : 0}>
      <div className="px-1" data-testid="price-histogram">
        <div className="flex h-14 items-end gap-px" aria-hidden>
          {bins.map((b) => {
            const inRange = b.toCents > range[0] && b.fromCents < range[1];
            return (
              <div
                key={b.fromCents}
                title={`${dollars(b.fromCents)}–${dollars(b.toCents)}: ${b.count}`}
                className={cn("flex-1 rounded-t-[2px]", inRange ? "bg-primary" : "bg-border")}
                style={{ height: `${b.count ? Math.max(8, (b.count / maxCount) * 100) : 2}%` }}
              />
            );
          })}
        </div>
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
          <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary" style={{ left: `${pct(range[0])}%`, right: `${100 - pct(range[1])}%` }} />
          <input
            type="range"
            aria-label="Minimum price"
            min={lo}
            max={hi}
            step={step}
            value={range[0]}
            onChange={(e) => setRange([Math.min(Number(e.target.value), range[1] - step), range[1]])}
            onPointerUp={() => commit(range[0], range[1])}
            onKeyUp={() => commit(range[0], range[1])}
            className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-ring"
          />
          <input
            type="range"
            aria-label="Maximum price"
            min={lo}
            max={hi}
            step={step}
            value={range[1]}
            onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + step)])}
            onPointerUp={() => commit(range[0], range[1])}
            onKeyUp={() => commit(range[0], range[1])}
            className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-surface focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-ring"
          />
        </div>
        <p className="price mt-1 flex justify-between text-xs text-text-muted">
          <span>{dollars(range[0])}</span>
          <span>{range[1] >= hi ? `${dollars(hi)}+` : dollars(range[1])}</span>
        </p>
      </div>
      <form onSubmit={applyText} className="mt-2 flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="f-min" className="text-xs text-text-muted">
            Min $
          </Label>
          <Input id="f-min" size="sm" inputMode="numeric" value={text[0]} placeholder={String(Math.floor(lo / 100))} onChange={(e) => setText([e.target.value.replace(/\D/g, ""), text[1]])} />
        </div>
        <div className="flex-1">
          <Label htmlFor="f-max" className="text-xs text-text-muted">
            Max $
          </Label>
          <Input id="f-max" size="sm" inputMode="numeric" value={text[1]} placeholder={String(Math.ceil(hi / 100))} onChange={(e) => setText([text[0], e.target.value.replace(/\D/g, "")])} />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Go
        </Button>
      </form>
    </Section>
  );
}

function Availability({ facets }: { facets: SearchFacets }) {
  const { params, update } = useParamUpdater();
  const payRaw = params.get("payOverTime");
  const payParam = payRaw === "true" ? "any" : payRaw;
  const discount = params.get("minDiscount") ?? "";
  return (
    <Section title="Availability & deals" count={["inStock", "freeShipping", "payOverTime", "minDiscount"].filter((k) => params.get(k)).length}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-instock" className="text-sm font-normal">
            In stock <span className="price text-xs text-text-muted">({facets.inStockCount})</span>
          </Label>
          <Switch id="f-instock" checked={params.get("inStock") === "true"} onCheckedChange={(c) => update({ inStock: c ? "true" : null })} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="f-freeship" className="text-sm font-normal">
            Free shipping <span className="price text-xs text-text-muted">({facets.freeShippingCount})</span>
          </Label>
          <Switch id="f-freeship" checked={params.get("freeShipping") === "true"} onCheckedChange={(c) => update({ freeShipping: c ? "true" : null })} />
        </div>
        <fieldset data-testid="filter-pay-over-time">
          <legend className="mb-1 text-xs font-semibold text-text-muted" title="Buy now, pay later or financing offered by the store at checkout, subject to approval.">
            Pay over time
          </legend>
          {(
            [
              ["payin4", "Interest-free pay in 4", facets.payIn4Count ?? 0, "4 interest-free payments at checkout, subject to approval by the provider"],
              ["any", "Any financing option", facets.payOverTimeCount ?? 0, "Pay in 4, monthly financing or store-card financing, subject to approval"],
            ] as const
          ).map(([value, label, count, hint]) => {
            const id = `f-pay-${value}`;
            const checked = payParam === value;
            return (
              <div key={value} className="flex items-center gap-2 py-0.5">
                <Checkbox id={id} checked={checked} onCheckedChange={() => update({ payOverTime: checked ? null : value })} disabled={!checked && count === 0} />
                <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm font-normal" title={hint}>
                  <span className="truncate">{label}</span>
                  <span className="price shrink-0 text-xs text-text-muted">{count}</span>
                </Label>
              </div>
            );
          })}
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-text-muted">Below its 30-day typical price</legend>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["", "Any"],
              ["0.1", "10%+"],
              ["0.2", "20%+"],
              ["0.3", "30%+"],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={discount === v}
                onClick={() => update({ minDiscount: v || null })}
                className={cn("h-7 rounded-full border px-2.5 text-xs font-medium", discount === v ? "border-primary bg-primary-soft text-primary-soft-fg" : "border-border bg-surface hover:bg-surface-2")}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Section>
  );
}

function FilterBody({ facets, hide }: { facets: SearchFacets; hide: Hide }) {
  return (
    <div className="divide-y divide-border">
      {hide.category ? null : <ParamCheckList title="Category" buckets={facets.categories.slice(0, 30)} paramKey="category" max={8} />}
      <PriceRange price={facets.price} />
      {hide.brand ? null : <ParamCheckList title="Brand" buckets={facets.brands} paramKey="brand" logo="brand" searchable />}
      <SpecFilters facets={facets.specs} />
      {hide.retailer ? null : <ParamCheckList title="Store" buckets={facets.retailers} paramKey="retailer" logo="store" searchable max={6} />}
      <ConditionFilter buckets={facets.conditions} />
      <Availability facets={facets} />
    </div>
  );
}

export function SearchFilters({ facets, hide = {} }: { facets: SearchFacets; hide?: Hide }) {
  return (
    <React.Suspense fallback={null}>
      <aside aria-label="Filters" className="hidden w-64 shrink-0 lg:block" data-testid="search-filters">
        <div className="sticky top-[calc(var(--pc-header-h)+1rem)] max-h-[calc(100dvh-var(--pc-header-h)-2rem)] overflow-y-auto rounded-md border border-border bg-surface px-4 py-1">
          <FilterBody facets={facets} hide={hide} />
        </div>
      </aside>
    </React.Suspense>
  );
}

function MobileFiltersInner({ facets, hide = {}, total }: { facets: SearchFacets; hide?: Hide; total: number }) {
  const [open, setOpen] = React.useState(false);
  const { params, pending } = useParamUpdater();
  const n = FILTER_PARAMS.filter((k) => !(k === "category" && hide.category) && params.get(k)).reduce((acc, k) => acc + (k === "spec" || k === "brand" || k === "retailer" ? csvOf(params.get(k)).length : 1), 0);
  return (
    <>
      <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOpen(true)} data-testid="mobile-filters-button">
        <SlidersHorizontal aria-hidden /> Filters{n ? ` (${n})` : ""}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="flex max-h-[88dvh] flex-col gap-0 p-0" data-testid="mobile-filter-sheet">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <SheetTitle>Filters</SheetTitle>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            <FilterBody facets={facets} hide={hide} />
          </div>
          <div className="border-t border-border p-3">
            <Button onClick={() => setOpen(false)} fullWidth aria-busy={pending}>
              {pending ? "Updating…" : `Show results (${total.toLocaleString("en-US")})`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function MobileFilters(props: { facets: SearchFacets; hide?: Hide; total: number }) {
  return (
    <React.Suspense fallback={null}>
      <MobileFiltersInner {...props} />
    </React.Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Applied-filter chips                                                */
/* ------------------------------------------------------------------ */

function AppliedFiltersInner({ facets, hide = {} }: { facets: SearchFacets; hide?: Hide }) {
  const { params, update } = useParamUpdater();
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const labelOf = (list: FacetBucket[], v: string) => list.find((b) => b.value === v)?.label ?? v;
  if (!hide.category && params.get("category")) {
    const v = params.get("category")!;
    chips.push({ key: "category", label: labelOf(facets.categories, v), remove: () => update({ category: null }) });
  }
  if (!hide.brand) for (const v of csvOf(params.get("brand"))) chips.push({ key: `b-${v}`, label: labelOf(facets.brands, v), remove: () => update({ brand: toggleCsv(params.get("brand"), v) }) });
  if (!hide.retailer) for (const v of csvOf(params.get("retailer"))) chips.push({ key: `r-${v}`, label: labelOf(facets.retailers, v), remove: () => update({ retailer: toggleCsv(params.get("retailer"), v) }) });
  for (const v of csvOf(params.get("spec"))) {
    const facet = facets.specs.find((f) => v.startsWith(`${f.key}.`));
    const label = facet ? `${facet.label}: ${labelOf(facet.buckets, v)}` : v.replace(".", ": ");
    chips.push({ key: `s-${v}`, label, remove: () => update({ spec: toggleCsv(params.get("spec"), v) }) });
  }
  const min = params.get("minPrice");
  const max = params.get("maxPrice");
  if (min || max) {
    const f = (c: string) => dollars(Number(c));
    chips.push({ key: "price", label: min && max ? `${f(min)} – ${f(max)}` : min ? `Over ${f(min)}` : `Under ${f(max!)}`, remove: () => update({ minPrice: null, maxPrice: null }) });
  }
  {
    const cur = selectedConditions(params.get("condition"));
    if (cur.length < 4) {
      for (const v of cur) {
        chips.push({ key: `c-${v}`, label: labelOf(facets.conditions, v), remove: () => update({ condition: conditionParam(cur.filter((c) => c !== v)) }) });
      }
    }
  }
  if (params.get("inStock") === "true") chips.push({ key: "stock", label: "In stock", remove: () => update({ inStock: null }) });
  if (params.get("freeShipping") === "true") chips.push({ key: "ship", label: "Free shipping", remove: () => update({ freeShipping: null }) });
  const pay = params.get("payOverTime");
  if (pay) chips.push({ key: "pay", label: pay === "payin4" ? "Interest-free pay in 4" : "Any financing option", remove: () => update({ payOverTime: null }) });
  if (params.get("minDiscount")) chips.push({ key: "disc", label: `${Math.round(Number(params.get("minDiscount")) * 100)}%+ below typical`, remove: () => update({ minDiscount: null }) });
  if (!chips.length) return null;
  const clearAll = () => {
    const changes: Record<string, string | null> = {};
    for (const k of FILTER_PARAMS) {
      if ((k === "category" && hide.category) || (k === "brand" && hide.brand) || (k === "retailer" && hide.retailer)) continue;
      changes[k] = null;
    }
    update(changes);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="applied-filters">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.remove}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary-soft pl-2.5 pr-1.5 text-xs font-medium text-primary-soft-fg hover:border-primary"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <X aria-hidden className="size-3.5" />
        </button>
      ))}
      <button type="button" onClick={clearAll} className="ml-1 text-xs font-semibold text-primary hover:underline" data-testid="clear-all-filters">
        Clear all
      </button>
    </div>
  );
}

export function AppliedFilters(props: { facets: SearchFacets; hide?: Hide }) {
  return (
    <React.Suspense fallback={null}>
      <AppliedFiltersInner {...props} />
    </React.Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Sort + view                                                         */
/* ------------------------------------------------------------------ */

const sortOptions: Array<{ value: string; label: string }> = [
  { value: "relevance", label: "Best match" },
  { value: "popular", label: "Most stores" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "lowest_total", label: "Lowest total price" },
  { value: "best_deal", label: "Best Deal Score" },
  { value: "biggest_drop", label: "Biggest price drop" },
  { value: "newest", label: "Newly added" },
];

function SortSelectInner() {
  const { params, update, pending } = useParamUpdater();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sort" className="hidden text-sm text-text-muted sm:block">
        Sort
      </Label>
      <Select id="sort" size="sm" containerClassName="w-44" value={params.get("sort") ?? "relevance"} onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })} aria-busy={pending} data-testid="sort-select">
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function SortSelect() {
  return (
    <React.Suspense fallback={null}>
      <SortSelectInner />
    </React.Suspense>
  );
}

function ViewToggleInner() {
  const { params, update } = useParamUpdater();
  const view = params.get("view") === "list" ? "list" : "grid";
  const item = (v: "grid" | "list", Icon: typeof List, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      onClick={() => update({ view: v === "grid" ? null : "list" }, { keepPage: true })}
      className={cn("inline-flex size-8 items-center justify-center rounded-sm text-text-muted hover:text-text", view === v && "bg-surface text-text shadow-xs")}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
  return (
    <div className="hidden gap-0.5 rounded-md bg-surface-2 p-0.5 sm:inline-flex" data-testid="view-toggle">
      {item("grid", LayoutGrid, "Grid view")}
      {item("list", List, "List view")}
    </div>
  );
}

export function ViewToggle() {
  return (
    <React.Suspense fallback={null}>
      <ViewToggleInner />
    </React.Suspense>
  );
}
