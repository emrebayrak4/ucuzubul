import Link from "next/link";
import { GitCompareArrows } from "lucide-react";
import type { ProductCard } from "@pricora/contracts";
import { CategoryIcon, DemoDataBadge } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";

/**
 * "Compare with" list: other-brand alternatives in the same category and price band, each with the price
 * difference and a one-click side-by-side comparison. Chosen by category + price + specs — not popularity.
 */
export function CompareWithList({ current, currentPriceCents, items }: { current: { id: string; title: string }; currentPriceCents: number | null; items: ProductCard[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="compare-with-title" data-testid="compare-with">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="compare-with-title" className="text-xl font-bold tracking-tight">
          Compare with alternatives
        </h2>
        <Link href={`/compare?ids=${[current.id, ...items.slice(0, 3).map((i) => i.id)].join(",")}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <GitCompareArrows aria-hidden className="size-4" /> Compare all {Math.min(4, items.length + 1)}
        </Link>
      </div>
      <p className="mb-3 text-xs text-text-muted">Other brands in the same category within ±40% of this price.</p>
      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {items.map((p) => {
          const diff = currentPriceCents !== null && p.lowestPriceCents !== null ? p.lowestPriceCents - currentPriceCents : null;
          return (
            <li key={p.id} className="flex items-center gap-3 p-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-surface-2">
                {p.image ? <img src={p.image.url} alt="" className="size-full object-contain p-1" loading="lazy" /> : <CategoryIcon category={p.category?.slug ?? null} size={26} className="opacity-60" />}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/products/${p.slug}`} className="line-clamp-1 text-sm font-medium hover:text-primary hover:underline">
                  {p.title}
                </Link>
                <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{(p.keySpecs ?? []).join(" · ")}</p>
                {p.hasDemoData ? <DemoDataBadge size="sm" label="Demo" className="mt-1" /> : null}
              </div>
              <div className="shrink-0 text-right">
                {p.lowestPriceCents !== null ? <p className="price text-sm font-bold">{formatPrice(p.lowestPriceCents, { currency: p.currency })}</p> : null}
                {diff !== null && diff !== 0 ? (
                  <p className={"price text-xs " + (diff < 0 ? "text-success" : "text-text-muted")}>
                    {diff < 0 ? "−" : "+"}
                    {formatPrice(Math.abs(diff), { currency: p.currency, trimZeroCents: true })} vs this
                  </p>
                ) : null}
                <Link href={`/compare?ids=${current.id},${p.id}`} className="text-xs font-semibold text-primary hover:underline" aria-label={`Compare ${current.title} with ${p.title}`}>
                  Compare
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
