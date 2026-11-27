import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BedDouble, CalendarCheck, Plane, Sun } from "lucide-react";
import { brand } from "@pricora/config/brand";
import { absoluteUrl } from "@/lib/env";
import { metaDescription } from "@/lib/seo";
import { getGuide, listGuides, splitFaq } from "@/lib/guides";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { Markdown } from "@/components/markdown";
import { GuideTile } from "@/components/travel/guide-card";
import { HotelSearchForm } from "@/components/travel/search-forms";
import { CityPhotoImg, UnsplashCredit } from "@/components/travel/hotels/city-photo";
import { cityPhotoBySlug } from "@/lib/city-photos";

type Props = { params: Promise<{ slug: string }> };

async function fetchGuide(slug: string) {
  const r = await getGuide(slug);
  if (!r.ok) notFound();
  return r.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const g = await fetchGuide(slug);
  return {
    title: g.title,
    description: metaDescription(g.description),
    alternates: { canonical: `/travel/guides/${g.slug}`, types: { "text/markdown": `/md/travel/guides/${g.slug}` } },
    openGraph: { type: "article", title: g.title, description: g.description, url: `/travel/guides/${g.slug}` },
  };
}

const longDate = (d: string) => new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const g = await fetchGuide(slug);
  const photo = cityPhotoBySlug(g.slug);
  const { body, faq } = splitFaq(g.bodyMarkdown);
  const headingIds = Object.fromEntries(g.headings.map((h) => [h.text, h.id]));
  const toc = g.headings.filter((h) => !/^frequently asked questions|^faqs?\b/i.test(h.text) && !(faq.some((f) => f.q === h.text) && h.level === 3));
  const faqHeading = g.headings.find((h) => /^frequently asked questions|^faqs?\b/i.test(h.text));
  const reviewed = g.lastReviewed ?? g.updatedAt;
  const related = await listGuides({ tag: g.tags[0], pageSize: 8 });
  const relatedGuides = related.ok ? related.data.filter((r) => r.slug !== g.slug).slice(0, 4) : [];
  const hotelLink = (area?: string) => `/travel/hotels?city=${encodeURIComponent(area ? `${area}, ${g.city}` : g.city)}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: g.title,
          description: g.description,
          datePublished: g.publishedAt ?? undefined,
          dateModified: g.updatedAt,
          author: { "@type": "Organization", name: brand.name },
          publisher: { "@type": "Organization", name: brand.name, url: absoluteUrl("/") },
          mainEntityOfPage: absoluteUrl(`/travel/guides/${g.slug}`),
          about: { "@type": "City", name: g.city, containedInPlace: { "@type": "Country", name: g.country } },
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Travel", path: "/travel" },
          { name: "Guides", path: "/travel/guides" },
          { name: g.city, path: `/travel/guides/${g.slug}` },
        ])}
      />
      {faq.length ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }}
        />
      ) : null}

      <section className={photo ? "relative isolate overflow-hidden bg-hotels pb-10 pt-16 text-white lg:pt-28" : "bg-hotels pb-8 pt-4 text-hotels-fg"} data-testid="guide-hero">
        {photo ? (
          <>
            <CityPhotoImg photo={photo} priority className="-z-20" />
            <UnsplashCredit photo={photo} className="bottom-3 right-3" side="top-end" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/45 to-black/10" />
          </>
        ) : null}
        <div className="container-content">
          <p className="text-sm font-semibold opacity-90">
            {g.country} · <span className="font-mono">{g.iataCityCode ?? g.countryIso2}</span>
          </p>
          <h1 className="mt-1 max-w-4xl text-3xl font-extrabold tracking-tight lg:text-4xl">{g.title}</h1>
          <p className="mt-2 max-w-3xl text-md opacity-95">{g.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm opacity-95">
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck aria-hidden className="size-4" /> Last reviewed {longDate(reviewed)}
            </span>
            {g.bestTimeToVisit ? (
              <span className="inline-flex items-center gap-1.5">
                <Sun aria-hidden className="size-4" /> Best time: {g.bestTimeToVisit}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container-content py-6">
        <Crumbs items={[{ label: "Travel", href: "/travel" }, { label: "Guides", href: "/travel/guides" }, { label: g.city }]} />
        <div className="grid gap-8 lg:grid-cols-12">
          <article className="min-w-0 lg:col-span-8">
            <Markdown source={body} headingIds={headingIds} />

            {g.neighborhoods.length ? (
              <section aria-labelledby="where-to-stay-links" className="mt-10">
                <h2 id="where-to-stay-links" className="text-2xl font-extrabold tracking-tight">
                  Search hotels by neighborhood
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="guide-neighborhoods">
                  {g.neighborhoods.map((n) => (
                    <li key={n}>
                      <Link href={hotelLink(n)} className="flex h-full items-center gap-3 rounded-lg border border-border bg-surface p-4 font-bold transition-shadow hover:shadow-md">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-hotels-soft text-hotels-soft-fg">
                          <BedDouble aria-hidden className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{n}</span>
                          <span className="block text-xs font-normal text-text-muted">Hotels in {n}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {faq.length ? (
              <section aria-labelledby={faqHeading?.id ?? "faq"} className="mt-10" data-testid="guide-faq">
                <h2 id={faqHeading?.id ?? "faq"} className="scroll-mt-40 text-2xl font-extrabold tracking-tight">
                  Frequently asked questions
                </h2>
                <div className="mt-3 divide-y divide-border rounded-lg border border-border">
                  {faq.map((f) => (
                    <details key={f.q} className="group p-4">
                      <summary className="cursor-pointer font-bold">{f.q}</summary>
                      <p className="mt-2 text-sm leading-relaxed text-text-muted">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          <aside className="lg:col-span-4">
            <div className="flex flex-col gap-6 lg:sticky lg:top-44">
              {toc.length ? (
                <nav aria-label="On this page" className="rounded-lg border border-border bg-surface p-4" data-testid="guide-toc">
                  <p className="mb-2 text-sm font-bold">On this page</p>
                  <ul className="space-y-1.5 text-sm">
                    {toc
                      .filter((h) => h.level === 2)
                      .map((h) => (
                        <li key={h.id}>
                          <a href={`#${h.id}`} className="text-text-muted hover:text-text hover:underline">
                            {h.text}
                          </a>
                        </li>
                      ))}
                    {faq.length && faqHeading ? (
                      <li>
                        <a href={`#${faqHeading.id}`} className="text-text-muted hover:text-text hover:underline">
                          Frequently asked questions
                        </a>
                      </li>
                    ) : null}
                  </ul>
                </nav>
              ) : null}
              <div className="rounded-lg border border-border bg-surface-2 p-4" data-testid="guide-hotel-search">
                <p className="mb-3 font-bold">Find a place to stay in {g.city}</p>
                <HotelSearchForm initial={{ city: g.city }} layout="stacked" />
              </div>
              <Link
                href={g.iataCityCode ? `/travel/flights?to=${g.iataCityCode}` : "/travel/flights"}
                className="flex items-center gap-3 rounded-lg bg-flights p-4 font-bold text-flights-fg hover:opacity-95"
                data-testid="guide-flights-cta"
              >
                <Plane aria-hidden className="size-5" /> Find flights to {g.city}
              </Link>
            </div>
          </aside>
        </div>

        {relatedGuides.length ? (
          <section aria-labelledby="related-guides" className="mt-12">
            <h2 id="related-guides" className="text-xl font-extrabold tracking-tight">
              Related guides
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {relatedGuides.map((r) => (
                <li key={r.slug}>
                  <GuideTile guide={r} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
