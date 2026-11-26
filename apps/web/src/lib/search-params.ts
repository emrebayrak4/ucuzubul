import { SearchSort, type SearchQueryInput } from "@pricora/contracts";
import { first, type SearchParams } from "./nav";

/** URL keys that the search UI owns (prices are integer cents, discount is a 0–1 ratio — same as the API). */
export const FILTER_KEYS = ["q", "category", "brand", "retailer", "minPrice", "maxPrice", "condition", "inStock", "freeShipping", "minDiscount", "sort", "page"] as const;

const CONDITIONS = new Set(["new", "refurbished", "used", "open_box"]);

function int(v: string | undefined): number | undefined {
  if (!v || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : undefined;
}

function csv(v: string | undefined): string[] | undefined {
  const list = v?.split(",").map((s) => s.trim()).filter(Boolean);
  return list && list.length ? list.slice(0, 20) : undefined;
}

export function parseSearchParams(sp: SearchParams, fixed: Partial<SearchQueryInput> = {}): SearchQueryInput {
  const sortRaw = first(sp.sort);
  const sort = SearchSort.safeParse(sortRaw);
  const minDiscount = Number(first(sp.minDiscount));
  const conditions = csv(first(sp.condition))?.filter((c) => CONDITIONS.has(c)) as SearchQueryInput["condition"];
  const q: SearchQueryInput = {
    q: first(sp.q)?.slice(0, 200) || undefined,
    category: first(sp.category) || undefined,
    brand: csv(first(sp.brand)),
    retailer: csv(first(sp.retailer)),
    minPrice: int(first(sp.minPrice)),
    maxPrice: int(first(sp.maxPrice)),
    condition: conditions && (conditions as string[]).length ? conditions : undefined,
    inStock: first(sp.inStock) === "true" ? true : undefined,
    freeShipping: first(sp.freeShipping) === "true" ? true : undefined,
    minDiscount: Number.isFinite(minDiscount) && minDiscount > 0 && minDiscount < 1 ? minDiscount : undefined,
    sort: sort.success ? sort.data : undefined,
    page: Math.max(1, Math.min(500, int(first(sp.page)) ?? 1)),
    pageSize: 24,
  };
  return { ...q, ...fixed };
}

/** True when the URL has any filter/sort beyond pagination → facet page, keep out of the index. */
export function hasFacetParams(sp: SearchParams): boolean {
  return FILTER_KEYS.some((k) => k !== "page" && first(sp[k]) !== undefined && first(sp[k]) !== "");
}

export function hrefWith(base: string, sp: SearchParams, overrides: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = first(sp[k]);
    if (v) params.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  if (params.get("page") === "1") params.delete("page");
  const s = params.toString();
  return s ? `${base}?${s}` : base;
}
