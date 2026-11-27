"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn, focusRing } from "../lib/cn";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow,scale] duration-fast ease-standard motion-safe:active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    focusRing,
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        accent: "bg-accent text-accent-fg hover:bg-accent-hover",
        secondary: "border border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-2",
        soft: "bg-primary-soft text-primary-soft-fg hover:bg-surface-3",
        ghost: "text-text hover:bg-surface-2",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
        destructive: "bg-error text-error-fg hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-sm [&_svg]:size-4",
        md: "h-9.5 px-4 text-base [&_svg]:size-4",
        lg: "h-11 px-5 text-md [&_svg]:size-5",
      },
      fullWidth: { true: "w-full" },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0 active:scale-100" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a Link) with button styles. */
  asChild?: boolean;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, fullWidth, asChild = false, loading = false, disabled, children, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="animate-spin" /> : null}
      {children}
    </button>
  );
});

export const iconButtonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center rounded-md transition-[color,background-color,border-color,scale] duration-fast ease-standard motion-safe:active:scale-[0.94]",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    focusRing,
  ],
  {
    variants: {
      variant: {
        ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
        secondary: "border border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-2",
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
      },
      size: {
        sm: "size-8 [&_svg]:size-4",
        md: "size-9.5 [&_svg]:size-[18px]",
        lg: "size-11 [&_svg]:size-5",
      },
      shape: { square: "", circle: "rounded-full" },
    },
    defaultVariants: { variant: "ghost", size: "md", shape: "square" },
  },
);

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">,
    VariantProps<typeof iconButtonVariants> {
  /** Required accessible name (icon-only buttons have no visible text). */
  label: string;
  asChild?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant, size, shape, label, asChild = false, type, title, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      aria-label={label}
      title={title ?? label}
      className={cn(iconButtonVariants({ variant, size, shape }), className)}
      {...props}
    />
  );
});
