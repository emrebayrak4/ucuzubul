"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";
import { Button } from "@pricora/ui";
import { COMPARE_MAX, clearCompare, compareHref, compareStore, removeFromCompare } from "@/lib/compare-store";

/** Floating tray listing the products picked for comparison (from tiles, list rows or product pages). */
export function CompareTray() {
  const items = compareStore.use();
  const pathname = usePathname();
  if (!items.length || pathname?.startsWith("/compare")) return null;
  return (
    <div
      role="region"
      aria-label="Products selected for comparison"
      className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface/85"
      data-testid="compare-tray"
    >
      <div className="container-content flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
        <p className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
          <GitCompareArrows aria-hidden className="size-4 text-primary" />
          Compare <span className="price text-text-muted">({items.length}/{COMPARE_MAX})</span>
        </p>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {items.map((i) => (
            <li key={i.id} className="flex h-8 max-w-56 shrink-0 items-center gap-1 rounded-full border border-border bg-surface pl-3 pr-1 text-xs">
              <Link href={`/products/${i.slug}`} className="truncate hover:underline">
                {i.title}
              </Link>
              <button type="button" onClick={() => removeFromCompare(i.id)} className="rounded-full p-1 text-text-muted hover:bg-surface-2 hover:text-text" aria-label={`Remove ${i.title}`}>
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={clearCompare} className="text-xs font-semibold text-text-muted hover:text-text">
            Clear
          </button>
          {items.length >= 2 ? (
            <Button asChild size="sm">
              <Link href={compareHref(items)} data-testid="compare-tray-go">
                Compare {items.length}
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled>
              Add 1 more
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
