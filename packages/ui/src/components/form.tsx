"use client";

import * as React from "react";
import {
  Label as LabelPrimitive,
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioGroupPrimitive,
  Switch as SwitchPrimitive,
} from "radix-ui";
import { Check, ChevronDown, Minus, Search, X } from "lucide-react";
import { cn } from "../lib/cn";

/* ------------------------------------------------------------------ Label */

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(function Label({ className, required, children, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "text-sm font-medium text-text peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden className="ml-0.5 text-error">
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
});

/* ------------------------------------------------------------------ Input */

const fieldBase = [
  "w-full rounded-md border border-border-strong bg-surface text-text",
  "placeholder:text-text-muted",
  "transition-[border-color,box-shadow] duration-fast ease-standard",
  "hover:border-text-muted",
  "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70",
  "aria-invalid:border-error aria-invalid:focus-visible:ring-error/20",
  // 16px below sm prevents iOS focus zoom.
  "text-md sm:text-base",
].join(" ");

export const fieldSizes = {
  sm: "h-8 px-2.5",
  md: "h-9.5 px-3",
  lg: "h-11 px-4",
} as const;

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: keyof typeof fieldSizes;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size = "md", invalid, type = "text", ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldBase, fieldSizes[size], className)}
      {...props}
    />
  );
});

/* ------------------------------------------------------------ SearchInput */

export interface SearchInputProps extends Omit<InputProps, "type"> {
  /** Called when the clear (x) button is pressed. Clear button shows only when value is non-empty. */
  onClear?: () => void;
  /** Optional keyboard hint shown on the right when empty, e.g. "/". */
  shortcut?: string;
  /** Element rendered at the right edge (e.g. a submit Button). */
  trailing?: React.ReactNode;
  containerClassName?: string;
  /**
   * Autocomplete mode. When set, the input becomes an ARIA 1.2 combobox
   * (role="combobox", aria-expanded, aria-controls, aria-activedescendant, aria-autocomplete="list").
   * Without it the input is a plain searchbox (implicit role from type="search") and must NOT
   * receive aria-expanded.
   */
  combobox?: {
    /** Whether the suggestions listbox is visible. */
    expanded: boolean;
    /** id of the element with role="listbox". */
    listboxId: string;
    /** id of the highlighted role="option", if any. */
    activeOptionId?: string | null;
    autocomplete?: "list" | "both" | "inline";
  };
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { className, containerClassName, size = "md", onClear, shortcut, trailing, value, combobox, ...props },
  ref,
) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const comboboxProps: React.InputHTMLAttributes<HTMLInputElement> = combobox
    ? {
        role: "combobox",
        "aria-expanded": combobox.expanded,
        "aria-controls": combobox.listboxId,
        "aria-haspopup": "listbox",
        "aria-autocomplete": combobox.autocomplete ?? "list",
        "aria-activedescendant": combobox.expanded && combobox.activeOptionId ? combobox.activeOptionId : undefined,
      }
    : {};
  return (
    <div className={cn("relative flex w-full items-center", containerClassName)}>
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-3 text-text-muted",
          size === "lg" ? "size-5 left-4" : "size-4",
        )}
      />
      <input
        ref={ref}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        className={cn(
          fieldBase,
          fieldSizes[size],
          size === "lg" ? "pl-11" : "pl-9",
          trailing ? (size === "lg" ? "pr-32" : "pr-24") : "pr-10",
          "[&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
        {...props}
        {...comboboxProps}
      />
      <div className="absolute right-1.5 flex items-center gap-1">
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="inline-flex size-7 items-center justify-center rounded-sm text-text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : shortcut && !trailing ? (
          <kbd className="mr-1 hidden rounded-xs border border-border bg-surface-2 px-1.5 font-mono text-2xs text-text-muted sm:inline-block">
            {shortcut}
          </kbd>
        ) : null}
        {trailing}
      </div>
    </div>
  );
});

/* ----------------------------------------------------------------- Select */

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: keyof typeof fieldSizes;
  invalid?: boolean;
  containerClassName?: string;
}

/** Native <select>: best a11y, mobile pickers, works without JS. Use DropdownMenu for actions. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, containerClassName, size = "md", invalid, children, ...props },
  ref,
) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      <select
        ref={ref}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        className={cn(fieldBase, fieldSizes[size], "appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
});

/* --------------------------------------------------------------- Checkbox */

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-xs border border-border-strong bg-surface",
        "transition-colors duration-fast ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-fg",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-fg",
        "aria-invalid:border-error",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center">
        <Check aria-hidden strokeWidth={3} className="size-3 group-data-[state=indeterminate]:hidden" />
        <Minus aria-hidden strokeWidth={3} className="hidden size-3 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});

/* ------------------------------------------------------------- RadioGroup */

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return <RadioGroupPrimitive.Root ref={ref} className={cn("grid gap-2", className)} {...props} />;
});

export const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        "peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
});

/* ----------------------------------------------------------------- Switch */

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5",
        "bg-border-strong transition-colors duration-fast ease-standard data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-[18px] rounded-full bg-surface shadow-sm",
          "transition-transform duration-fast ease-standard data-[state=checked]:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
});

/* -------------------------------------------------------------- FieldHint */

/** Helper / error text under a field. Pair with aria-describedby on the control. */
export function FieldMessage({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { tone?: "muted" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn("text-xs", tone === "error" ? "text-error" : "text-text-muted", className)}
      {...props}
    />
  );
}
