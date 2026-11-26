"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "../lib/cn";

export interface SegmentedControlOption<V extends string = string> {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Accessible name when `label` is icon-only or not plain text. */
  ariaLabel?: string;
}

export interface SegmentedControlProps<V extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "dir"> {
  options: ReadonlyArray<SegmentedControlOption<V>>;
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  /** Required accessible name for the group, e.g. "Trip type" or "Price history range". */
  label: string;
  size?: "sm" | "md";
  fullWidth?: boolean;
  name?: string;
  disabled?: boolean;
}

/**
 * Single-choice toggle (role="radiogroup" / role="radio", arrow-key navigation, one tab stop).
 * Use for value pickers that do NOT swap a panel: one-way/round-trip, 7d/30d/90d range, grid/list, Under $25/$50/$100.
 * Use `Tabs` only when each option shows its own tab panel.
 */
export function SegmentedControl<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  size = "md",
  fullWidth = false,
  name,
  disabled,
  className,
  ...props
}: SegmentedControlProps<V>) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      orientation="horizontal"
      loop
      value={value}
      defaultValue={defaultValue}
      onValueChange={(v) => onValueChange?.(v as V)}
      name={name}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5",
        fullWidth && "flex w-full",
        className,
      )}
      {...props}
    >
      {options.map((opt) => (
        <RadioGroupPrimitive.Item
          key={opt.value}
          value={opt.value}
          disabled={opt.disabled}
          aria-label={opt.ariaLabel}
          className={cn(
            "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium text-text-muted",
            "transition-colors duration-fast ease-standard hover:text-text",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface-2",
            "disabled:pointer-events-none disabled:opacity-50",
            "data-[state=checked]:bg-surface data-[state=checked]:text-text data-[state=checked]:shadow-xs",
            "[&_svg]:size-4 [&_svg]:shrink-0",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
            fullWidth && "flex-1",
          )}
        >
          {opt.icon}
          {opt.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
