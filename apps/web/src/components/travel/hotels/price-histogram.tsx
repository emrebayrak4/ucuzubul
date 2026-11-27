"use client";

import * as React from "react";
import type { HotelFacets } from "@pricora/contracts";
import { cn } from "@pricora/ui";
import { fmtUsd } from "./url-state";

type Price = NonNullable<HotelFacets["price"]>;

/**
 * Budget-per-night filter: histogram of the result set (ignoring the price filter itself) + two-thumb slider.
 * Commits on release / keyboard, not on every pixel of drag.
 */
export function PriceHistogram({ price, min, max, onCommit }: { price: Price; min?: number; max?: number; onCommit: (min: number | null, max: number | null) => void }) {
  const step = price.bucketCents;
  const clamp = (v: number) => Math.min(price.max, Math.max(price.min, v));
  const [lo, setLo] = React.useState(clamp(min ?? price.min));
  const [hi, setHi] = React.useState(clamp(max ?? price.max));
  React.useEffect(() => {
    setLo(clamp(min ?? price.min));
    setHi(clamp(max ?? price.max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max, price.min, price.max]);

  const commit = (l = lo, h = hi) => onCommit(l <= price.min ? null : l, h >= price.max ? null : h);
  const peak = Math.max(1, ...price.buckets);
  const pct = (v: number) => ((v - price.min) / (price.max - price.min)) * 100;
  const id = React.useId();

  return (
    <div data-testid="price-histogram">
      <p className="text-sm font-semibold" id={`${id}-label`}>
        {fmtUsd(lo)} – {fmtUsd(hi)}
        {hi >= price.max ? "+" : ""}
        <span className="font-normal text-text-muted"> / night</span>
      </p>
      <div className="mt-3 flex h-14 items-end gap-px" aria-hidden>
        {price.buckets.map((n, i) => {
          const from = price.min + i * step;
          const inRange = from + step > lo && from < hi;
          return <span key={i} className={cn("flex-1 rounded-t-sm", inRange ? "bg-hotels" : "bg-surface-3")} style={{ height: `${Math.max(4, (n / peak) * 100)}%` }} />;
        })}
      </div>
      <div className="relative -mt-1 h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-hotels" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          aria-label="Minimum price per night"
          aria-describedby={`${id}-label`}
          min={price.min}
          max={price.max}
          step={step}
          value={lo}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi - step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          aria-label="Maximum price per night"
          aria-describedby={`${id}-label`}
          min={price.min}
          max={price.max}
          step={step}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo + step))}
          onPointerUp={() => commit()}
          onKeyUp={() => commit()}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
      </div>
      <style>{`
        .range-thumb::-webkit-slider-thumb{pointer-events:auto;-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:9999px;background:var(--color-surface,#fff);border:2px solid var(--color-hotels,#B4122B);box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:grab}
        .range-thumb::-moz-range-thumb{pointer-events:auto;width:20px;height:20px;border-radius:9999px;background:var(--color-surface,#fff);border:2px solid var(--color-hotels,#B4122B);cursor:grab}
        .range-thumb:focus-visible::-webkit-slider-thumb{outline:2px solid var(--color-ring,#2563eb);outline-offset:2px}
      `}</style>
    </div>
  );
}
