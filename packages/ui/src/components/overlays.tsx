"use client";

import * as React from "react";
import {
  Dialog as DialogPrimitive,
  Popover as PopoverPrimitive,
  Tooltip as TooltipPrimitive,
  Tabs as TabsPrimitive,
} from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn, focusRing } from "../lib/cn";

/* ================================================================= Dialog */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-overlay bg-overlay data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
});

function CloseButton() {
  return (
    <DialogPrimitive.Close
      className={cn(
        "absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text",
        focusRing,
      )}
    >
      <X aria-hidden className="size-[18px]" />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  );
}

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
  size?: "sm" | "md" | "lg";
}

export const DialogContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  function DialogContent({ className, children, hideClose, size = "md", ...props }, ref) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed left-1/2 top-1/2 z-modal grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto",
            "rounded-lg border border-border bg-surface p-6 text-text shadow-lg",
            "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out focus:outline-none",
            size === "sm" && "max-w-sm",
            size === "md" && "max-w-lg",
            size === "lg" && "max-w-3xl",
            className,
          )}
          {...props}
        >
          {children}
          {hideClose ? null : <CloseButton />}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 pr-8", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
});

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn("text-sm text-text-muted", className)} {...props} />;
});

/* ================================================================== Sheet */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  "fixed z-modal flex flex-col gap-4 overflow-y-auto border-border bg-surface p-6 text-text shadow-lg focus:outline-none",
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-[min(92vw,420px)] border-l data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right",
        left: "inset-y-0 left-0 h-full w-[min(92vw,360px)] border-r data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left",
        bottom:
          "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-lg border-t pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  hideClose?: boolean;
}

/** Side panel / bottom drawer (filters on mobile, mobile nav, offer details). */
export const SheetContent = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  function SheetContent({ className, children, side, hideClose, ...props }, ref) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
          {side === "bottom" ? (
            <div aria-hidden className="mx-auto -mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-surface-3" />
          ) : null}
          {children}
          {hideClose ? null : <CloseButton />}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);

export const SheetHeader = DialogHeader;
export const SheetFooter = DialogFooter;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

/* ================================================================ Popover */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = "start", sideOffset = 6, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-popover w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border border-border bg-surface p-4 text-text shadow-md",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out focus:outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});

/* ================================================================ Tooltip */

/** Wrap the app once (or a subtree). Short delay so tooltips feel responsive but don't flash. */
export function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration = 200,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-tooltip max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-md bg-text px-2.5 py-1.5 text-xs text-bg shadow-md",
          "data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});

/* =================================================================== Tabs */

export const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva("inline-flex items-center", {
  variants: {
    variant: {
      underline: "w-full gap-5 border-b border-border",
      segmented: "gap-0.5 rounded-md bg-surface-2 p-0.5",
    },
  },
  defaultVariants: { variant: "underline" },
});

const TabsVariantContext = React.createContext<"underline" | "segmented">("underline");

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

export const TabsList = React.forwardRef<React.ComponentRef<typeof TabsPrimitive.List>, TabsListProps>(
  function TabsList({ className, variant, ...props }, ref) {
    const v = variant ?? "underline";
    return (
      <TabsVariantContext.Provider value={v}>
        <TabsPrimitive.List
          ref={ref}
          className={cn(tabsListVariants({ variant: v }), "scrollbar-none overflow-x-auto", className)}
          {...props}
        />
      </TabsVariantContext.Provider>
    );
  },
);

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-sm font-medium text-text-muted",
        "transition-colors duration-fast ease-standard hover:text-text disabled:pointer-events-none disabled:opacity-50",
        focusRing,
        variant === "underline" &&
          "-mb-px h-10 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text",
        variant === "segmented" &&
          "h-8 rounded-sm px-3 data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
});
