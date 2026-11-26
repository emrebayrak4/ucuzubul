import Link from "next/link";
import { BookOpen } from "lucide-react";
import { guideCode, guideCountry, guideSummary, type GuideCard } from "@/lib/guides";

export function GuideTile({ guide }: { guide: GuideCard }) {
  return (
    <Link href={`/travel/guides/${guide.slug}`} className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md" data-testid="guide-card">
      <span className="relative flex h-28 items-end bg-hotels p-4 text-hotels-fg">
        <span className="absolute right-3 top-3 rounded-sm bg-white/20 px-1.5 py-0.5 font-mono text-xs font-bold">{guide.iataCityCode ?? guideCode(guide)}</span>
        <span className="text-xl font-extrabold leading-tight">{guide.city}</span>
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
  );
}
