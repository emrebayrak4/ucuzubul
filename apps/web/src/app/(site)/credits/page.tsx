import type { Metadata } from "next";
import cityRaw from "@pricora/content/city-photos.json";
import categoryRaw from "@pricora/content/category-photos.json";
import flightsRaw from "@pricora/content/flights-hero-photos.json";
import promoRaw from "@pricora/content/promo-photos.json";
import { brand } from "@pricora/config/brand";
import { Crumbs } from "@/components/crumbs";
import { ensureUtm } from "@/lib/utm";

export const metadata: Metadata = {
  title: "Photo credits & data sources",
  description: `Credits for the photos and open data used on ${brand.name}.`,
  alternates: { canonical: "/credits" },
};

type Photo = { id: string; url: string; color?: string; alt?: string; photographer: string; photographerUrl: string; unsplashUrl: string };
type Entry = Photo & { subject: string; href?: string };

const title = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const thumb = (p: Photo) => `${p.url}${p.url.includes("?") ? "&" : "?"}w=160&h=112&fit=crop&auto=format&q=60`;

const cities: Entry[] = Object.entries(cityRaw as unknown as Record<string, Photo>)
  .map(([slug, p]) => ({ ...p, subject: title(slug), href: `/travel/guides/${slug}` }))
  .sort((a, b) => a.subject.localeCompare(b.subject));
const categories: Entry[] = Object.entries(categoryRaw as unknown as Record<string, Photo>)
  .map(([slug, p]) => ({ ...p, subject: title(slug), href: `/categories/${slug}` }))
  .sort((a, b) => a.subject.localeCompare(b.subject));
const flights: Entry[] = (flightsRaw as unknown as Photo[]).map((p, i) => ({ ...p, subject: p.alt ? p.alt.charAt(0).toUpperCase() + p.alt.slice(1) : `Flights hero photo ${i + 1}` }));

const PROMO_LABEL: Record<string, string> = { deals: "Today's best deals", "price-drops": "Biggest price drops", "under-25": "Under $25", coupons: "Coupons", "smart-basket": "Smart Basket" };
const promos: Entry[] = Object.entries(promoRaw as unknown as Record<string, Photo>).map(([key, p]) => ({ ...p, subject: PROMO_LABEL[key] ?? title(key), href: "/" }));

function PhotoList({ id, heading, intro, items }: { id: string; heading: string; intro: string; items: Entry[] }) {
  return (
    <section aria-labelledby={id} className="mt-(--pc-section-gap)">
      <h2 id={id} className="text-xl font-extrabold tracking-tight">
        {heading} <span className="text-base font-semibold text-text-muted">({items.length})</span>
      </h2>
      <p className="mt-1 text-sm text-text-muted">{intro}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" data-testid={`credits-${id}`}>
        {items.map((p) => (
          <li key={`${id}-${p.id}-${p.subject}`} className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
            <img src={thumb(p)} alt="" width={80} height={56} loading="lazy" className="h-14 w-20 shrink-0 rounded-sm object-cover" style={{ backgroundColor: p.color }} />
            <div className="min-w-0 text-sm">
              {p.href ? (
                <a href={p.href} className="block truncate font-semibold hover:underline">
                  {p.subject}
                </a>
              ) : (
                <span className="line-clamp-2 font-semibold">{p.subject}</span>
              )}
              <span className="text-text-muted">
                Photo by{" "}
                <a href={ensureUtm(p.photographerUrl)} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
                  {p.photographer}
                </a>{" "}
                on{" "}
                <a href={ensureUtm(p.unsplashUrl)} target="_blank" rel="noopener" className="text-primary underline-offset-2 hover:underline">
                  Unsplash
                </a>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CreditsPage() {
  return (
    <div className="container-content py-6">
      <Crumbs items={[{ label: "Home", href: "/" }, { label: "Photo credits & data sources" }]} />
      <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Photo credits &amp; data sources</h1>
      <p className="mt-2 max-w-3xl text-base text-text-muted">
        Photos on {brand.name} come from{" "}
        <a href={ensureUtm("https://unsplash.com/")} target="_blank" rel="noopener" className="text-primary underline">
          Unsplash
        </a>{" "}
        and are used under the Unsplash License; each photo also carries an ⓘ credit where it appears. Store and brand logos are trademarks of
        their owners, used only to identify them. Hotels marked &ldquo;Demo&rdquo; are fictional and have no photos.
      </p>

      <section aria-labelledby="data" className="mt-8 rounded-lg border border-border bg-surface-2 p-4">
        <h2 id="data" className="text-lg font-extrabold">
          Open data
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm" data-testid="credits-data">
          <li>
            Cities and countries: ©{" "}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener" className="text-primary underline">
              GeoNames
            </a>
            , licensed under{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener license" className="text-primary underline">
              CC BY 4.0
            </a>
            .
          </li>
          <li>
            Airports:{" "}
            <a href="https://ourairports.com/data/" target="_blank" rel="noopener" className="text-primary underline">
              OurAirports
            </a>{" "}
            (public domain).
          </li>
          <li>
            Maps: tiles and map data ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="text-primary underline">
              OpenStreetMap
            </a>{" "}
            contributors (ODbL), rendered with Leaflet.
          </li>
        </ul>
      </section>

      <PhotoList id="cities" heading="Destinations & city guides" intro="Hotel destination tiles, hotel search banners and travel guides." items={cities} />
      <PhotoList id="flights" heading="Flights" intro="Flights search hero." items={flights} />
      <PhotoList id="promos" heading="Home page promotions" intro="Shopping home page promo tiles." items={promos} />
      <PhotoList id="categories" heading="Shopping categories" intro="Category circles and category pages." items={categories} />
    </div>
  );
}
