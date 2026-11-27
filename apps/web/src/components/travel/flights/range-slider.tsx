"use client";

import * as React from "react";

/**
 * Two-thumb (or single max) range slider built from native range inputs (keyboard + screen-reader friendly).
 * Commits on pointer release / key up, not on every pixel of drag.
 */
export function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onCommit,
  format,
  single = false,
  testId,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onCommit: (v: [number, number]) => void;
  format: (v: number) => string;
  /** Only an upper bound (e.g. max duration). */
  single?: boolean;
  testId?: string;
}) {
  const [lo, setLo] = React.useState(value[0]);
  const [hi, setHi] = React.useState(value[1]);
  React.useEffect(() => {
    setLo(value[0]);
    setHi(value[1]);
  }, [value]);
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  const commit = () => onCommit([lo, hi]);
  const id = React.useId();
  const thumb =
    "pointer-events-none absolute inset-0 h-6 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:cursor-grab [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-flights-action [&::-moz-range-thumb]:bg-surface [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-flights-action [&::-webkit-slider-thumb]:bg-surface [&::-webkit-slider-thumb]:shadow focus-visible:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring";
  return (
    <div data-testid={testId}>
      <p className="text-xs text-text-muted" id={`${id}-v`}>
        {single ? `Up to ${format(hi)}` : `${format(lo)} – ${format(hi)}`}
      </p>
      <div className="relative mt-1 h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-flights-action" style={{ left: `${single ? 0 : pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        {single ? null : (
          <input
            type="range"
            aria-label={`${label}: from`}
            aria-describedby={`${id}-v`}
            min={min}
            max={max}
            step={step}
            value={lo}
            onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
            onPointerUp={commit}
            onKeyUp={commit}
            className={thumb}
          />
        )}
        <input
          type="range"
          aria-label={single ? label : `${label}: to`}
          aria-describedby={`${id}-v`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => setHi(Math.max(Number(e.target.value), single ? min : lo))}
          onPointerUp={commit}
          onKeyUp={commit}
          className={thumb}
        />
      </div>
    </div>
  );
}
