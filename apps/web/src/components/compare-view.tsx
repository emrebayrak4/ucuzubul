"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";
import type { CompareResponse } from "@pricora/contracts";
import { Button, CategoryIcon, DealScoreBadge, DemoDataBadge, EmptyState, Switch, Label, cn, formatPrice } from "@pricora/ui";
import { COMPARE_MAX, compareHref, compareStore, removeFromCompare } from "@/lib/compare-store";

type Row = { key: string; label: string; group: string | null; values: string[]; /** Numeric values where lower is better (prices) → best cell marked. */ nums?: (number | null)[] };

export function CompareTable({ data }: { data: CompareResponse }) {
  const router = useRouter();
  const [onlyDiff, setOnlyDiff] = React.useState(false);
  const products = data.products;
  const money = (c: number | null, cur: string) => (c === null ? "—" : formatPrice(c, { currency: cur }));

  const rows: Row[] = [
    { key: "lowest", label: "Lowest price", group: "Price", values: products.map((p) => money(p.card.lowestPriceCents, p.card.currency)), nums: products.map((p) => p.card.lowestPriceCents) },
    { key: "total", label: "Lowest est. total (excl. tax)", group: "Price", values: products.map((p) => money(p.card.lowestTotalCents, p.card.currency)), nums: products.map((p) => p.card.lowestTotalCents) },
    { key: "stores", label: "Stores", group: "Price", values: products.map((p) => String(p.card.storeCount)) },
    { key: "median", label: "90-day median", group: "Price", values: products.map((p) => money(p.priceStats.median90Cents, p.card.currency)) },
    { key: "atl", label: "Lowest ever", group: "Price", values: products.map((p) => money(p.priceStats.allTimeLowCents, p.card.currency)) },
    { key: "stock", label: "In stock", group: "Price", values: products.map((p) => (p.card.inStock ? "Yes" : "No")) },
    ...data.attributeKeys.map((k) => ({
      key: `${k.group ?? ""}:${k.name}`,
      label: k.name,
      group: k.group ?? "Specifications",
      values: products.map((p) => {
        const a = p.attributes.find((x) => x.name === k.name && (x.group ?? null) === (k.group ?? null)) ?? p.attributes.find((x) => x.name === k.name);
        return a ? `${a.value}${a.unit ? " " + a.unit : ""}` : "—";
      }),
    })),
  ];
  const differs = (r: Row) => new Set(r.values).size > 1;
  const visible = onlyDiff ? rows.filter(differs) : rows;
  let lastGroup: string | null = "__";

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <Switch id="only-diff" checked={onlyDiff} onCheckedChange={setOnlyDiff} />
        <Label htmlFor="only-diff" className="text-sm font-normal">
          Show only differences
        </Label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="compare-table" style={{ minWidth: 176 + products.length * 200 }}>
          <thead>
            <tr>
              <th scope="col" className="w-44 p-3 text-left align-bottom text-xs font-medium text-text-muted">
                Differences are highlighted
              </th>
              {products.map((p) => (
                <th key={p.card.id} scope="col" className="min-w-48 border-l border-border p-3 text-left align-top font-normal">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        removeFromCompare(p.card.id);
                        const rest = products.filter((x) => x.card.id !== p.card.id).map((x) => x.card.id);
                        router.push(rest.length >= 2 ? "/compare?ids=" + rest.join(",") : "/compare");
                      }}
                      className="absolute right-0 top-0 rounded-sm p-1 text-text-muted hover:bg-surface-2 hover:text-text"
                      aria-label={`Remove ${p.card.title} from comparison`}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                    <Link href={`/products/${p.card.slug}`} className="block">
                      <span className="mb-2 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-sm bg-surface-2">
                        {p.card.image ? (
                          <img src={p.card.image.url} alt={p.card.image.alt || p.card.title} className="size-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                        ) : (
                          <CategoryIcon category={p.card.category?.slug} size={40} />
                        )}
                      </span>
                      <span className="line-clamp-2 pr-6 font-medium hover:underline">{p.card.title}</span>
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {p.dealScore ? <DealScoreBadge score={p.dealScore.score} tier={p.dealScore.tier} size="sm" /> : null}
                      {p.card.hasDemoData ? <DemoDataBadge size="sm" /> : null}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const showGroup = r.group !== lastGroup;
              lastGroup = r.group;
              const diff = differs(r);
              return (
                <React.Fragment key={r.key}>
                  {showGroup ? (
                    <tr>
                      <th colSpan={products.length + 1} scope="colgroup" className="bg-surface-2 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {r.group}
                      </th>
                    </tr>
                  ) : null}
                  <tr className={cn("border-t border-border", diff && "bg-accent/15")} data-differs={diff || undefined}>
                    <th scope="row" className="p-3 text-left font-normal text-text-muted">
                      {r.label}
                    </th>
                    {r.values.map((v, i) => {
                      const nums = r.nums?.filter((n): n is number => n !== null) ?? [];
                      const best = diff && nums.length > 1 && r.nums?.[i] === Math.min(...nums);
                      return (
                        <td key={i} className={cn("price border-l border-border p-3", diff && "font-medium", best && "font-bold text-success")}>
                          {v}
                          {best ? <span className="ml-1.5 rounded-sm bg-success/10 px-1 text-2xs font-semibold">Lowest</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Shown when /compare has fewer than 2 ids: uses the locally selected products. */
export function CompareFromSelection() {
  const items = compareStore.use();
  if (items.length >= 2) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <p className="text-sm text-text-muted">You have {items.length} products selected:</p>
        <ul className="mt-2 list-inside list-disc text-sm">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/products/${i.slug}`} className="hover:underline">
                {i.title}
              </Link>
            </li>
          ))}
        </ul>
        <Button asChild className="mt-4">
          <Link href={compareHref(items)}>Compare {items.length} products</Link>
        </Button>
      </div>
    );
  }
  return (
    <EmptyState
      icon={<GitCompareArrows aria-hidden />}
      title={items.length === 1 ? "Add one more product to compare" : "Nothing to compare yet"}
      description={`Use the compare button on any product page to add 2–${COMPARE_MAX} products, then compare specs and prices side by side.`}
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/search">Browse products</Link>
        </Button>
      }
    />
  );
}
