"use client";

import * as React from "react";
import { DropdownMenu as Menu } from "radix-ui";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuPortal = Menu.Portal;
export const DropdownMenuSub = Menu.Sub;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

const contentClass = cn(
  "z-dropdown min-w-[12rem] overflow-hidden rounded-md border border-border bg-surface p-1 text-text shadow-md",
  "origin-(--radix-dropdown-menu-content-transform-origin) data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
);

const itemClass = cn(
  "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
  "data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-text-muted",
);

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content ref={ref} sideOffset={sideOffset} align={align} className={cn(contentClass, className)} {...props} />
    </Menu.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item> & { inset?: boolean; destructive?: boolean }
>(function DropdownMenuItem({ className, inset, destructive, ...props }, ref) {
  return (
    <Menu.Item
      ref={ref}
      className={cn(itemClass, inset && "pl-8", destructive && "text-error [&_svg]:text-error", className)}
      {...props}
    />
  );
});

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ComponentRef<typeof Menu.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <Menu.CheckboxItem ref={ref} className={cn(itemClass, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Menu.ItemIndicator>
          <Check aria-hidden className="!text-primary" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = React.forwardRef<
  React.ComponentRef<typeof Menu.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Menu.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <Menu.RadioItem ref={ref} className={cn(itemClass, "pl-8", className)} {...props}>
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <Menu.ItemIndicator>
          <Circle aria-hidden className="!size-2 fill-primary !text-primary" />
        </Menu.ItemIndicator>
      </span>
      {children}
    </Menu.RadioItem>
  );
});

export const DropdownMenuLabel = React.forwardRef<
  React.ComponentRef<typeof Menu.Label>,
  React.ComponentPropsWithoutRef<typeof Menu.Label> & { inset?: boolean }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <Menu.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-muted", inset && "pl-8", className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef<
  React.ComponentRef<typeof Menu.Separator>,
  React.ComponentPropsWithoutRef<typeof Menu.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <Menu.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
});

export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("ml-auto font-mono text-2xs text-text-muted", className)} {...props} />;
}

export const DropdownMenuSubTrigger = React.forwardRef<
  React.ComponentRef<typeof Menu.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof Menu.SubTrigger>
>(function DropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <Menu.SubTrigger ref={ref} className={cn(itemClass, "data-[state=open]:bg-surface-2", className)} {...props}>
      {children}
      <ChevronRight aria-hidden className="ml-auto" />
    </Menu.SubTrigger>
  );
});

export const DropdownMenuSubContent = React.forwardRef<
  React.ComponentRef<typeof Menu.SubContent>,
  React.ComponentPropsWithoutRef<typeof Menu.SubContent>
>(function DropdownMenuSubContent({ className, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.SubContent ref={ref} className={cn(contentClass, className)} {...props} />
    </Menu.Portal>
  );
});
