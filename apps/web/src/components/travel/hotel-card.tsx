import Link from "next/link";
import { BedDouble, Star } from "lucide-react";
import type { HotelSummary } from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { formatPrice } from "@pricora/ui/utils";

export function StarClass({ stars }: { stars: number | null }) {
  if (stars === null || stars <= 0) return null;
  const n = Math.round(stars);
  return (
    <span className="inline-flex items-center gap-0.5 text-warning" title={`${stars}-star hotel class (not a guest rating)`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} aria-hidden className="size-3.5 fill-current" />
      ))}
      <span className="sr-only">{stars}-star hotel</span>
    </span>
  );
}

export function HotelCard({ hotel, nights, detailQuery }: { hotel: HotelSummary; nights: number; detailQuery: string }) {
  const href = `/travel/hotels/${encodeURIComponent(hotel.id)}${detailQuery}`;
  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-border bg-surface md:flex-row" data-testid="hotel-card">
      <Link href={href} className="relative block aspect-[4/3] shrink-0 bg-surface-2 md:w-60" tabIndex={-1} aria-hidden>
        {hotel.imageUrl ? (
          <img src={hotel.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <BedDouble className="size-10 text-text-muted opacity-60" />
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-md font-semibold">
            <Link href={href} className="hover:underline">
              {hotel.name}
            </Link>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <StarClass stars={hotel.stars} />
            <span>{[hotel.address, hotel.city].filter(Boolean).join(", ")}</span>
          </div>
          {hotel.amenities.length ? (
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
              {hotel.amenities.slice(0, 4).map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:text-right">
          {hotel.lowestNightlyCents !== null ? (
            <>
              <span className="inline-flex items-baseline gap-1">
                <span className="text-xs text-text-muted">from</span>
                <span className="price text-xl font-semibold">{formatPrice(hotel.lowestNightlyCents, { currency: hotel.currency })}</span>
                <span className="text-xs text-text-muted">/night</span>
              </span>
              {hotel.lowestTotalCents !== null ? (
                <span className="price text-xs text-text-muted">
                  {formatPrice(hotel.lowestTotalCents, { currency: hotel.currency })} total · {nights} {nights === 1 ? "night" : "nights"}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-sm text-text-muted">No rates for these dates</span>
          )}
          {hotel.source === "demo" ? <DemoDataBadge size="sm" /> : null}
          <Link href={href} className="mt-1 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-fg hover:bg-primary-hover">
            Compare rates
          </Link>
        </div>
      </div>
    </article>
  );
}
