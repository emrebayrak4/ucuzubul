"use client";

import * as React from "react";
import Link from "next/link";
import type { ProductCard } from "@pricora/contracts";
import { ProductRail, Tabs, TabsContent, TabsList, TabsTrigger } from "@pricora/ui";
import { ProductCardTile } from "./product-card";

export function Rail({
  title,
  description,
  seeAllHref,
  headerExtra,
  children,
  testId,
}: {
  title: string;
  description?: React.ReactNode;
  seeAllHref?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId}>
      <ProductRail title={title} description={description} seeAllHref={seeAllHref} headerExtra={headerExtra} linkComponent={Link}>
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="under-price-title" className="text-xl font-semibold tracking-tight">
              Great finds under
            </h2>
            <TabsList variant="segmented" aria-label="Price cap">
              {available.map((g) => (
                <TabsTrigger key={g.key} value={g.key} className="price">
                  {g.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {current ? (
            <Link href={`/search?maxPrice=${current.maxCents}&sort=best_deal`} className="text-sm font-medium text-primary hover:underline">
              See all {current.label === "$25" ? "under $25" : `under ${current.label}`}
            </Link>
          ) : null}
        </div>
        {available.map((g) => (
          <TabsContent key={g.key} value={g.key} className="mt-0">
            <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {g.products.map((p) => (
                <li
                  key={p.id}
                  className="w-[44%] shrink-0 snap-start sm:w-[30.5%] md:w-[calc((100%-3*0.75rem)/4)] lg:w-[calc((100%-4*0.75rem)/5)] xl:w-[calc((100%-5*0.75rem)/6)]"
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
