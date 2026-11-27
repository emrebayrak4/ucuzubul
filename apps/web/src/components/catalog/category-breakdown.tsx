import Link from "next/link";
import type { CategoryCount } from "@pricora/contracts";
import { CategoryIcon } from "@pricora/ui";

/**
 * Brand / store category breakdown: leaf categories grouped under their parent, with product counts.
 * Each tile opens the category pre-filtered to this brand or store.
 */
export function CategoryBreakdown({ items, param, value, name }: { items: CategoryCount[]; param: "brand" | "retailer"; value: string; name: string }) {
  if (!items.length) return null;
  const total = items.reduce((n, c) => n + c.count, 0);
  const groups = new Map<string, { parent: CategoryCount["parent"]; items: CategoryCount[]; count: number }>();
  for (const c of items) {
    const key = c.parent?.slug ?? c.slug;
    const g = groups.get(key) ?? { parent: c.parent, items: [], count: 0 };
    g.items.push(c);
    g.count += c.count;
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count);
  // Brand × category has a curated, crawlable page (/brands/[brand]/[category]); store × category stays a facet URL.
  const hrefFor = (cat: string) => (param === "brand" ? `/brands/${value}/${cat}` : `/categories/${cat}?${param}=${value}`);
  return (
    <section aria-labelledby="breakdown-title" className="mb-(--pc-section-gap)" data-testid="category-breakdown">
      <h2 id="breakdown-title" className="mb-3 text-lg font-bold">
        {name} by category <span className="price text-sm font-normal text-text-muted">· {total.toLocaleString("en-US")} products</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.slice(0, 12).map((g) => (
          <div key={g.parent?.slug ?? g.items[0]!.slug} className="rounded-md border border-border bg-surface p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <CategoryIcon category={g.parent?.slug ?? g.items[0]!.slug} size={18} />
              {g.parent ? (
                <Link href={hrefFor(g.parent.slug)} className="hover:text-primary hover:underline">
                  {g.parent.name}
                </Link>
              ) : (
                g.items[0]!.name
              )}
              <span className="price ml-auto text-xs font-normal text-text-muted">{g.count}</span>
            </p>
            <ul className="space-y-1">
              {g.items.slice(0, 6).map((c) => {
                const pct = Math.max(4, Math.round((c.count / g.count) * 100));
                return (
                  <li key={c.slug}>
                    <Link href={hrefFor(c.slug)} className="group block text-sm">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate group-hover:text-primary group-hover:underline">{c.name}</span>
                        <span className="price text-xs text-text-muted">{c.count}</span>
                      </span>
                      <span aria-hidden className="mt-0.5 block h-1 rounded-full bg-surface-2">
                        <span className="block h-1 rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
