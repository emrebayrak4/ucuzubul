import { load, serverApi } from "@/lib/api-server";
import { Logo } from "@/components/logo";
import { VerticalSwitcher } from "@/components/vertical-switcher";
import { TRAVEL_ENABLED } from "@/lib/features";
import { SearchBox } from "./search-box";
import { AccountArea, AlertsButton, FavoritesButton, MegaMenu, MobileNav, NavLinks, ZipButton } from "./header-client";

/** Marketplace-style header: blue logo/search/actions bar + category nav row (ZIP control at the right of the nav row). */
export async function SiteHeader() {
  const api = await serverApi({ revalidate: 3600 });
  const cats = await load(() => api.catalog.categories());
  const categories = cats.ok ? cats.data.items : null;
  const topCategories = (categories ?? [])
    .slice()
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 5)
    .map((c) => ({ slug: c.slug, name: c.name }));

  return (
    <header className="sticky top-0 z-sticky bg-surface shadow-[0_1px_0_var(--pc-color-border)]" style={{ viewTransitionName: "site-header" }}>
      <div className="bg-primary text-primary-fg">
      <div className="container-content flex h-16 items-center gap-3 lg:h-[66px] lg:gap-6">
        <MobileNav categories={categories} />
        <Logo inverted height={28} imgClassName="h-[22px] lg:h-[28px]" />
        <div className="hidden max-w-[800px] flex-1 lg:block">
          <SearchBox size="lg" />
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <AccountArea />
          <div className="hidden items-center sm:flex">
            <AlertsButton />
            <FavoritesButton />
          </div>
        </div>
      </div>
      <div className="container-content pb-3 lg:hidden">
        <SearchBox size="md" autoFocusShortcut={false} testId="search-input-mobile" />
        <div className="mt-2 flex justify-end">
          <ZipButton compact className="shrink-0" />
        </div>
      </div>
      </div>
      {TRAVEL_ENABLED ? (
        <div className="container-content py-2 lg:hidden">
          <VerticalSwitcher variant="bar" />
        </div>
      ) : null}
      <nav aria-label="Primary" className="hidden border-t border-border lg:block">
        <div className="container-content flex h-11 items-center gap-6">
          <MegaMenu categories={categories} />
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          <NavLinks topCategories={topCategories} />
          <ZipButton compact className="ml-auto shrink-0" />
        </div>
      </nav>
    </header>
  );
}
