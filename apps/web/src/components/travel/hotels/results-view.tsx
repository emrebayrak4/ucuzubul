"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Info, LayoutGrid, List, Map as MapIcon, Pencil, SlidersHorizontal, Users, X } from "lucide-react";
import { HOTEL_SORT_LABELS, HotelSort, type HotelSearchResponse } from "@pricora/contracts";
import { DemoDataBadge, Sheet, SheetContent, SheetTitle, cn } from "@pricora/ui";
import { HotelSearchForm } from "../search-forms";
import { AppliedChips, HotelFilters } from "./filters";
import { HotelResultCard } from "./result-card";
import { FILTER_KEYS, fmtUsd, useHotelParams } from "./url-state";

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="flex size-full items-center justify-center bg-surface-2 text-sm text-text-muted">Loading map…</div>,
});

export type StaySummary = { city: string; checkin: string; checkout: string; guests: number; rooms: number; adults?: number; childAges: number[]; work: boolean };

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Sticky, editable search summary. Collapsed: one line; expanded: the full search form. */
export function StickySearchBar({ stay, startOpen = false }: { stay: StaySummary; startOpen?: boolean }) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <div className="sticky top-0 z-sticky border-b border-hotels/30 bg-hotels text-hotels-fg shadow-sm" data-testid="sticky-search">
      <div className="container-content py-2">
        {open ? (
          <div className="relative py-2">
            <button type="button" onClick={() => setOpen(false)} className="absolute -top-1 right-0 z-10 inline-flex size-8 items-center justify-center rounded-full hover:bg-white/15" aria-label="Close search editor">
              <X aria-hidden className="size-5" />
            </button>
            <HotelSearchForm initial={{ city: stay.city, checkin: stay.checkin, checkout: stay.checkout, guests: stay.guests, rooms: stay.rooms, adults: stay.adults, childAges: stay.childAges, work: stay.work }} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border-2 border-hotels-accent bg-surface px-3 py-2 text-left text-sm text-text"
            data-testid="edit-search"
          >
            <span className="min-w-0 flex-1 truncate font-bold">{stay.city || "Choose a destination"}</span>
            <span className="hidden items-center gap-1 text-text-muted sm:inline-flex">
              <CalendarDays aria-hidden className="size-4" />
              {stay.checkin && stay.checkout ? `${fmtDate(stay.checkin)} – ${fmtDate(stay.checkout)}` : "Select dates"}
            </span>
            <span className="hidden items-center gap-1 text-text-muted md:inline-flex">
              <Users aria-hidden className="size-4" />
              {stay.guests} {stay.guests === 1 ? "guest" : "guests"} · {stay.rooms} {stay.rooms === 1 ? "room" : "rooms"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-sm bg-hotels px-2 py-1 text-xs font-bold text-hotels-fg">
              <Pencil aria-hidden className="size-3.5" /> Edit
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

type View = "list" | "grid" | "map";

export function HotelResultsView({ data, detailQuery, view, pageHref }: { data: HotelSearchResponse; detailQuery: string; view: View; pageHref: Record<number, string> }) {
  const router = useRouter();
  const { sp, update, pending } = useHotelParams();
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const [areaBbox, setAreaBbox] = React.useState<string | null>(null);
  const [followMap, setFollowMap] = React.useState(false);
  const sort = HotelSort.safeParse(sp.get("sort") === "recommended" ? "top_picks" : sp.get("sort")).data ?? "top_picks";
  const activeFilters = FILTER_KEYS.filter((k) => sp.get(k)).length;
  const href = (id: string) => `/travel/hotels/${encodeURIComponent(id)}${detailQuery}`;
  const center = data.location && data.location.lat !== null && data.location.lng !== null ? { lat: data.location.lat, lng: data.location.lng } : null;
  const pins = React.useMemo(
    () => data.pins.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, title: p.name, label: p.lowestNightlyCents !== null ? fmtUsd(p.lowestNightlyCents) : "—" })),
    [data.pins],
  );
  const setView = (v: View) => update({ view: v === "list" ? null : v }, { keepPage: true });
  const onBounds = (bbox: string) => (followMap ? update({ bbox }) : setAreaBbox(bbox));
  const pageCount = Math.ceil(data.total / data.pageSize);

  const scrollToCard = (id: string) => {
    setHovered(id);
    const card = document.querySelector(`[data-hotel-id="${CSS.escape(id)}"]`);
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    else router.push(href(id));
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-semibold">Sort by</span>
        <select
          value={sort}
          onChange={(e) => update({ sort: e.target.value === "top_picks" ? null : e.target.value })}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm font-semibold"
          data-testid="hotel-sort"
        >
          {HotelSort.options.map((s) => (
            <option key={s} value={s} disabled={s === "distance_asc" && !center}>
              {HOTEL_SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {sort === "top_picks" ? (
        <details className="group relative text-sm">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-text-muted hover:text-text" aria-label="How top picks are ranked">
            <Info aria-hidden className="size-4" /> How we rank
          </summary>
          <p className="absolute left-0 top-7 z-dropdown w-72 rounded-md border border-border bg-surface p-3 text-xs shadow-lg" data-testid="top-picks-rule">
            {data.topPicksRule}
          </p>
        </details>
      ) : null}
      <div className="ml-auto hidden items-center rounded-md border border-border p-0.5 md:flex" role="group" aria-label="Result layout">
        {(
          [
            ["list", List, "List"],
            ["grid", LayoutGrid, "Grid"],
            ["map", MapIcon, "Map"],
          ] as const
        ).map(([v, Icon, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-semibold", view === v ? "bg-hotels-soft text-hotels-soft-fg" : "text-text-muted hover:text-text")}
            data-testid={`view-${v}`}
          >
            <Icon aria-hidden className="size-4" /> {label}
          </button>
        ))}
      </div>
    </div>
  );

  const list = (
    <>
      {data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-bold">No properties match these filters.</p>
          <p className="mt-1 text-sm text-text-muted">Try removing a filter{sp.get("bbox") ? " or widen the map area" : ""}.</p>
        </div>
      ) : (
        <ul className={cn(view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3")} data-testid="hotel-results">
          {data.items.map((h) => (
            <li key={h.id}>
              <HotelResultCard hotel={h} nights={data.nights} href={href(h.id)} layout={view === "list" ? "list" : "grid"} active={hovered === h.id} onHover={setHovered} />
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref[p] ?? "#"}
              aria-current={p === data.page ? "page" : undefined}
              className={cn("inline-flex size-9 items-center justify-center rounded-md text-sm font-semibold", p === data.page ? "bg-hotels text-hotels-fg" : "border border-border hover:bg-surface-2")}
            >
              {p}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );

  const mapPanel = (cls: string) => (
    <div className={cn("relative overflow-hidden rounded-lg border border-border", cls)}>
      <LeafletMap pins={pins} center={center} activeId={hovered} onHover={setHovered} onSelect={scrollToCard} onBoundsChange={onBounds} className="size-full" />
      <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] flex flex-wrap items-start justify-center gap-2 px-2">
        {data.source === "demo" ? <DemoDataBadge className="pointer-events-auto shadow" label="Demo data — map pins are fictional" /> : null}
        {areaBbox && !followMap ? (
          <button type="button" onClick={() => (update({ bbox: areaBbox }), setAreaBbox(null))} className="pointer-events-auto h-9 rounded-full bg-text px-4 text-sm font-bold text-surface shadow" data-testid="search-area">
            Search this area
          </button>
        ) : null}
      </div>
      <label className="absolute bottom-6 left-2 z-[500] flex items-center gap-2 rounded-md bg-surface/95 px-2 py-1 text-xs font-semibold shadow">
        <input type="checkbox" checked={followMap} onChange={(e) => setFollowMap(e.target.checked)} className="accent-[var(--color-hotels)]" /> Search as I move the map
      </label>
    </div>
  );

  return (
    <div className="container-content py-4" aria-busy={pending}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:block" aria-label="Filters">
          {view !== "map" ? (
            <button type="button" onClick={() => setView("map")} className="group relative mb-4 block h-32 w-full overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_30%_40%,var(--color-hotels-soft),var(--color-surface-2))]" data-testid="show-on-map">
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="inline-flex items-center gap-2 rounded-md bg-hotels px-3 py-2 text-sm font-bold text-hotels-fg shadow group-hover:opacity-90">
                  <MapIcon aria-hidden className="size-4" /> Show on map
                </span>
              </span>
            </button>
          ) : null}
          <div className="rounded-lg border border-border bg-surface px-4 py-2">
            <HotelFilters facets={data.facets} total={data.total} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-extrabold tracking-tight" data-testid="results-heading">
                {data.location?.name ?? "Results"}: <span className="price">{data.total}</span> {data.total === 1 ? "property" : "properties"} found
              </h2>
              {data.total !== data.unfilteredTotal ? <span className="text-sm text-text-muted">of {data.unfilteredTotal}</span> : null}
            </div>
            {toolbar}
            <AppliedChips />
            {view === "map" ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,26rem)_1fr]">
                {mapPanel("order-first h-[55vh] lg:order-last lg:sticky lg:top-20 lg:h-[calc(100dvh-7rem)]")}
                <div className="min-w-0">{list}</div>
              </div>
            ) : (
              list
            )}
          </div>
        </div>
      </div>

      {/* Mobile action bar: filters, sort is in toolbar, map toggle */}
      <div className="fixed inset-x-0 bottom-0 z-sticky flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden" data-testid="mobile-actions">
        <div className="flex overflow-hidden rounded-full bg-text text-surface shadow-lg">
          <button type="button" onClick={() => setSheet(true)} className="inline-flex h-11 items-center gap-2 px-4 text-sm font-bold" data-testid="open-filters">
            <SlidersHorizontal aria-hidden className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <span aria-hidden className="my-2 w-px bg-surface/30" />
          <button type="button" onClick={() => setView(view === "map" ? "list" : "map")} className="inline-flex h-11 items-center gap-2 px-4 text-sm font-bold" data-testid="toggle-map">
            {view === "map" ? <List aria-hidden className="size-4" /> : <MapIcon aria-hidden className="size-4" />}
            {view === "map" ? "List" : "Map"}
          </button>
        </div>
      </div>
      <div className="h-16 lg:hidden" aria-hidden />

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="pt-4" data-testid="filter-sheet">
          <SheetTitle className="sr-only">Filters</SheetTitle>
          <HotelFilters facets={data.facets} total={data.total} onDone={() => setSheet(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
