"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info, PlaneTakeoff, SlidersHorizontal, X } from "lucide-react";
import type { FlightSearchResponse, FlightSort } from "@pricora/contracts";
import { Button, EmptyState, Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetHeader, SheetTitle, cn } from "@pricora/ui";
import { FlightCard } from "./flight-card";
import { activeChips, FlightFilters, readFilters, type ParamUpdate } from "./flight-filters";
import { duration, usd } from "./format";
import { PlaneLoader } from "./plane-loader";

const SORTS: Array<{ value: FlightSort; label: string }> = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
];

const FILTER_KEYS = ["stops", "airlines", "alliances", "layovers", "dep", "arr", "maxDuration", "maxLayover", "bags", "hideSelfTransfer"];

export function FlightResultsView({ data, travelers }: { data: FlightSearchResponse; travelers: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = React.useTransition();
  const [sheet, setSheet] = React.useState(false);
  const state = readFilters(new URLSearchParams(sp.toString()));
  const sort = (sp.get("sort") as FlightSort | null) ?? "best";
  const legs = (data.query.legs ?? [{ from: data.query.from, to: data.query.to, date: data.query.depart }]).map((l) => ({ from: l.from, to: l.to }));
  const facets = data.facets;

  const update = React.useCallback(
    (u: ParamUpdate) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(u)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("limit" in u)) next.delete("limit");
      start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [sp, pathname, router],
  );

  const chips = facets ? activeChips(state, facets, legs) : [];
  const clearAll = () => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));
  const summary = data.sortSummary;
  const total = data.total ?? data.offers.length;
  const tagFor = (id: string) => [summary?.best?.offerId === id ? "Best" : null, summary?.cheapest?.offerId === id ? "Cheapest" : null, summary?.fastest?.offerId === id ? "Fastest" : null].filter((t): t is string => Boolean(t));

  const filters = facets ? <FlightFilters facets={facets} state={state} onChange={update} legs={legs} /> : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row" data-testid="flight-results-view">
      <aside className="hidden shrink-0 lg:block lg:w-72" aria-label="Flight filters">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg border border-border bg-surface p-4">{filters}</div>
      </aside>
      <div className="relative min-w-0 flex-1" aria-busy={pending}>
        {pending ? <PlaneLoader label="Updating results…" className="absolute inset-x-0 top-24 z-raised mx-auto w-fit rounded-lg bg-surface/95 px-4 py-2 shadow-md" /> : null}
        <div className={cn("transition-opacity", pending && "pointer-events-none opacity-50")}>
        {/* Sort tabs with price + duration of each winner */}
        <div role="tablist" aria-label="Sort flights" className="mb-3 grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-surface" data-testid="flight-sort-tabs">
          {SORTS.map((s) => {
            const w = summary?.[s.value];
            const active = sort === s.value;
            return (
              <div key={s.value} className={cn("relative border-r border-border last:border-r-0", active && "bg-flights text-flights-fg")}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => update({ sort: s.value === "best" ? null : s.value })}
                  className={cn("flex w-full flex-col items-start px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", !active && "hover:bg-surface-2")}
                  data-testid={`sort-${s.value}`}
                >
                  <span className="text-sm font-semibold">{s.label}</span>
                  {w ? (
                    <span className={cn("text-xs", active ? "opacity-90" : "text-text-muted")}>
                      <span className="price font-semibold">{usd(w.pricePerAdultCents)}</span> · {duration(w.durationMinutes)}
                    </span>
                  ) : (
                    <span className="text-xs opacity-70">—</span>
                  )}
                </button>
                {s.value === "best" && data.bestRule ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" aria-label="How Best is ranked" className="absolute right-2 top-2 rounded-full p-0.5 opacity-80 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="best-rule">
                        <Info aria-hidden className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-xs text-xs leading-relaxed">{data.bestRule}</PopoverContent>
                  </Popover>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheet(true)} data-testid="mobile-filters">
            <SlidersHorizontal aria-hidden /> Filters{chips.length ? ` (${chips.length})` : ""}
          </Button>
          <p className="text-sm text-text-muted" aria-live="polite">
            <span className="price font-semibold text-text">{total}</span> of {data.totalUnfiltered ?? total} results
          </p>
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={() => update(c.clear)} className="inline-flex h-7 items-center gap-1 rounded-full border border-flights-action/40 bg-flights-soft px-2.5 text-xs font-medium text-flights-soft-fg hover:border-flights-action" data-testid="filter-chip">
              {c.label} <X aria-label="Remove filter" className="size-3" />
            </button>
          ))}
          {chips.length > 1 ? (
            <button type="button" onClick={clearAll} className="text-xs font-semibold text-flights-action hover:underline">
              Clear all
            </button>
          ) : null}
        </div>

        {data.offers.length === 0 ? (
          <EmptyState
            icon={<PlaneTakeoff aria-hidden />}
            title="No flights match these filters"
            description="Try removing a filter or two."
            action={
              chips.length ? (
                <Button variant="secondary" size="sm" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="flight-results">
            {data.offers.map((o, i) => (
              <li key={o.id}>
                <FlightCard offer={o} adults={data.query.adults} travelers={travelers} tags={tagFor(o.id)} airports={data.airports ?? {}} position={i + 1} />
              </li>
            ))}
          </ul>
        )}
        {data.offers.length < total ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => update({ limit: String(data.offers.length + 40) })} data-testid="show-more">
              Show more results
            </Button>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-text-muted">
          Price is per adult incl. taxes (estimated); totals include all travelers. Bag fees are estimates — check the airline before booking. We may earn a commission from “View deal” links; it never affects the order of results or the Best ranking.
        </p>
        </div>
      </div>

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-2">{filters}</div>
          <div className="sticky bottom-0 mt-4 flex gap-2 border-t border-border bg-surface py-3">
            <Button variant="secondary" className="flex-1" onClick={clearAll}>
              Clear all
            </Button>
            <Button className="flex-1 bg-flights-action text-flights-action-fg" onClick={() => setSheet(false)}>
              Show {total} results
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
