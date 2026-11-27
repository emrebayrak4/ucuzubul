"use client";

import * as React from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { cn } from "@pricora/ui/utils";
import { ensureUtm } from "@/lib/utm";

export { ensureUtm };

export type PhotoCreditData = { photographer: string; photographerUrl: string; unsplashUrl?: string };

/**
 * Unobtrusive Unsplash attribution: a small ⓘ button in an image corner. The credit ("Photo by X on Unsplash",
 * with referral links) opens on hover, keyboard focus or tap, and closes on Escape / outside tap.
 *
 * Place it as a SIBLING of any card <Link> (never inside one — no nested anchors). The parent must be `relative`;
 * position it with `className`, e.g. "right-2 top-2". `side` picks where the bubble opens.
 */
export function PhotoCredit({
  photo,
  className,
  side = "bottom-end",
}: {
  photo: PhotoCreditData;
  className?: string;
  side?: "bottom-end" | "bottom-start" | "top-end" | "top-start";
}) {
  const [open, setOpen] = React.useState(false);
  // Tap = focus + click: remember when hover/focus opened it so the following click doesn't immediately close it.
  const openedAt = React.useRef(0);
  const show = () => {
    if (!open) openedAt.current = Date.now();
    setOpen(true);
  };
  const ref = React.useRef<HTMLSpanElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pos = {
    "bottom-end": "right-0 top-full mt-1.5",
    "bottom-start": "left-0 top-full mt-1.5",
    "top-end": "right-0 bottom-full mb-1.5",
    "top-start": "left-0 bottom-full mb-1.5",
  }[side];

  return (
    <span ref={ref} className={cn("group/credit absolute z-[3]", className)} data-testid="photo-credit" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={`Photo credit: ${photo.photographer} on Unsplash`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => (Date.now() - openedAt.current < 500 ? setOpen(true) : setOpen((o) => !o))}
        onMouseEnter={show}
        onFocus={show}
        className="inline-flex size-6 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <Info aria-hidden className="size-3.5" />
      </button>
      <span
        id={id}
        role="note"
        hidden={!open}
        className={cn("absolute w-max max-w-64 rounded-md bg-text px-2.5 py-1.5 text-xs leading-snug text-surface shadow-lg", pos)}
        data-testid="unsplash-credit"
      >
        Photo by{" "}
        <a href={ensureUtm(photo.photographerUrl)} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
          {photo.photographer}
        </a>{" "}
        on{" "}
        <a href={ensureUtm(photo.unsplashUrl ?? "https://unsplash.com/")} target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
          Unsplash
        </a>
        <span className="mt-0.5 block opacity-80">
          <Link href="/credits" className="underline underline-offset-2">
            All photo credits
          </Link>
        </span>
      </span>
    </span>
  );
}
