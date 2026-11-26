"use client";

import * as React from "react";
import { Minus, Plus, Users } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, Select, cn } from "@pricora/ui";

export function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const id = React.useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2" role="group" aria-labelledby={id}>
      <div>
        <p id={id} className="text-sm font-semibold">
          {label}
        </p>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="flex size-8 items-center justify-center rounded-full border border-border-strong text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <span className="price w-5 text-center font-bold" aria-live="polite">
          {value}
        </span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="flex size-8 items-center justify-center rounded-full border border-border-strong text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Segment-style trigger + popover body used by both search bars. */
export function TravelersField({
  id,
  label,
  summary,
  children,
  testId,
  className,
}: {
  id: string;
  label: string;
  summary: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          data-testid={testId}
          aria-label={`${label}: ${summary}`}
          className={cn("flex h-full w-full min-w-0 flex-col justify-center px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}
        >
          <span className="text-xs font-semibold text-text-muted">{label}</span>
          <span className="flex items-center gap-2">
            <Users aria-hidden className="size-4 shrink-0 text-text-muted" />
            <span className="truncate text-md font-semibold">{summary}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-4">
        <div className="divide-y divide-border">{children}</div>
        <Button className="mt-3" fullWidth onClick={() => setOpen(false)}>
          Done
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function ChildAges({ ages, onChange }: { ages: number[]; onChange: (a: number[]) => void }) {
  if (!ages.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 py-2">
      {ages.map((a, i) => (
        <label key={i} className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
          Child {i + 1} age
          <Select size="sm" value={a} onChange={(e) => onChange(ages.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
            {Array.from({ length: 18 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "Under 1" : `${n} ${n === 1 ? "year" : "years"}`}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
}
