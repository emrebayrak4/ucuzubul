"use client";

import * as React from "react";
import type { ProductImage } from "@pricora/contracts";
import { CategoryIcon, cn } from "@pricora/ui";

/** Vertical thumbnails + main image on a neutral well. No image → category icon tile (never a stock photo). */
export function Gallery({ images, title, category, slug: _slug }: { images: ProductImage[]; title: string; category: string | null; slug: string }) {
  const [index, setIndex] = React.useState(0);
  const current = images[index];
  if (!current) {
    return (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md bg-surface-2" data-testid="gallery-fallback">
          <CategoryIcon category={category} size={72} className="opacity-60" />
          <span className="text-xs text-text-muted">No product image available</span>
        </div>
    );
  }
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 ? (
        <ul className="scrollbar-none flex gap-2 overflow-x-auto md:max-h-[480px] md:flex-col md:overflow-y-auto" aria-label="Product images">
          {images.map((img, i) => (
            <li key={img.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={cn(
                  "flex size-16 items-center justify-center overflow-hidden rounded-sm border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === index ? "border-primary" : "border-border hover:border-border-strong",
                )}
              >
                <img src={img.url} alt="" className="size-full object-contain mix-blend-multiply dark:mix-blend-normal" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-surface-2 p-6">
        <img
          src={current.url}
          alt={current.alt || title}
          width={current.width ?? undefined}
          height={current.height ?? undefined}
          className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal"
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
