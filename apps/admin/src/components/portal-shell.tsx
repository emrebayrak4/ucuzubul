"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ViewTransition, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Cable,
  BadgeDollarSign,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileUp,
  FolderTree,
  GitMerge,
  Handshake,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  ShieldAlert,
  Store,
  Tag,
  ToggleRight,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import {
  Avatar,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Sheet,
  SheetContent,
  SheetTitle,
  cn,
  toast,
} from "@pricora/ui";
import type { PublicUser } from "@pricora/contracts";
import { getApi, errorMessage } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/roles";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import type { IconName, NavGroup } from "./nav";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  products: Package,
  categories: FolderTree,
  brands: Tag,
  retailers: Store,
  offers: BadgeDollarSign,
  matching: GitMerge,
  anomalies: ShieldAlert,
  affiliate: Handshake,
  subscriptions: CreditCard,
  campaigns: Megaphone,
  flags: ToggleRight,
  audit: ClipboardList,
  health: Activity,
  profile: Building2,
  feeds: FileUp,
  analytics: BarChart3,
  keys: KeyRound,
  webhooks: Webhook,
  integrations: Cable,
  docs: BookOpen,
};

function NavList({ groups, role, onNavigate }: { groups: NavGroup[]; role: PublicUser["role"]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex flex-col gap-5 px-3 py-4">
      {groups.map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={g.label}>
            <p className="px-2 pb-1.5 text-2xs font-medium tracking-wide text-text-muted uppercase">{g.label}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const root = item.href === "/admin" || item.href === "/merchant";
                const active = root ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-fast",
                        active
                          ? "bg-primary-soft font-medium text-primary-soft-fg"
                          : "text-text-muted hover:bg-surface-2 hover:text-text",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.pending ? (
                        <span className="ml-auto shrink-0 text-2xs text-text-muted" title="API endpoint not available yet">
                          API pending
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function PortalShell({
  user,
  groups,
  portalLabel,
  children,
}: {
  user: PublicUser;
  groups: NavGroup[];
  portalLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function logout() {
    try {
      await getApi().auth.logout();
    } catch (err) {
      toast.error(errorMessage(err));
    }
    router.replace("/login");
    router.refresh();
  }

  const homeHref = groups[0]?.items[0]?.href ?? "/";

  return (
    <div className="flex min-h-screen">
      <NavProgress />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Link href={homeHref} aria-label="Home">
            <Logo suffix={portalLabel} />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavList groups={groups} role={user.role} />
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center border-b border-border px-5">
            <Logo suffix={portalLabel} />
          </div>
          <NavList groups={groups} role={user.role} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-sticky flex h-14 items-center gap-2 border-b border-border bg-surface px-4 lg:px-6">
          <IconButton label="Open navigation" variant="ghost" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-4" aria-hidden />
          </IconButton>
          <span className="lg:hidden">
            <Logo suffix={portalLabel} />
          </span>
          <div className="ml-auto flex items-center gap-2">
            {process.env.NODE_ENV !== "production" ? (
              <Badge variant="warning" size="sm">
                Development
              </Badge>
            ) : null}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
                  aria-label="Account menu"
                >
                  <Avatar name={user.name ?? user.email} size="sm" />
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm leading-tight font-medium">{user.name ?? user.email}</span>
                    <span className="block text-2xs leading-tight text-text-muted">{ROLE_LABEL[user.role]}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm">{user.email}</span>
                  <span className="block text-xs font-normal text-text-muted">Role: {ROLE_LABEL[user.role]}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="size-4" aria-hidden /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {/* Route changes crossfade only the content area (150ms); sidebar and header stay static. */}
          <ViewTransition default="pc-page">{children}</ViewTransition>
        </main>
      </div>
    </div>
  );
}
