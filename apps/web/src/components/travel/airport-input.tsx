"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import type { Airport } from "@pricora/contracts";
import { cn } from "@pricora/ui";
import { api } from "@/lib/api-browser";

/** Airport combobox backed by /v1/travel/airports. Value is the IATA code. */
export function AirportInput({
  id,
  label,
  value,
  onChange,
  kind,
  invalid,
  describedBy,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (iata: string) => void;
  kind: "from" | "to";
  invalid?: boolean;
  describedBy?: string;
  testId?: string;
}) {
  const [text, setText] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [debounced, setDebounced] = React.useState("");
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = id + "-list";

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

  const q = useQuery({
    queryKey: ["airports", debounced],
    queryFn: ({ signal }) => api.travel.airports(debounced, { signal }),
    enabled: open && debounced.length >= 2,
    staleTime: 10 * 60_000,
  });
  const items: Airport[] = (q.data?.items ?? []).slice(0, 8);
  const panelOpen = open && debounced.length >= 2;
  const listOpen = panelOpen && !q.isError && items.length > 0;

  const pick = (a: Airport) => {
    onChange(a.iata);
    setText(`${a.iata} · ${a.city}`);
    setOpen(false);
  };

  const Icon = kind === "from" ? PlaneTakeoff : PlaneLanding;

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-muted">
        {label}
      </label>
      <div className="relative">
        <Icon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input
          id={id}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-activedescendant={listOpen && items[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={text}
          placeholder="City or airport"
          data-testid={testId}
          onFocus={(e) => {
            e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            setOpen(true);
            setActive(0);
            // Typing a bare IATA code is accepted directly.
            onChange(/^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : "");
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && open && items[active]) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className={cn(
            "h-11 w-full rounded-md border border-border-strong bg-surface pl-9 pr-3 text-md text-text placeholder:text-text-muted sm:text-base",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid && "border-error",
          )}
        />
      </div>
      {listOpen ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label + " airports"}
          className="absolute inset-x-0 top-full z-dropdown mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-md"
        >
          {items.map((a, i) => (
            <li
              key={a.iata}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(a)}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", i === active && "bg-surface-2")}
            >
              <span className="w-10 shrink-0 font-mono text-xs font-semibold text-text">{a.iata}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.city}
                {a.region ? `, ${a.region}` : ""} <span className="text-text-muted">· {a.name}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : panelOpen ? (
        <p role="status" className="absolute inset-x-0 top-full z-dropdown mt-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted shadow-md">
          {q.isError ? "Airport search is unavailable. Type a 3-letter code (e.g. JFK)." : q.isFetching ? "Searching…" : "No airports found"}
        </p>
      ) : null}
    </div>
  );
}
