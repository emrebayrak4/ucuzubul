import Link from "next/link";
import { load, serverApi } from "@/lib/api-server";
import { Logo } from "@/components/logo";
import { VerticalSwitcher } from "@/components/vertical-switcher";
import { SearchBox } from "./search-box";
import { AccountArea, AlertsButton, BasketButton, FavoritesButton, MegaMenu, MobileNav, NavLinks, ZipButton } from "./header-client";

/** Marketplace-style white header: promo strip + vertical switcher, logo/search/actions row, category nav row. */
export async function SiteHeader() {
  const api = await serverApi({ revalidate: 3600 });
  const [cats, stores] = await Promise.all([load(() => api.catalog.categories()), load(() => api.catalog.retailers())]);
  const categories = cats.ok ? cats.data.items : null;
  const storeCount = stores.ok ? stores.data.items.length : null;
  const topCategories = (categories ?? [])
    .slice()
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 5)
    .map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <header className="sticky top-0 z-sticky bg-surface shadow-[0_1px_0_var(--pc-color-border)]" style={{ viewTransitionName: "site-header" }}>
      <div className="border-b border-border bg-surface-2">
        <div className="container-content flex h-9 items-center justify-between gap-4 text-xs">
          <div className="hidden lg:block">
            <VerticalSwitcher />
          </div>
          <p className="truncate text-text-muted">
            Compare prices across {storeCount ? <span className="price font-semibold text-text">{storeCount}</span> : "many"} US stores ·{" "}
            <Link href="/account/alerts" className="font-semibold text-primary underline underline-offset-2">
              Free price alerts
            </Link>
          </p>
          <ZipButton compact className="shrink-0" />
        </div>
      </div>
      <div className="bg-primary text-primary-fg">
      <div className="container-content flex h-16 items-center gap-3 lg:h-[72px] lg:gap-6">
        <MobileNav categories={categories} />
        <Logo inverted height={46} imgClassName="h-[34px] lg:h-[46px]" />
        <div className="hidden max-w-[760px] flex-1 lg:block">
          <SearchBox size="lg" />
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <AccountArea />
          <div className="hidden items-center sm:flex">
            <AlertsButton />
            <FavoritesButton />
          </div>
          <BasketButton />
        </div>
      </div>
      <div className="container-content pb-3 lg:hidden">
        <SearchBox size="md" autoFocusShortcut={false} testId="search-input-mobile" />
      </div>
      </div>
      <div className="container-content py-2 lg:hidden">
        <VerticalSwitcher variant="bar" />
      </div>
      <nav aria-label="Primary" className="hidden border-t border-border lg:block">
        <div className="container-content flex h-11 items-center gap-6">
          <MegaMenu categories={categories} />
          <span aria-hidden className="h-5 w-px bg-border" />
          <NavLinks topCategories={topCategories} />
        </div>
      </nav>
    </header>
  );
}
