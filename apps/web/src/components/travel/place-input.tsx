"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Clock, Globe2, MapPin, Plane } from "lucide-react";
import { cn } from "@pricora/ui";
import { pushRecentPlace, readRecentPlaces, searchPlaces, type Place, type PlaceType } from "@/lib/places";

const typeIcon: Record<PlaceType, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  city: Building2,
  airport: Plane,
  country: Globe2,
};
const typeLabel: Record<PlaceType, string> = { city: "Cities", airport: "Airports", country: "Countries" };

/**
 * Segment-style place combobox (worldwide places via /v1/travel/places): grouped results
 * (City / Airport / Country), keyboard navigation, recent picks. Used inside the joined search bars.
 */
export function PlaceInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  types,
  recentKey,
  invalid,
  describedBy,
  testId,
  className,
  icon: Icon = MapPin,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  types: PlaceType[];
  recentKey: string;
  invalid?: boolean;
  describedBy?: string;
  testId?: string;
  className?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const [text, setText] = React.useState(value?.label ?? "");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [debounced, setDebounced] = React.useState("");
  const [recent, setRecent] = React.useState<Place[]>([]);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = id + "-list";

  React.useEffect(() => setText(value?.label ?? ""), [value]);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 150);
    return () => clearTimeout(t);
  }, [text]);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const typing = debounced.length >= 2 && debounced !== value?.label;
  const q = useQuery({
    queryKey: ["places", types.join(","), debounced],
    queryFn: ({ signal }) => searchPlaces(debounced, types, signal),
    enabled: open && typing,
    staleTime: 10 * 60_000,
  });
  const items: Place[] = typing ? (q.data ?? []).slice(0, 12) : recent;
  // Group in type order, keep a flat index for keyboard navigation.
  const grouped = types.map((t) => ({ type: t, items: items.filter((p) => p.type === t) })).filter((g) => g.items.length);
  const flat = typing ? grouped.flatMap((g) => g.items) : items;
  const listOpen = open && flat.length > 0;

  const pick = (p: Place) => {
    onChange(p);
    setText(p.label);
    setOpen(false);
    pushRecentPlace(recentKey, p);
  };

  const renderOption = (p: Place, i: number) => {
    const I = typeIcon[p.type];
    return (
      <li
        key={p.id}
        id={`${listId}-${i}`}
        role="option"
        aria-selected={i === active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => pick(p)}
        onMouseEnter={() => setActive(i)}
        className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-text", i === active && "bg-surface-2")}
      >
        {typing ? <I aria-hidden className="size-4 shrink-0 text-text-muted" /> : <Clock aria-hidden className="size-4 shrink-0 text-text-muted" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.type === "city" && types.includes("airport") ? `${p.name} (Any airport)` : p.name}</span>
          <span className="block truncate text-xs text-text-muted">{p.detail}</span>
        </span>
        {p.code ? <span className="font-mono text-xs font-semibold text-text-muted">{p.code}</span> : null}
      </li>
    );
  };

  let idx = -1;
  return (
    <div ref={boxRef} className={cn("relative min-w-0", className)}>
      <label htmlFor={id} className="flex h-full cursor-text flex-col justify-center px-4 py-2">
        <span className="text-xs font-semibold text-text-muted">{label}</span>
        <span className="flex items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0 text-text-muted" />
          <input
            id={id}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            aria-activedescendant={listOpen && flat[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            data-testid={testId}
            onFocus={(e) => {
              e.currentTarget.select();
              setRecent(readRecentPlaces(recentKey));
              setOpen(true);
              setActive(0);
            }}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
              if (value) onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(flat.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && listOpen && flat[active]) {
                e.preventDefault();
                pick(flat[active]!);
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="w-full min-w-0 truncate bg-transparent text-md font-semibold text-text placeholder:font-normal placeholder:text-text-muted focus:outline-none"
          />
        </span>
      </label>
      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 top-full z-dropdown mt-2 max-h-96 w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {typing
            ? grouped.map((g) => (
                <li key={g.type} role="presentation">
                  <p aria-hidden className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-text-muted">
                    {typeLabel[g.type]}
                  </p>
                  <ul role="group" aria-label={typeLabel[g.type]}>
                    {g.items.map((p) => renderOption(p, ++idx))}
                  </ul>
                </li>
              ))
            : flat.map((p, i) => renderOption(p, i))}
        </ul>
      ) : open && typing ? (
        <p role="status" className="absolute left-0 top-full z-dropdown mt-2 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted shadow-lg">
          {q.isError ? "Place search is unavailable right now." : q.isFetching ? "Searching…" : "No matching places"}
        </p>
      ) : null}
    </div>
  );
}
