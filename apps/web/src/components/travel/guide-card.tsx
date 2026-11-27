import Link from "next/link";
import { BookOpen } from "lucide-react";
import { guideCode, guideCountry, guideSummary, type GuideCard } from "@/lib/guides";
import { cityPhotoBySlug } from "@/lib/city-photos";
import { CityPhotoImg, UnsplashCredit } from "./hotels/city-photo";

export function GuideTile({ guide }: { guide: GuideCard }) {
  const photo = cityPhotoBySlug(guide.slug);
  return (
    <div className="group hover-lift relative h-full">
      <Link href={`/travel/guides/${guide.slug}`} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md" data-testid="guide-card">
        <span className="relative isolate flex h-36 items-end overflow-hidden bg-hotels p-4 text-white">
          {photo ? (
            <>
              <CityPhotoImg photo={photo} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="group-hover-zoom -z-20" />
              <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            </>
          ) : null}
          <span className="absolute right-3 top-3 rounded-sm bg-black/30 px-1.5 py-0.5 font-mono text-xs font-bold">{guide.iataCityCode ?? guideCode(guide)}</span>
          <span className="text-xl font-extrabold leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,.4)]">{guide.city}</span>
        </span>
        <span className="flex flex-1 flex-col gap-1 p-4">
          <span className="text-xs font-semibold text-text-muted">{guideCountry(guide)}</span>
          <span className="line-clamp-3 text-sm text-text">{guideSummary(guide)}</span>
          {guide.bestTimeToVisit ? <span className="text-xs text-text-muted">Best time: {guide.bestTimeToVisit}</span> : null}
          <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-bold text-hotels-soft-fg group-hover:underline">
            <BookOpen aria-hidden className="size-4" /> Read the guide
          </span>
        </span>
      </Link>
      {/* Attribution sits outside the card link (no nested anchors). */}
      {photo ? <UnsplashCredit photo={photo} className="left-2 top-2" side="bottom-start" /> : null}
    </div>
  );
}
