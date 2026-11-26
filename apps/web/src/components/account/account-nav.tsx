"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Heart, LayoutDashboard, ListChecks, Settings, ShieldCheck } from "lucide-react";
import { cn } from "@pricora/ui";

const links = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/saved", label: "Saved", icon: Heart },
  { href: "/account/alerts", label: "Alerts", icon: Bell },
  { href: "/account/lists", label: "Lists", icon: ListChecks },
  { href: "/account/settings", label: "Settings", icon: Settings },
  { href: "/account/privacy", label: "Privacy", icon: ShieldCheck },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="lg:w-52 lg:shrink-0">
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {links.map((l) => {
          const active = path === l.href;
          return (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium",
                  active ? "bg-primary-soft text-primary-soft-fg" : "text-text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <l.icon aria-hidden className="size-4" />
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
