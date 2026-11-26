import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { EmptyState } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { listGuides } from "@/lib/guides";
import { first, toQueryString, type SearchParams } from "@/lib/nav";
import { GuideTile } from "@/components/travel/guide-card";
import { TravelHero } from "@/components/travel/travel-band";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: "City travel guides — where to stay, what to know",
    description: "Practical city guides: neighborhoods to stay in, getting around, when to go — with hotel and flight search built in.",
    alternates: { canonical: "/travel/guides" },
    robots: first(sp.tag) || first(sp.continent) || first(sp.q) ? { index: false, follow: true } : undefined,
  };
}

export default async function GuidesIndexPage({ searchParams }: Props) {
  const sp = await searchParams;
  const tag = first(sp.tag) ?? "";
  const continent = first(sp.continent) ?? "";
  const q = (first(sp.q) ?? "").slice(0, 80);
  const all = await listGuides({});
  const filtered = await listGuides({ tag: /^[a-z0-9-]+$/.test(tag) ? tag : undefined, q: q || undefined });
  const tags = all.ok ? Array.from(new Set(all.data.flatMap((g) => g.tags))).sort().slice(0, 16) : [];
  // Countries present in the published guides (filter via ?country=ISO2).
  const continents: string[] = [];
  const href = (o: Record<string, string | undefined>) => "/travel/guides" + toQueryString({ tag: tag || undefined, continent: continent || undefined, q: q || undefined, ...o });

  return (
    <>
      <TravelHero vertical="hotels" compact title="City travel guides" sub="Where to stay, how to get around and when to go — then search stays and flights in one tap.">
        <form action="/travel/guides" className="flex max-w-xl gap-1 rounded-lg bg-hotels-accent p-1" role="search">
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          {continent ? <input type="hidden" name="continent" value={continent} /> : null}
          <label htmlFor="guide-q" className="sr-only">
            Search guides
          </label>
          <input id="guide-q" name="q" defaultValue={q} placeholder="Search a city or country" className="h-12 min-w-0 flex-1 rounded-md bg-surface px-4 text-md text-text placeholder:text-text-muted focus:outline-none" />
          <button type="submit" className="inline-flex h-12 items-center gap-2 rounded-md bg-hotels px-5 font-bold text-hotels-fg">
            <Search aria-hidden className="size-4" /> Search
          </button>
        </form>
      </TravelHero>
      <div className="container-content py-8">
        {continents.length || tags.length ? (
          <div className="mb-6 flex flex-col gap-3">
            {continents.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Continent">
                {["", ...continents].map((c) => (
                  <li key={c || "all"}>
                    <Link href={href({ continent: c || undefined })} aria-current={continent === c ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold", continent === c ? "border-hotels bg-hotels-soft text-hotels-soft-fg" : "border-border hover:border-border-strong")}>
                      {c || "All continents"}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {tags.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Theme">
                {tags.map((t) => (
                  <li key={t}>
                    <Link href={href({ tag: tag === t ? undefined : t })} aria-current={tag === t ? "page" : undefined} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold capitalize", tag === t ? "border-hotels bg-hotels-soft text-hotels-soft-fg" : "border-border hover:border-border-strong")}>
                      {t.replace(/-/g, " ")}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {!filtered.ok ? (
          <EmptyState icon={<BookOpen aria-hidden />} title="Travel guides are coming soon" description="We're writing practical guides for popular cities. Check back shortly." />
        ) : filtered.data.length === 0 ? (
          <EmptyState icon={<BookOpen aria-hidden />} title="No guides match" description="Try another city, theme or continent." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="guide-grid">
            {filtered.data.map((g) => (
              <li key={g.slug}>
                <GuideTile guide={g} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
