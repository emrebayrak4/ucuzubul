"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { FacetBucket, SearchFacets } from "@pricora/contracts";
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Separator,
  Sheet,
  SheetContent,
  SheetTitle,
  Switch,
  cn,
  formatPrice,
} from "@pricora/ui";

type Hide = Partial<Record<"category" | "brand" | "retailer", boolean>>;

function useParamUpdater() {
  const router = useRouter();
  const pathname = usePathname() ?? "/search";
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const update = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      const s = next.toString();
      start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { params, update, pending };
}

function toggleCsv(current: string | null, value: string): string | null {
  const set = new Set((current ?? "").split(",").filter(Boolean));
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? Array.from(set).join(",") : null;
}

function FacetList({
  title,
  buckets,
  paramKey,
  multi = true,
  max = 8,
}: {
  title: string;
  buckets: FacetBucket[];
  paramKey: string;
  multi?: boolean;
  max?: number;
}) {
  const { params, update } = useParamUpdater();
  const [expanded, setExpanded] = React.useState(false);
  if (!buckets.length) return null;
  const shown = expanded ? buckets : buckets.slice(0, max);
  const current = params.get(paramKey);
  return (
    <fieldset className="py-3">
      <legend className="mb-2 text-sm font-semibold text-text">{title}</legend>
      <ul className="space-y-1.5">
        {shown.map((b) => {
          const id = `f-${paramKey}-${b.value}`;
          const checked = multi ? (current ?? "").split(",").includes(b.value) : current === b.value;
          return (
            <li key={b.value} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={checked || b.selected}
                onCheckedChange={() => update({ [paramKey]: multi ? toggleCsv(current, b.value) : checked ? null : b.value })}
              />
              <Label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-sm font-normal">
                <span className="truncate">{b.label}</span>
                <span className="price text-xs text-text-muted">{b.count}</span>
              </Label>
            </li>
          );
        })}
      </ul>
      {buckets.length > max ? (
        <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show all ${buckets.length}`}
        </button>
      ) : null}
    </fieldset>
  );
}

function PriceFilter({ facets }: { facets: SearchFacets["price"] }) {
  const { params, update } = useParamUpdater();
  const toDollars = (v: string | null) => (v && /^\d+$/.test(v) ? String(Math.round(Number(v) / 100)) : "");
  const [min, setMin] = React.useState(toDollars(params.get("minPrice")));
  const [max, setMax] = React.useState(toDollars(params.get("maxPrice")));
  React.useEffect(() => {
    setMin(toDollars(params.get("minPrice")));
    setMax(toDollars(params.get("maxPrice")));
  }, [params]);
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const c = (d: string) => (d && /^\d+$/.test(d) ? String(Number(d) * 100) : null);
    update({ minPrice: c(min), maxPrice: c(max) });
  };
  return (
    <fieldset className="py-3">
      <legend className="mb-2 text-sm font-semibold text-text">Price</legend>
      <form onSubmit={apply} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="f-min" className="text-xs text-text-muted">
            Min $
          </Label>
          <Input id="f-min" size="sm" inputMode="numeric" value={min} placeholder={facets.minCents !== null ? String(Math.floor(facets.minCents / 100)) : "0"} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div className="flex-1">
          <Label htmlFor="f-max" className="text-xs text-text-muted">
            Max $
          </Label>
          <Input id="f-max" size="sm" inputMode="numeric" value={max} placeholder={facets.maxCents !== null ? String(Math.ceil(facets.maxCents / 100)) : "Any"} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Go
        </Button>
      </form>
      {facets.buckets.length ? (
        <ul className="mt-2 space-y-1">
          {facets.buckets.map((b) => {
            const active = params.get("minPrice") === String(b.fromCents) && (params.get("maxPrice") ?? "") === (b.toCents !== null ? String(b.toCents) : "");
            return (
              <li key={b.fromCents}>
                <button
                  type="button"
                  onClick={() => update({ minPrice: String(b.fromCents), maxPrice: b.toCents !== null ? String(b.toCents) : null })}
                  className={cn("flex w-full items-center justify-between rounded-sm px-1.5 py-1 text-left text-sm hover:bg-surface-2", active && "bg-primary-soft text-primary-soft-fg")}
                >
                  <span className="price">
                    {b.toCents !== null
                      ? `${formatPrice(b.fromCents, { trimZeroCents: true })} – ${formatPrice(b.toCents, { trimZeroCents: true })}`
                      : `${formatPrice(b.fromCents, { trimZeroCents: true })}+`}
                  </span>
                  <span className="price text-xs text-text-muted">{b.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}

function Toggles({ inStockCount }: { inStockCount: number }) {
  const { params, update } = useParamUpdater();
  return (
    <fieldset className="space-y-3 py-3">
      <legend className="sr-only">Availability</legend>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="f-instock" className="text-sm font-normal">
          In stock only <span className="price text-xs text-text-muted">({inStockCount})</span>
        </Label>
        <Switch id="f-instock" checked={params.get("inStock") === "true"} onCheckedChange={(c) => update({ inStock: c ? "true" : null })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="f-freeship" className="text-sm font-normal">
          Free shipping
        </Label>
        <Switch id="f-freeship" checked={params.get("freeShipping") === "true"} onCheckedChange={(c) => update({ freeShipping: c ? "true" : null })} />
      </div>
      <div>
        <Label htmlFor="f-discount" className="mb-1 block text-sm font-semibold">
          Discount
        </Label>
        <Select id="f-discount" size="sm" value={params.get("minDiscount") ?? ""} onChange={(e) => update({ minDiscount: e.target.value || null })}>
          <option value="">Any discount</option>
          <option value="0.1">10% or more below typical</option>
          <option value="0.2">20% or more</option>
          <option value="0.3">30% or more</option>
          <option value="0.5">50% or more</option>
        </Select>
      </div>
    </fieldset>
  );
}

function FilterBody({ facets, hide }: { facets: SearchFacets; hide: Hide }) {
  const { params, update } = useParamUpdater();
  const active = ["brand", "retailer", "minPrice", "maxPrice", "condition", "inStock", "freeShipping", "minDiscount", ...(hide.category ? [] : ["category"])].some((k) => params.get(k));
  return (
    <div className="divide-y divide-border">
      {active ? (
        <div className="pb-3">
          <Button
            variant="link"
            size="sm"
            onClick={() =>
              update({ brand: hide.brand ? params.get("brand") : null, retailer: hide.retailer ? params.get("retailer") : null, minPrice: null, maxPrice: null, condition: null, inStock: null, freeShipping: null, minDiscount: null, ...(hide.category ? {} : { category: null }) })
            }
          >
            Clear all filters
          </Button>
        </div>
      ) : null}
      {hide.category ? null : <FacetList title="Category" buckets={facets.categories} paramKey="category" multi={false} />}
      <PriceFilter facets={facets.price} />
      {hide.brand ? null : <FacetList title="Brand" buckets={facets.brands} paramKey="brand" />}
      {hide.retailer ? null : <FacetList title="Store" buckets={facets.retailers} paramKey="retailer" />}
      <FacetList title="Condition" buckets={facets.conditions} paramKey="condition" />
      <Toggles inStockCount={facets.inStockCount} />
    </div>
  );
}

export function SearchFilters({ facets, hide = {} }: { facets: SearchFacets; hide?: Hide }) {
  return (
    <React.Suspense fallback={null}>
      <aside aria-label="Filters" className="hidden w-60 shrink-0 lg:block" data-testid="search-filters">
        <FilterBody facets={facets} hide={hide} />
      </aside>
    </React.Suspense>
  );
}

export function MobileFilters({ facets, hide = {} }: { facets: SearchFacets; hide?: Hide }) {
  const [open, setOpen] = React.useState(false);
  return (
    <React.Suspense fallback={null}>
      <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden /> Filters
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-2">
          <SheetTitle>Filters</SheetTitle>
          <FilterBody facets={facets} hide={hide} />
          <Separator />
          <Button onClick={() => setOpen(false)} fullWidth>
            Show results
          </Button>
        </SheetContent>
      </Sheet>
    </React.Suspense>
  );
}

const sortOptions: Array<{ value: string; label: string }> = [
  { value: "relevance", label: "Best match" },
  { value: "lowest_total", label: "Lowest total price" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "best_deal", label: "Best deal" },
  { value: "biggest_drop", label: "Biggest price drop" },
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest" },
];

function SortSelectInner() {
  const { params, update, pending } = useParamUpdater();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sort" className="hidden text-sm text-text-muted sm:block">
        Sort
      </Label>
      <Select id="sort" size="sm" containerClassName="w-48" value={params.get("sort") ?? "relevance"} onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })} aria-busy={pending} data-testid="sort-select">
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
