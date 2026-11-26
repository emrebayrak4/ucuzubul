"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, Plane, ShoppingBag } from "lucide-react";
import { cn } from "@pricora/ui";

const verticals = [
  { key: "shopping", href: "/", label: "Shopping", icon: ShoppingBag },
  { key: "flights", href: "/travel/flights", label: "Flights", icon: Plane },
  { key: "hotels", href: "/travel/hotels", label: "Hotels", icon: BedDouble },
] as const;

function activeKey(path: string): (typeof verticals)[number]["key"] {
  if (path.startsWith("/travel/hotels") || path.startsWith("/travel/guides")) return "hotels";
  if (path.startsWith("/travel")) return "flights";
  return "shopping";
}

/** Top-level vertical switcher (Shopping | Flights | Hotels). Pills on desktop, full-width segmented bar on mobile. */
export function VerticalSwitcher({ variant = "pills" }: { variant?: "pills" | "bar" }) {
  const path = usePathname() ?? "/";
  const current = activeKey(path);
  return (
    <nav aria-label="Switch between shopping and travel" data-testid="vertical-switcher">
      <ul className={cn("flex items-center", variant === "pills" ? "gap-1" : "w-full gap-0.5 rounded-md bg-surface-2 p-0.5")}>
        {verticals.map((v) => {
          const active = v.key === current;
          const travel = v.key !== "shopping";
          const currentIsTravel = current !== "shopping";
          // Switching between the shopping and travel areas slides horizontally (see globals.css).
          const transitionTypes = travel === currentIsTravel ? undefined : travel ? ["vertical-forward"] : ["vertical-back"];
          return (
            <li key={v.key} className={variant === "bar" ? "flex-1" : undefined}>
              <Link
                href={v.href}
                transitionTypes={transitionTypes}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  variant === "pills" ? "h-7 rounded-full px-3 text-xs" : "h-9 w-full rounded-sm text-sm",
                  active
                    ? v.key === "hotels"
                      ? "bg-hotels text-hotels-fg"
                      : v.key === "flights"
                        ? "bg-flights-action text-flights-action-fg"
                        : "bg-primary text-primary-fg"
                    : variant === "pills"
                      ? "text-text-muted hover:bg-surface-2 hover:text-text"
                      : "text-text-muted hover:text-text",
                )}
              >
                <v.icon aria-hidden className="size-3.5" />
                {v.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
