"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  Bell,
  ChevronDown,
  GitCompareArrows,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  User as UserIcon,
  Heart,
  ListChecks,
  Percent,
  TrendingDown,
  ShoppingBasket,
  Sun,
  Ticket,
} from "lucide-react";
import type { CategoryNode } from "@pricora/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Sheet,
  SheetContent,
  SheetTitle,
  Skeleton,
  cn,
} from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { basketStore } from "@/lib/basket-store";
import { compareHref, compareStore } from "@/lib/compare-store";
import { CategoryCircle } from "@/components/catalog/category-circle";
import { loginHref } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { useZip } from "@/components/zip-provider";
import { VerticalSwitcher } from "@/components/vertical-switcher";

export const primaryNav = [
  { href: "/deals", label: "Deals", icon: Percent },
  { href: "/price-drops", label: "Price Drops", icon: TrendingDown },
  { href: "/coupons", label: "Coupons", icon: Ticket },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/basket", label: "Smart Basket", icon: ShoppingBasket },
] as const;

function useCurrentPath(): string {
  return usePathname() ?? "/";
}

/* ---------------------------------------------------------------- ZIP */

export function ZipButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { zip, meta, openZipDialog } = useZip();
  const estimated = meta?.source === "edge" && zip;
  return (
    <button
      type="button"
      onClick={openZipDialog}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm font-medium text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "text-xs" : "h-8 px-2 text-sm",
        className,
      )}
      data-testid="zip-button"
      aria-label={estimated ? `Estimated ZIP ${zip}, change` : zip ? `Delivery ZIP ${zip}, change` : "Set ZIP code for tax estimates"}
      title={meta?.confidence ? `ZIP ${meta.confidence === "high" ? "matched" : "estimated"} (${meta.confidence} confidence)` : undefined}
    >
      <MapPin aria-hidden className="size-3.5" />
      <span className="price">
        {estimated ? (
          <>
            Estimated: {zip} <span className="underline underline-offset-2">· change</span>
          </>
        ) : zip ? (
          `Deliver to ${zip}`
        ) : (
          "Set ZIP for tax"
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------ Header actions */

function ActionLink({
  href,
  icon: Icon,
  label,
  count,
  testId,
  badgeTone = "primary",
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  count?: number;
  testId?: string;
  badgeTone?: "primary" | "accent";
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="hover-bounce-icon group relative flex flex-col items-center gap-0.5 rounded-md px-2 py-1 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      aria-label={count ? `${label} (${count})` : label}
    >
      <span className="relative">
        <Icon aria-hidden className="size-[22px]" />
        {count ? (
          <span
            className={cn(
              "price absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold",
              badgeTone === "primary" ? "bg-surface text-primary ring-1 ring-primary" : "bg-accent text-accent-fg",
            )}
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className="hidden text-sm font-semibold xl:block">{label}</span>
    </Link>
  );
}

export function AlertsButton() {
  const { user } = useSession();
  const count = useQuery({
    queryKey: ["me", "alerts", "count"],
    queryFn: () => api.me.alerts.list({ page: 1, pageSize: 1 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  return <ActionLink href={user ? "/account/alerts" : loginHref("/account/alerts")} icon={Bell} label="Alerts" count={user ? count.data?.total : undefined} />;
}

export function FavoritesButton() {
  const { user } = useSession();
  const count = useQuery({
    queryKey: ["me", "favorites", "count"],
    queryFn: () => api.me.favorites.list({ page: 1, pageSize: 1 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  return <ActionLink href={user ? "/account/saved" : loginHref("/account/saved")} icon={Heart} label="Favorites" count={user ? count.data?.total : undefined} />;
}

export function BasketButton() {
  const items = basketStore.use();
  const n = items.reduce((s, i) => s + i.qty, 0);
  return <ActionLink href="/basket" icon={ShoppingBasket} label="Basket" count={n} badgeTone="accent" testId="header-basket" />;
}

export function CompareButton() {
  const items = compareStore.use();
  return <ActionLink href={items.length >= 2 ? compareHref(items) : "/compare"} icon={GitCompareArrows} label="Compare" count={items.length} badgeTone="accent" />;
}

function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")} data-testid="theme-toggle">
      {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </DropdownMenuItem>
  );
}

export function AccountArea() {
  const { user, loading, logout } = useSession();
  const path = useCurrentPath();
  if (loading) return <Skeleton className="h-10 w-28 opacity-40" />;
  if (!user) {
    const next = path.startsWith("/login") || path.startsWith("/signup") ? "/" : path;
    return (
      <Link
        href={loginHref(next)}
        data-testid="header-login"
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <UserIcon aria-hidden className="size-[22px]" />
        <span className="hidden flex-col leading-tight sm:flex">
          <span className="text-2xs opacity-85">Hello</span>
          <span className="text-sm font-bold">Log in / Sign up</span>
        </span>
        <span className="sr-only sm:hidden">Log in or sign up</span>
      </Link>
    );
  }
  const first = (user.name ?? user.email).split(/[\s@]/)[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          aria-label="Account menu"
          data-testid="account-menu"
        >
          <UserIcon aria-hidden className="size-[22px]" />
          <span className="hidden flex-col text-left leading-tight sm:flex">
            <span className="max-w-28 truncate text-2xs opacity-85">Hi, {first}</span>
            <span className="flex items-center gap-0.5 text-sm font-bold">
              Account <ChevronDown aria-hidden className="size-3" />
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          <span className="block truncate text-sm text-text">{user.name ?? "Your account"}</span>
          <span className="block truncate text-xs font-normal text-text-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {[
          { href: "/account", label: "Account", icon: UserIcon },
          { href: "/account/saved", label: "Saved", icon: Heart },
          { href: "/account/alerts", label: "Alerts", icon: Bell },
          { href: "/account/lists", label: "Lists", icon: ListChecks },
          { href: "/account/settings", label: "Settings", icon: Settings },
          { href: "/account/privacy", label: "Privacy", icon: ShieldCheck },
        ].map((l) => (
          <DropdownMenuItem key={l.href} asChild>
            <Link href={l.href}>
              <l.icon aria-hidden className="size-4" />
              {l.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <ThemeMenuItem />
        <DropdownMenuItem onSelect={() => void logout()} data-testid="logout">
          <LogOut aria-hidden className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------- Mega menu */

export function MegaMenu({ categories }: { categories: CategoryNode[] | null }) {
  const [open, setOpen] = React.useState(false);
  const path = useCurrentPath();
  React.useEffect(() => setOpen(false), [path]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap pr-2 text-[13.5px] font-semibold text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="categories-menu"
        >
          <LayoutGrid aria-hidden className="size-4" />
          All categories
          <ChevronDown aria-hidden className="size-3.5 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(1200px,calc(100vw-2rem))] p-6" align="start" sideOffset={0}>
        {categories === null ? (
          <p className="text-sm text-text-muted">Categories are unavailable right now. Please try again shortly.</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-text-muted">No categories yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <div key={c.id} className="min-w-0">
                <Link href={`/categories/${c.slug}`} className="group flex items-center gap-2.5 text-sm font-semibold text-text hover:text-primary">
                  <CategoryCircle slug={c.slug} size={36} />
                  <span className="truncate">{c.name}</span>
                </Link>
                {c.children.length ? (
                  <ul className="mt-1.5 space-y-1 pl-[46px]">
                    {c.children.slice(0, 5).map((ch) => (
                      <li key={ch.id}>
                        <Link href={`/categories/${ch.slug}`} className="block truncate text-xs text-text-muted hover:text-text hover:underline">
                          {ch.name}
                        </Link>
                      </li>
                    ))}
                    {c.children.length > 5 ? (
                      <li>
                        <Link href={`/categories/${c.slug}`} className="text-xs font-medium text-primary hover:underline">
                          All {c.name}
                        </Link>
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function NavLinks({ topCategories }: { topCategories: Array<{ slug: string; name: string }> }) {
  const path = useCurrentPath();
  const links = [...primaryNav.map((l) => ({ href: l.href, label: l.label })), ...topCategories.map((c) => ({ href: `/categories/${c.slug}`, label: c.name }))];
  // Priority+ nav: show what fits on one line, collapse the rest into "More". SSR renders all items (clipped, never scrolls).
  const listRef = React.useRef<HTMLUListElement>(null);
  const widths = React.useRef<number[]>([]);
  const [visible, setVisible] = React.useState(links.length);
  const total = links.length;

  const fit = React.useCallback(() => {
    const ul = listRef.current;
    if (!ul || widths.current.length !== total) return;
    const gap = parseFloat(getComputedStyle(ul).columnGap) || 0;
    const avail = ul.clientWidth;
    const moreW = 76;
    const sum = widths.current.reduce((a, w) => a + w + gap, -gap);
    if (sum <= avail) return setVisible(total);
    let used = 0;
    let n = 0;
    for (const w of widths.current) {
      const next = used + (n ? gap : 0) + w;
      if (next + gap + moreW > avail) break;
      used = next;
      n++;
    }
    setVisible(n);
  }, [total]);

  const measure = React.useCallback(() => {
    const ul = listRef.current;
    if (!ul) return;
    const items = [...ul.querySelectorAll<HTMLLIElement>("li[data-nav-item]")];
    if (items.length !== total) return;
    // Hidden (collapsed) items keep their last measured width.
    widths.current = items.map((li, i) => (li.classList.contains("hidden") ? (widths.current[i] ?? 0) : li.getBoundingClientRect().width));
    fit();
  }, [fit, total]);

  React.useLayoutEffect(() => {
    measure();
    void document.fonts?.ready.then(() => requestAnimationFrame(measure));
  }, [measure, total]);

  React.useEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(ul);
    return () => ro.disconnect();
  }, [fit]);

  const hidden = links.slice(visible);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-5">
      <ul ref={listRef} className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden">
        {links.map((l, i) => {
          const active = path === l.href || path.startsWith(l.href + "/");
          return (
            <li key={l.href} data-nav-item className={cn("shrink-0", i >= visible && "hidden")}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center whitespace-nowrap border-b-2 text-[13.5px] font-medium transition-colors duration-fast",
                  active ? "border-primary text-primary" : "border-transparent text-text hover:text-primary",
                )}
              >
                {l.href === "/coupons" ? <Ticket aria-hidden className="mr-1 size-4" /> : null}
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 shrink-0 items-center gap-1 whitespace-nowrap text-[13.5px] font-medium text-text hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              More
              <ChevronDown aria-hidden className="size-3.5 text-text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hidden.map((l) => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href} aria-current={path === l.href ? "page" : undefined}>
                  {l.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- Mobile nav */

export function MobileNav({ categories }: { categories: CategoryNode[] | null }) {
  const [open, setOpen] = React.useState(false);
  const path = useCurrentPath();
  const { user, logout } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  React.useEffect(() => setOpen(false), [path]);
  return (
    <>
      <IconButton label="Open menu" onClick={() => setOpen(true)} className="text-current hover:bg-primary-hover focus-visible:ring-current lg:hidden" data-testid="mobile-menu">
        <Menu aria-hidden className="size-5" />
      </IconButton>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="gap-3 p-4">
          <SheetTitle className="text-md">Menu</SheetTitle>
          <VerticalSwitcher variant="bar" />
          <nav aria-label="Main">
            <ul className="space-y-0.5">
              {[...primaryNav, { href: "/account/alerts", label: "Price Alerts", icon: Bell }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex h-11 items-center gap-3 rounded-md px-2 text-base font-medium hover:bg-surface-2">
                    <l.icon aria-hidden className="size-4 text-text-muted" />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Separator />
          <div>
            <p className="px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-text-muted">Categories</p>
            {categories?.length ? (
              <ul className="space-y-0.5">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/categories/${c.slug}`} className="group flex h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-surface-2">
                      <CategoryCircle slug={c.slug} size={32} />
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 text-sm text-text-muted">Categories unavailable right now.</p>
            )}
          </div>
          <Separator />
          <div className="flex flex-col gap-2 pb-4">
            <ZipButton className="justify-start" />
            {user ? (
              <>
                <Button asChild variant="secondary" fullWidth>
                  <Link href="/account">Your account</Link>
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                  {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
                </Button>
                <Button variant="ghost" fullWidth onClick={() => void logout()}>
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Button asChild fullWidth>
                  <Link href="/signup">Sign up</Link>
                </Button>
                <Button asChild variant="secondary" fullWidth>
                  <Link href={loginHref(path)}>Log in</Link>
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
