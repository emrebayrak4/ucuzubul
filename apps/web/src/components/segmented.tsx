"use client";

import * as React from "react";
import { SegmentedControl } from "@pricora/ui";

/** Thin adapter over @pricora/ui SegmentedControl (radio semantics) for toggles without tab panels. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  label: string;
  className?: string;
  itemClassName?: string;
}) {
  return <SegmentedControl<T> label={label} value={value} onValueChange={onChange} options={options} size="sm" className={className} />;
}
