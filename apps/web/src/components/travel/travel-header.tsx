"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, BellRing, Compass, Plane } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { cn } from "@pricora/ui";
import { VerticalSwitcher } from "@/components/vertical-switcher";
import { AccountArea } from "@/components/header/header-client";

const tabs = [
  { href: "/travel", label: "Explore", icon: Compass, exact: true },
  { href: "/travel/flights", label: "Flights", icon: Plane },
  { href: "/travel/hotels", label: "Hotels", icon: BedDouble },
];

/** Travel area header: own identity, no product search / categories / basket. */
export function TravelHeader() {
  const path = usePathname() ?? "/travel";
  return (
    <header className="sticky top-0 z-sticky bg-surface shadow-[0_1px_0_var(--pc-color-border)]" style={{ viewTransitionName: "site-header" }} data-testid="travel-header">
      <div className="hidden border-b border-border bg-surface-2 lg:block">
        <div className="container-content flex h-9 items-center justify-between text-xs">
          <VerticalSwitcher />
          <p className="text-text-muted">Real fares and rates from connected providers only — nothing estimated.</p>
        </div>
      </div>
      <div className="container-content flex h-16 items-center gap-4">
        <Link href="/travel" className="flex shrink-0 items-center gap-2 rounded-sm" aria-label={`${brand.name} Travel home`}>
          <svg viewBox="0 0 24 24" aria-hidden className="size-7">
            <rect x="1" y="1" width="22" height="22" rx="5" className="fill-travel" />
            <path d="M7 16.5V7.5h5.2a3.2 3.2 0 0 1 0 6.4H9.6" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="stroke-travel-fg" />
            <circle cx="16.6" cy="16.4" r="1.7" className="fill-accent" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">{brand.name}</span>
          <span className="rounded-sm bg-travel-soft px-1.5 py-0.5 text-xs font-semibold text-travel-soft-fg">Travel</span>
        </Link>
        <nav aria-label="Travel" className="ml-2 hidden md:block">
          <ul className="flex items-center gap-1">
            {tabs.map((t) => {
              const active = t.exact ? path === t.href : path.startsWith(t.href);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors",
                      active ? "bg-travel-soft text-travel-soft-fg" : "text-text hover:bg-surface-2",
                    )}
                  >
                    <t.icon aria-hidden className="size-4" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/travel#fare-alerts" className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-text hover:text-travel sm:inline-flex">
            <BellRing aria-hidden className="size-4" />
            Trip alerts
          </Link>
          <AccountArea />
        </div>
      </div>
      <div className="container-content pb-2 lg:hidden">
        <VerticalSwitcher variant="bar" />
      </div>
    </header>
  );
}
