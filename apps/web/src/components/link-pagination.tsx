import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@pricora/ui/utils";

function range(page: number, pageCount: number, siblings = 1): Array<number | "gap"> {
  const total = siblings * 2 + 5;
  if (pageCount <= total) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const left = Math.max(page - siblings, 2);
  const right = Math.min(page + siblings, pageCount - 1);
  const out: Array<number | "gap"> = [1];
  if (left > 2) out.push("gap");
  for (let p = left; p <= right; p++) out.push(p);
  if (right < pageCount - 1) out.push("gap");
  out.push(pageCount);
  return out;
}

const item =
  "price inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2.5 text-sm font-medium text-text hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Server-rendered, crawlable pagination (link mode). */
export function LinkPagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (p: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex justify-center" data-testid="pagination">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} rel="prev" className={item}>
              <ChevronLeft aria-hidden className="size-4" /> Prev
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(item, "pointer-events-none opacity-40")}>
              <ChevronLeft aria-hidden className="size-4" /> Prev
            </span>
          )}
        </li>
        {range(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <li key={`g${i}`} aria-hidden className="px-1 text-text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <Link href={hrefFor(p)} aria-current={p === page ? "page" : undefined} className={cn(item, p === page && "bg-primary text-primary-fg hover:bg-primary")}>
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} rel="next" className={item}>
              Next <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span aria-disabled="true" className={cn(item, "pointer-events-none opacity-40")}>
              Next <ChevronRight aria-hidden className="size-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
