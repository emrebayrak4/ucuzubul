"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBasket, Sparkles, Trash2, Store } from "lucide-react";
import type { BasketOptimizeResponse, BasketScenario } from "@pricora/contracts";
import { Badge, Button, CategoryIcon, Checkbox, DemoDataBadge, EmptyState, IconButton, Label, Separator, cn, formatPrice } from "@pricora/ui";
import { api, errorMessage } from "@/lib/api-browser";
import { basketStore, removeFromBasket, setBasketQty } from "@/lib/basket-store";
import { SetZipButton, useZip } from "./zip-provider";

const memberships = [
  { key: "amazon-prime", label: "Amazon Prime" },
  { key: "walmart-plus", label: "Walmart+" },
  { key: "target-circle-card", label: "Target Circle Card" },
];

function Scenario({ s, recommended }: { s: BasketScenario; recommended: boolean }) {
  return (
    <article className={cn("rounded-lg border bg-surface p-4", recommended ? "border-primary" : "border-border")} data-testid="basket-scenario">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            {s.label}
            {recommended ? <Badge variant="primary">Recommended</Badge> : null}
            <Badge variant="outline" size="sm">
              {s.method === "exact" ? "Exact optimum" : "Heuristic"}
            </Badge>
          </h3>
          <p className="text-xs text-text-muted">
            {s.storeCount} {s.storeCount === 1 ? "store" : "stores"}
            {s.savingsCents > 0 ? ` · saves ${formatPrice(s.savingsCents)} vs. the most expensive option` : ""}
          </p>
        </div>
        <div className="text-right">
          <span className="price block text-xl font-semibold">{formatPrice(s.totalCents)}</span>
          <span className="text-xs text-text-muted">{s.estimatedTaxCents === null ? "est. total, excl. tax" : "est. total incl. tax"}</span>
        </div>
      </div>
      <dl className="price mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-text-muted">Items</dt>
          <dd>{formatPrice(s.subtotalCents)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Shipping</dt>
          <dd>{s.shippingCents === 0 ? "Free" : formatPrice(s.shippingCents)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Est. tax</dt>
          <dd>{s.estimatedTaxCents === null ? <SetZipButton /> : formatPrice(s.estimatedTaxCents)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-col gap-3">
        {s.stores.map((g) => (
          <div key={g.retailer.slug} className="rounded-md bg-surface-2 p-3">
            <p className="mb-1.5 flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-1.5">
                <Store aria-hidden className="size-4 text-text-muted" />
                {g.retailer.name}
              </span>
              <span className="price">{formatPrice(g.totalCents)}</span>
            </p>
            <ul className="space-y-1 text-xs">
              {g.lines.map((l) => (
                <li key={l.offerId} className="flex items-center justify-between gap-2">
                  <Link href={`/products/${l.productSlug}`} className="min-w-0 truncate hover:underline">
                    {l.qty}× {l.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {l.source === "demo" ? <DemoDataBadge size="sm" /> : null}
                    <span className="price">{formatPrice(l.lineTotalCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-2xs text-text-muted">
              Shipping {g.shippingCents === 0 ? "free" : formatPrice(g.shippingCents)}
              {g.freeShippingApplied ? " (free-shipping threshold met)" : ""}
              {g.freeShippingGapCents ? ` · add ${formatPrice(g.freeShippingGapCents)} for free shipping` : ""}
            </p>
          </div>
        ))}
      </div>
      {s.unavailableProductIds.length ? <p className="mt-2 text-xs text-warning">{s.unavailableProductIds.length} item(s) not available in this scenario.</p> : null}
      {s.assumptions.length ? (
        <details className="mt-3 text-xs text-text-muted">
          <summary className="cursor-pointer">Assumptions</summary>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {s.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

export function BasketView() {
  const items = basketStore.use();
  const { zip } = useZip();
  const [mem, setMem] = React.useState<string[]>([]);
  const [allowUsed, setAllowUsed] = React.useState(false);
  const [result, setResult] = React.useState<BasketOptimizeResponse | null>(null);
  const opt = useMutation({
    mutationFn: () =>
      api.basket.optimize({
        items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        zip: zip ?? undefined,
        memberships: mem.length ? mem : undefined,
        allowConditions: allowUsed ? ["new", "refurbished", "used", "open_box"] : ["new"],
      }),
    onSuccess: setResult,
  });

  React.useEffect(() => setResult(null), [items, zip, mem, allowUsed]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBasket aria-hidden />}
        title="Your smart basket is empty"
        description="Add products from any product page (basket icon), then we'll find the cheapest way to buy them — one store, several stores, or the fewest stores."
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/search">Browse products</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <section className="lg:col-span-5" aria-labelledby="basket-items">
        <h2 id="basket-items" className="mb-3 text-lg font-semibold">
          Items ({items.length})
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="basket-items">
          {items.map((i) => (
            <li key={i.productId} className="flex items-center gap-3 p-3">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2">
                {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-contain mix-blend-multiply dark:mix-blend-normal" /> : <CategoryIcon size={22} />}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/products/${i.slug}`} className="line-clamp-2 text-sm font-medium hover:underline">
                  {i.title}
                </Link>
                <span className="flex items-center gap-1.5 text-xs text-text-muted">
                  {i.lowestPriceCents !== null ? <span className="price">from {formatPrice(i.lowestPriceCents)}</span> : null}
                  {i.hasDemoData ? <DemoDataBadge size="sm" /> : null}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Decrease quantity" size="sm" disabled={i.qty <= 1} onClick={() => setBasketQty(i.productId, i.qty - 1)}>
                  <Minus aria-hidden className="size-4" />
                </IconButton>
                <span className="price w-6 text-center text-sm" aria-label={`Quantity ${i.qty}`}>
                  {i.qty}
                </span>
                <IconButton label="Increase quantity" size="sm" disabled={i.qty >= 99} onClick={() => setBasketQty(i.productId, i.qty + 1)}>
                  <Plus aria-hidden className="size-4" />
                </IconButton>
                <IconButton label={`Remove ${i.title}`} size="sm" onClick={() => removeFromBasket(i.productId)}>
                  <Trash2 aria-hidden className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm">
            Tax estimate: {zip ? <span className="font-medium">ZIP {zip}</span> : <span className="text-text-muted">not included</span>} · <SetZipButton label={zip ? "Change" : "Set ZIP"} />
          </p>
          <Separator />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Memberships I have</legend>
            {memberships.map((m) => (
              <div key={m.key} className="mb-1 flex items-center gap-2">
                <Checkbox id={`m-${m.key}`} checked={mem.includes(m.key)} onCheckedChange={(c) => setMem((p) => (c === true ? [...p, m.key] : p.filter((x) => x !== m.key)))} />
                <Label htmlFor={`m-${m.key}`} className="font-normal">
                  {m.label}
                </Label>
              </div>
            ))}
          </fieldset>
          <div className="flex items-center gap-2">
            <Checkbox id="allow-used" checked={allowUsed} onCheckedChange={(c) => setAllowUsed(c === true)} />
            <Label htmlFor="allow-used" className="font-normal">
              Allow refurbished / used / open-box
            </Label>
          </div>
          <Button onClick={() => opt.mutate()} loading={opt.isPending} data-testid="basket-optimize">
            <Sparkles aria-hidden /> Find the cheapest way to buy
          </Button>
          {opt.isError ? (
            <p role="alert" className="text-sm text-error">
              {errorMessage(opt.error)}
            </p>
          ) : null}
        </div>
      </section>
      <section className="lg:col-span-7" aria-labelledby="basket-results" aria-live="polite">
        <h2 id="basket-results" className="mb-3 text-lg font-semibold">
          Scenarios
        </h2>
        {!result ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted">
            Run the optimizer to compare buying everything at one store, splitting across the cheapest stores, or using the fewest stores.
          </p>
        ) : result.scenarios.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-6 text-sm text-text-muted">No store currently carries these items with the selected conditions.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {result.hasDemoData ? <p className="text-xs text-text-muted">Some prices are demo data and labeled as such.</p> : null}
            {result.scenarios.map((s) => (
              <Scenario key={s.kind} s={s} recommended={result.recommended === s.kind} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
