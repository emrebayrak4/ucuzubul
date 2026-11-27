import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ExploreDestination } from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { cityPhoto, type CityPhoto } from "@/lib/city-photos";
import { CityPhotoImg } from "@/components/travel/hotels/city-photo";
import { duration, usd } from "./format";
import { PhotoCredit } from "@/components/photo-credit";
import { JetSvg } from "./plane-art";

/** Photo for a destination card (shared city-photos helper; null → illustrated tile). */
export const explorePhoto = (d: Pick<ExploreDestination, "city">): CityPhoto | null => cityPhoto(d.city);

/** "Explore everywhere" destination card: city photo (or illustrated tile), cheapest fare, direct/duration, demo label. */
export function ExploreCard({ d, from }: { d: ExploreDestination; from: string }) {
  const sp = new URLSearchParams({ from, to: d.code, depart: d.depart });
  if (d.return) sp.set("return", d.return);
  const photo = explorePhoto(d);
  return (
    // Wrapper so a photo-credit ⓘ button can sit over the card without nesting interactive content in the link.
    <div className="relative h-full">
    <Link
      href={`/travel/flights/search?${sp.toString()}`}
      className="group hover-lift flex h-full flex-col justify-between overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="explore-card"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {photo ? (
          <CityPhotoImg photo={photo} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="group-hover-zoom" />
        ) : (
          <div aria-hidden className="flex size-full items-center justify-center bg-gradient-to-br from-flights to-flights-action">
            <JetSvg contrail className="w-3/4 -rotate-6 opacity-90" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <p className="flex items-start justify-between gap-2">
            <span className="font-semibold leading-tight">{d.city}</span>
            <span className="font-mono text-xs text-text-muted">{d.code}</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            <span className={cn("font-medium", d.direct && "text-success")}>{d.direct ? "Direct available" : "Connecting"}</span> · from {duration(d.durationMinutes)}
          </p>
        </div>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="price text-xl font-bold">{usd(d.minPriceCents)}</p>
            <p className="text-2xs text-text-muted">{d.return ? "round trip" : "one way"} · per adult</p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-flights-action">
            Search <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        {d.source === "demo" ? <DemoDataBadge size="sm" label="Demo fare" className="mt-2 self-start" /> : null}
      </div>
    </Link>
      {photo ? <PhotoCredit photo={{ photographer: photo.photographer, photographerUrl: photo.photographerUrl, unsplashUrl: photo.unsplashUrl }} className="right-2 top-2" side="bottom-end" /> : null}
    </div>
  );
}
