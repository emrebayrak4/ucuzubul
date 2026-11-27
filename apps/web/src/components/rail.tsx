"use client";

import * as React from "react";
import Link from "next/link";
import type { ProductCard } from "@pricora/contracts";
import { ProductRail, SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger, railItemClass, sectionActionLinkClass } from "@pricora/ui";
import { ProductCardTile } from "./product-card";

export function Rail({
  title,
  description,
  seeAllHref,
  headerExtra,
  children,
  testId,
  autoAdvance,
}: {
  title: string;
  description?: React.ReactNode;
  seeAllHref?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  /** Slowly advance one tile at a time (pauses on hover/focus/touch; off with reduced motion). */
  autoAdvance?: boolean;
}) {
  return (
    <div data-testid={testId}>
      <ProductRail title={title} description={description} seeAllHref={seeAllHref} headerExtra={headerExtra} linkComponent={Link} autoAdvance={autoAdvance}>
        {children}
      </ProductRail>
    </div>
  );
}

export function ProductCardRail({
  title,
  description,
  seeAllHref,
  products,
  testId,
}: {
  title: string;
  description?: React.ReactNode;
  seeAllHref?: string;
  products: ProductCard[];
  testId?: string;
}) {
  if (products.length === 0) return null;
  return (
    <Rail title={title} description={description} seeAllHref={seeAllHref} testId={testId}>
      {products.map((p) => (
        <ProductCardTile key={p.id} product={p} />
      ))}
    </Rail>
  );
}

/** "Under $25 / $50 / $100" in one rail with segmented tabs (DESIGN_SYSTEM §13.2 #8). */
export function UnderPriceRail({ groups }: { groups: Array<{ key: string; label: string; maxCents: number; products: ProductCard[] }> }) {
  const available = groups.filter((g) => g.products.length > 0);
  const [tab, setTab] = React.useState(available[0]?.key ?? "");
  if (available.length === 0) return null;
  const current = available.find((g) => g.key === tab) ?? available[0];
  return (
    <section aria-labelledby="under-price-title" data-testid="rail-under-price">
      <Tabs value={tab} onValueChange={setTab}>
        <SectionHeader
          titleId="under-price-title"
          title="Great finds under"
          extra={
            <TabsList variant="segmented" aria-label="Price cap">
              {available.map((g) => (
                <TabsTrigger key={g.key} value={g.key} className="price">
                  {g.label}
                </TabsTrigger>
              ))}
            </TabsList>
          }
          actions={
            current ? (
              <Link href={`/search?maxPrice=${current.maxCents}&sort=best_deal`} className={sectionActionLinkClass}>
                See all {current.label === "$25" ? "under $25" : `under ${current.label}`}
              </Link>
            ) : null
          }
        />
        {available.map((g) => (
          <TabsContent key={g.key} value={g.key} className="mt-0">
            <ul className="scrollbar-none gap-grid -mx-4 flex snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
              {g.products.map((p) => (
                <li
                  key={p.id}
                  className={`${railItemClass} shrink-0 snap-start`}
                >
                  <ProductCardTile product={p} />
                </li>
              ))}
            </ul>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
