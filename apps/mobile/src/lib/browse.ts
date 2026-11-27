import type { ConditionGroup, SearchFacets, SearchQueryInput, SearchSort } from "@pricora/contracts";
import { conditionGroupLabel, money } from "./format";

/** All filter state of a product listing (search, category, brand, store, popular, new…). Prices in cents. */
export interface BrowseFilters {
  minPrice?: number;
  maxPrice?: number;
  brand: string[];
  retailer: string[];
  /**
   * Condition groups. [] = API default (New only, so second-hand never wins the lowest price);
   * ["all"] = every condition.
   */
  condition: ConditionFilter[];
  spec: string[];
  inStock: boolean;
  freeShipping: boolean;
  /** Store offers pay-over-time (BNPL / financing) at checkout. */
  payOverTime: boolean;
  minDiscount?: number;
}

export type ConditionFilter = ConditionGroup | "all";
export const CONDITION_GROUPS: ConditionGroup[] = ["new", "open_box", "refurbished", "used"];

/** Groups in effect for a filter value ([] → New). */
export function effectiveConditions(c: ConditionFilter[]): ConditionGroup[] {
  if (c.includes("all")) return [...CONDITION_GROUPS];
  return c.length ? (c as ConditionGroup[]) : ["new"];
}

/** Toggle one group; clearing everything means "all", and New alone collapses back to the default []. */
export function toggleCondition(c: ConditionFilter[], g: ConditionGroup): ConditionFilter[] {
  const cur = effectiveConditions(c);
  const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g];
  if (next.length === 0 || next.length === CONDITION_GROUPS.length) return ["all"];
  if (next.length === 1 && next[0] === "new") return [];
  return CONDITION_GROUPS.filter((x) => next.includes(x));
}

export const EMPTY_FILTERS: BrowseFilters = { brand: [], retailer: [], condition: [], spec: [], inStock: false, freeShipping: false, payOverTime: false };

export const SORTS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "lowest_total", label: "Lowest total price" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "best_deal", label: "Best Deal Score" },
  { value: "biggest_drop", label: "Biggest price drop" },
  { value: "popular", label: "Most stores" },
  { value: "newest", label: "Newest" },
];

export const DISCOUNTS = [0.1, 0.25, 0.5] as const;

/** Fixed scope a screen imposes (category page, brand page…). The user can't remove it from the chips. */
export interface BrowseScope {
  q?: string;
  category?: string;
  brand?: string;
  retailer?: string;
}

export function toQuery(scope: BrowseScope, f: BrowseFilters, sort: SearchSort, pageSize = 24): SearchQueryInput {
  const brand = [...new Set([...(scope.brand ? [scope.brand] : []), ...f.brand])];
  const retailer = [...new Set([...(scope.retailer ? [scope.retailer] : []), ...f.retailer])];
  return {
    q: scope.q || undefined,
    category: scope.category,
    brand: brand.length ? brand.join(",") : undefined,
    retailer: retailer.length ? retailer.join(",") : undefined,
    minPrice: f.minPrice,
    maxPrice: f.maxPrice,
    condition: f.condition.length ? f.condition.join(",") : undefined,
    spec: f.spec.length ? f.spec.join(",") : undefined,
    inStock: f.inStock ? "true" : undefined,
    freeShipping: f.freeShipping ? "true" : undefined,
    payOverTime: f.payOverTime ? "true" : undefined,
    minDiscount: f.minDiscount,
    sort,
    pageSize,
  };
}

export function filterCount(f: BrowseFilters): number {
  return (
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    f.brand.length +
    f.retailer.length +
    (f.condition.length ? 1 : 0) +
    f.spec.length +
    (f.inStock ? 1 : 0) +
    (f.freeShipping ? 1 : 0) +
    (f.payOverTime ? 1 : 0) +
    (f.minDiscount ? 1 : 0)
  );
}

export interface AppliedChip {
  key: string;
  label: string;
  remove: (f: BrowseFilters) => BrowseFilters;
}

const without = <T>(arr: T[], v: T) => arr.filter((x) => x !== v);

/** Removable chips for every applied filter; labels come from facet buckets when available. */
export function appliedChips(f: BrowseFilters, facets: SearchFacets | undefined): AppliedChip[] {
  const label = (list: { value: string; label: string }[] | undefined, v: string) => list?.find((b) => b.value === v)?.label ?? v;
  const chips: AppliedChip[] = [];
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const lo = f.minPrice !== undefined ? money(f.minPrice, "USD", "auto") : "$0";
    const hi = f.maxPrice !== undefined ? money(f.maxPrice, "USD", "auto") : "any";
    chips.push({ key: "price", label: `${lo} – ${hi}`, remove: (x) => ({ ...x, minPrice: undefined, maxPrice: undefined }) });
  }
  for (const b of f.brand) chips.push({ key: `b:${b}`, label: label(facets?.brands, b), remove: (x) => ({ ...x, brand: without(x.brand, b) }) });
  for (const r of f.retailer)
    chips.push({ key: `r:${r}`, label: label(facets?.retailers, r), remove: (x) => ({ ...x, retailer: without(x.retailer, r) }) });
  if (f.condition.length)
    chips.push({
      key: "cond",
      label: f.condition.includes("all") ? "Any condition" : effectiveConditions(f.condition).map((g) => conditionGroupLabel[g]).join(" + "),
      remove: (x) => ({ ...x, condition: [] }),
    });
  for (const s of f.spec) {
    const [key] = s.split(".");
    const facet = facets?.specs.find((sf) => sf.key === key);
    const bucket = facet?.buckets.find((b) => b.value === s || `${key}.${b.value}` === s);
    chips.push({
      key: `s:${s}`,
      label: bucket ? `${facet?.label}: ${bucket.label}` : s,
      remove: (x) => ({ ...x, spec: without(x.spec, s) }),
    });
  }
  if (f.inStock) chips.push({ key: "stock", label: "In stock", remove: (x) => ({ ...x, inStock: false }) });
  if (f.freeShipping) chips.push({ key: "ship", label: "Free shipping", remove: (x) => ({ ...x, freeShipping: false }) });
  if (f.payOverTime) chips.push({ key: "pay", label: "Pay over time", remove: (x) => ({ ...x, payOverTime: false }) });
  if (f.minDiscount)
    chips.push({ key: "disc", label: `${Math.round(f.minDiscount * 100)}%+ off`, remove: (x) => ({ ...x, minDiscount: undefined }) });
  return chips;
}

/** Parses route params (from Home tiles / deep links) into initial filters. */
export function filtersFromParams(p: Record<string, string | undefined>): BrowseFilters {
  const num = (v: string | undefined) => {
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const list = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);
  return {
    ...EMPTY_FILTERS,
    minPrice: num(p.minPrice),
    maxPrice: num(p.maxPrice),
    brand: list(p.brand),
    retailer: list(p.retailer),
    condition: list(p.condition).filter((v): v is ConditionFilter => v === "all" || (CONDITION_GROUPS as string[]).includes(v)),
    spec: list(p.spec),
    inStock: p.inStock === "true",
    freeShipping: p.freeShipping === "true",
    payOverTime: p.payOverTime === "true",
    minDiscount: num(p.minDiscount),
  };
}

export function parseSort(v: string | undefined, fallback: SearchSort = "relevance"): SearchSort {
  return SORTS.some((s) => s.value === v) ? (v as SearchSort) : fallback;
}
