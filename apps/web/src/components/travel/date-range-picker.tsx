"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@pricora/ui";

/* Dates are plain YYYY-MM-DD strings (no time zones). */
const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const monthLabel = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const shortDate = (s: string | null) => (s ? parse(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");
const longDate = (s: string) => parse(s).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export interface DateRange {
  start: string | null;
  end: string | null;
}

function Month({
  year,
  month,
  range,
  hover,
  min,
  focusDate,
  onPick,
  onHover,
  onKey,
  registerRef,
}: {
  year: number;
  month: number;
  range: DateRange;
  hover: string | null;
  min: string;
  focusDate: string;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
  onKey: (e: React.KeyboardEvent, d: string) => void;
  registerRef: (d: string, el: HTMLButtonElement | null) => void;
}) {
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const end = range.end ?? (range.start && hover && hover > range.start ? hover : null);
  const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => iso(new Date(year, month, i + 1)))];
  return (
    <div className="w-[17rem]">
      <p className="mb-2 text-center text-sm font-bold">{monthLabel(year, month)}</p>
      <div role="group" aria-label={monthLabel(year, month)} className="grid grid-cols-7 gap-y-1 text-center">
        <div className="contents">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span key={d} aria-hidden className="text-2xs font-semibold text-text-muted">
              {d}
            </span>
          ))}
        </div>
        <div className="contents">
          {cells.map((d, i) =>
            d === null ? (
              <span key={`e${i}`} aria-hidden />
            ) : (
              (() => {
                const disabled = d < min;
                const isStart = d === range.start;
                const isEnd = d === end;
                const inRange = Boolean(range.start && end && d > range.start && d < end);
                return (
                  <span key={d} className={cn("flex justify-center", inRange && "bg-primary-soft", isStart && end && "rounded-l-full bg-primary-soft", isEnd && range.start && "rounded-r-full bg-primary-soft")}>
                    <button
                      ref={(el) => registerRef(d, el)}
                      type="button"
                      disabled={disabled}
                      tabIndex={d === focusDate ? 0 : -1}
                      aria-label={longDate(d)}
                      aria-pressed={isStart || isEnd}
                      onClick={() => onPick(d)}
                      onMouseEnter={() => onHover(d)}
                      onKeyDown={(e) => onKey(e, d)}
                      className={cn(
                        "price size-9 rounded-full text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        disabled ? "cursor-not-allowed text-text-muted/50 line-through" : "hover:bg-surface-3",
                        (isStart || isEnd) && "bg-primary text-primary-fg hover:bg-primary",
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </span>
                );
              })()
            ),
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Two-month date range picker (single-date mode for one-way trips). Keyboard: arrows move by day/week,
 * PageUp/PageDown by month, Enter/Space selects, Esc closes. US date format.
 */
export function DateRangePicker({
  id,
  value,
  onChange,
  mode = "range",
  startLabel,
  endLabel,
  min,
  className,
  testId,
}: {
  id: string;
  value: DateRange;
  onChange: (r: DateRange) => void;
  mode?: "range" | "single";
  startLabel: string;
  endLabel?: string;
  min: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState<string | null>(null);
  const [focusDate, setFocusDate] = React.useState(value.start ?? min);
  const [view, setView] = React.useState(() => {
    const d = parse(value.start ?? min);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const picking = React.useRef<"start" | "end">("start");

  React.useEffect(() => {
    if (!open) return;
    picking.current = "start";
    const d = parse(value.start ?? min);
    setView({ y: d.getFullYear(), m: d.getMonth() });
    setFocusDate(value.start ?? min);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => refs.current.get(focusDate)?.focus());
  }, [focusDate, open, view]);

  const pick = (d: string) => {
    if (mode === "single") {
      onChange({ start: d, end: null });
      setOpen(false);
      return;
    }
    if (picking.current === "start" || !value.start || d <= value.start) {
      onChange({ start: d, end: null });
      picking.current = "end";
    } else {
      onChange({ start: value.start, end: d });
      picking.current = "start";
      setOpen(false);
    }
  };

  const moveFocus = (d: string) => {
    if (d < min) return;
    setFocusDate(d);
    const nd = parse(d);
    const first = new Date(view.y, view.m, 1);
    const lastVisible = new Date(view.y, view.m + 2, 0);
    if (nd < first || nd > lastVisible) setView({ y: nd.getFullYear(), m: nd.getMonth() - (nd > lastVisible ? 1 : 0) });
  };

  const onKey = (e: React.KeyboardEvent, d: string) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -30, PageDown: 30 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(addDays(d, map[e.key]!));
    } else if (e.key === "Home") {
      e.preventDefault();
      moveFocus(addDays(d, -parse(d).getDay()));
    } else if (e.key === "End") {
      e.preventDefault();
      moveFocus(addDays(d, 6 - parse(d).getDay()));
    }
  };

  const next = { y: view.m === 11 ? view.y + 1 : view.y, m: (view.m + 1) % 12 };
  const prevDisabled = new Date(view.y, view.m, 1) <= parse(min.slice(0, 8) + "01");

  const summary =
    mode === "single"
      ? shortDate(value.start) || "Add date"
      : value.start
        ? `${shortDate(value.start)} — ${value.end ? shortDate(value.end) : "Add date"}`
        : "Add dates";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          data-testid={testId}
          className={cn("flex h-full w-full min-w-0 flex-col justify-center px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}
          aria-label={`${startLabel}${endLabel && mode === "range" ? ` and ${endLabel}` : ""}: ${summary}`}
        >
          <span className="text-xs font-semibold text-text-muted">{mode === "range" && endLabel ? `${startLabel} — ${endLabel}` : startLabel}</span>
          <span className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4 shrink-0 text-text-muted" />
            <span className={cn("truncate text-md font-semibold", !value.start && "font-normal text-text-muted")}>{summary}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start" sideOffset={8} onMouseLeave={() => setHover(null)}>
        <div className="mb-2 flex items-center justify-between">
          <Button variant="ghost" size="sm" aria-label="Previous month" disabled={prevDisabled} onClick={() => setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>
            <ChevronLeft aria-hidden />
          </Button>
          <p className="text-xs text-text-muted" aria-live="polite">
            {mode === "range" ? (picking.current === "start" ? `Choose ${startLabel.toLowerCase()}` : `Choose ${(endLabel ?? "end").toLowerCase()}`) : `Choose ${startLabel.toLowerCase()}`}
          </p>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => setView(next)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {[view, next].map((v, i) => (
            <div key={`${v.y}-${v.m}`} className={i === 1 ? "hidden sm:block" : undefined}>
              <Month
                year={v.y}
                month={v.m}
                range={value}
                hover={hover}
                min={min}
                focusDate={focusDate}
                onPick={pick}
                onHover={setHover}
                onKey={onKey}
                registerRef={(d, el) => {
                  if (el) refs.current.set(d, el);
                  else refs.current.delete(d);
                }}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
