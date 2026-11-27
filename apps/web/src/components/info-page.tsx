import { brand } from "@pricora/config/brand";
import { Crumbs } from "@/components/crumbs";
import { JsonLd, breadcrumbJsonLd } from "@/components/json-ld";
import { webPageJsonLd } from "@/lib/seo";

/** Company / methodology page shell: breadcrumbs, H1, visible "last updated", WebPage JSON-LD with the organization as author. */
export function InfoPage({
  title,
  path,
  description,
  updated,
  type = "WebPage",
  children,
}: {
  title: string;
  path: string;
  description: string;
  /** ISO date (YYYY-MM-DD) of the last substantive edit. */
  updated: string;
  type?: "WebPage" | "AboutPage" | "ContactPage";
  children: React.ReactNode;
}) {
  return (
    <div className="container-content py-6">
      <article className="max-w-3xl">
      <JsonLd data={webPageJsonLd({ type, name: title, path, description, dateModified: updated })} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: title, path }])} />
      <Crumbs items={[{ label: "Home", href: "/" }, { label: title }]} />
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-text-muted">
        By the {brand.name} team ({brand.legalEntity}) · Last updated <time dateTime={updated}>{new Date(updated + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
      </p>
      <p className="mt-4 text-lg leading-relaxed text-text">{description}</p>
      <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-text">
        {children}
      </div>
      </article>
    </div>
  );
}
