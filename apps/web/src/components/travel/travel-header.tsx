"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BedDouble, BellRing, BookOpen, Compass, Plane } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { cn } from "@pricora/ui";
import { loginHref } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { VerticalSwitcher } from "@/components/vertical-switcher";
import { AccountArea } from "@/components/header/header-client";

export function travelVertical(path: string): "flights" | "hotels" {
  return path.startsWith("/travel/hotels") || path.startsWith("/travel/guides") ? "hotels" : "flights";
}

const tabs = [
  { key: "hotels", href: "/travel/hotels", label: "Stays", icon: BedDouble },
  { key: "flights", href: "/travel/flights", label: "Flights", icon: Plane },
  { key: "guides", href: "/travel/guides", label: "Guides", icon: BookOpen },
  { key: "explore", href: "/travel", label: "Explore", icon: Compass },
] as const;

function TravelAccount() {
  const { user, loading } = useSession();
  const path = usePathname() ?? "/travel";
  if (loading || user) return <AccountArea />;
  return (
    <div className="flex items-center gap-2">
      <Link href={"/signup?next=" + encodeURIComponent(path)} className="hidden h-9 items-center rounded-md bg-surface px-3 text-sm font-bold text-text hover:bg-surface-2 sm:inline-flex">
        Sign up
      </Link>
      <Link href={loginHref(path)} className="inline-flex h-9 items-center rounded-md bg-surface px-3 text-sm font-bold text-text hover:bg-surface-2" data-testid="header-login">
        Log in
      </Link>
    </div>
  );
}

/**
 * Travel header (Booking/Skyscanner-like): big white wordmark + vertical label, account buttons,
 * and a vertical tabs row. Navy for flights/explore, red for hotels. No product search or basket.
 */
export function TravelHeader() {
  const path = usePathname() ?? "/travel";
  const v = travelVertical(path);
  const current = path.startsWith("/travel/hotels") ? "hotels" : path.startsWith("/travel/flights") ? "flights" : path.startsWith("/travel/guides") ? "guides" : "explore";
  const label = current === "hotels" ? "Hotels" : current === "flights" ? "Flights" : current === "guides" ? "Guides" : "Travel";
  return (
    <header className="sticky top-0 z-sticky" style={{ viewTransitionName: "site-header" }} data-testid="travel-header">
      <div className="hidden border-b border-border bg-surface-2 lg:block">
        <div className="container-content flex h-9 items-center justify-between text-xs">
          <VerticalSwitcher />
          <p className="text-text-muted">Real fares and rates from connected providers only — nothing estimated.</p>
        </div>
      </div>
      <div className={cn(v === "hotels" ? "bg-hotels text-hotels-fg" : "bg-flights text-flights-fg")}>
        <div className="container-content flex h-16 items-center gap-3 lg:h-[72px]">
          <Link href={current === "flights" || current === "explore" ? "/travel/flights" : "/travel/hotels"} className="flex shrink-0 items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" aria-label={`${brand.name} ${label}`}>
            <img src="/brand/wordmark-white.png" alt={brand.name} width={104} height={42} className="block h-[34px] w-auto lg:h-[42px]" />
            <span className="text-xl font-light tracking-tight lg:text-2xl">{label}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/travel#fare-alerts" className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current md:inline-flex">
              <BellRing aria-hidden className="size-4" />
              Trip alerts
            </Link>
            <TravelAccount />
          </div>
        </div>
        <nav aria-label="Travel" className="container-content pb-3">
          <ul className="scrollbar-none flex gap-2 overflow-x-auto">
            {tabs.map((t) => {
              const on = t.key === current;
              return (
                <li key={t.key} className="shrink-0">
                  <Link
                    href={t.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
                      on ? (v === "hotels" ? "border-current bg-white/15" : "border-flights-action bg-flights-action text-flights-action-fg") : "border-transparent hover:bg-white/10",
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
      </div>
      <div className="bg-surface py-2 lg:hidden">
        <div className="container-content">
          <VerticalSwitcher variant="bar" />
        </div>
      </div>
    </header>
  );
}
