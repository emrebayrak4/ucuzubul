import Link from "next/link";
import type { SizeFamilyMember } from "@pricora/contracts";
import { Badge } from "@pricora/ui";
import { formatPrice } from "@/lib/format";

/** "Best value size": other sizes of the same product line with unit prices. Sizes are separate products, never merged. */
export function SizeFamily({ members }: { members: SizeFamilyMember[] }) {
  if (members.length < 2) return null;
  return (
    <section aria-labelledby="sizes-title" className="rounded-lg border border-border bg-surface p-4" data-testid="size-family">
      <h2 id="sizes-title" className="text-base font-semibold">
        Compare sizes
      </h2>
      <p className="mb-2 text-xs text-text-muted">Lowest new price per size and what it costs per unit. Bigger isn&apos;t always cheaper.</p>
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li key={m.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              {m.current ? (
                <span className="font-semibold text-text" aria-current="page">
                  {m.label} <span className="font-normal text-text-muted">(this size)</span>
                </span>
              ) : (
                <Link href={`/products/${m.slug}`} className="font-medium text-primary underline-offset-2 hover:underline">
                  {m.label}
                </Link>
              )}
              {m.bestValue ? (
                <Badge size="sm" variant="success" data-testid="best-value">
                  Best value
                </Badge>
              ) : null}
            </span>
            <span className="flex items-baseline gap-3 text-right">
              <span className="price text-text">{m.lowestPriceCents !== null ? formatPrice(m.lowestPriceCents) : "—"}</span>
              <span className="price w-24 text-xs text-text-muted">{m.unitPrice?.label ?? "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
