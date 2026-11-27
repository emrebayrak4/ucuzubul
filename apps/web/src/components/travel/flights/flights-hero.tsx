import Image from "next/image";
import heroPhotos from "@pricora/content/flights-hero-photos.json";
import { cn } from "@pricora/ui/utils";
import { PhotoCredit } from "@/components/photo-credit";
import { JetSvg } from "./plane-art";

export interface UnsplashPhoto {
  url: string;
  color: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  unsplashUrl: string;
  width: number;
  height: number;
  orientation?: string;
}

/** Unsplash raw URL → sized crop (images are served by Unsplash's CDN, not proxied). */
export function unsplashSrc(url: string, w: number, h: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}w=${w}&h=${h}&q=70&fit=crop&auto=format`;
}

const photos = heroPhotos as UnsplashPhoto[];
const landscape = photos.filter((p) => p.orientation === "landscape");
const portrait = photos.filter((p) => p.orientation !== "landscape");

/** Organic "squircle" corners, slightly different per tile. */
const SHAPES = ["rounded-[2.25rem_0.75rem_2.25rem_0.75rem]", "rounded-[0.75rem_2.25rem_0.75rem_2.25rem]", "rounded-[2rem_2rem_0.75rem_2rem]", "rounded-[2rem_0.75rem_2rem_2rem]"];

function Tile({ p, w, h, className, priority, side }: { p: UnsplashPhoto; w: number; h: number; className?: string; priority?: boolean; side?: "bottom-end" | "bottom-start" | "top-end" | "top-start" }) {
  // Outer wrapper is not clipped so the credit bubble can open outside the rounded tile.
  return (
    <div className="relative">
      <div className={cn("relative overflow-hidden shadow-lg ring-1 ring-white/10", className)} style={{ backgroundColor: p.color }}>
        <Image src={unsplashSrc(p.url, w * 2, h * 2)} alt={p.alt} fill sizes={`${w}px`} className="object-cover" priority={priority} unoptimized />
      </div>
      <PhotoCredit photo={{ photographer: p.photographer, photographerUrl: p.photographerUrl, unsplashUrl: p.unsplashUrl }} className="right-2 top-2" side={side ?? "bottom-end"} />
    </div>
  );
}

/** Staggered photo collage with an original jet flying across (xl+ only; hidden on small screens). */
function Collage() {
  const [a, d] = [landscape[0], landscape[1] ?? landscape[0]];
  const [b, c] = [portrait[0], portrait[1] ?? portrait[0]];
  if (!a || !b || !c || !d) return null;
  return (
    <div className="relative hidden xl:block" aria-label="Travel photos" data-testid="flights-hero-collage">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          <Tile p={a} w={220} h={150} className={cn("aspect-[22/15]", SHAPES[0])} priority />
          <Tile p={b} w={220} h={250} className={cn("aspect-[22/25]", SHAPES[1])} side="top-end" />
        </div>
        <div className="mt-10 flex flex-col gap-3">
          <Tile p={c} w={220} h={250} className={cn("aspect-[22/25]", SHAPES[2])} />
          <Tile p={d} w={220} h={150} className={cn("aspect-[22/15]", SHAPES[3])} side="top-end" />
        </div>
      </div>
      <JetSvg contrail className="pointer-events-none absolute -left-16 top-[38%] w-[78%] -rotate-[8deg] drop-shadow-[0_8px_14px_rgba(5,10,49,0.45)]" />
      {/* Photo credits: corner ⓘ per tile (shared component) + central /credits page — no visible credit line. */}
    </div>
  );
}

/**
 * Flights hero on the navy band. `compact` (results pages) drops the collage and shows a small jet with a contrail
 * in the corner instead.
 */
export function FlightsHero({ title, sub, compact = false, children }: { title: React.ReactNode; sub?: React.ReactNode; compact?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("relative overflow-hidden bg-flights text-flights-fg", compact ? "pb-6 pt-3" : "pb-10 pt-6 lg:pb-14")} data-testid="travel-band">
      {compact ? <JetSvg contrail className="pointer-events-none absolute right-6 top-3 hidden w-72 -rotate-[4deg] opacity-90 lg:block" /> : null}
      <div className={cn("container-content relative", !compact && "grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]")}>
        <div className="min-w-0">
          <h1 className={cn("font-extrabold tracking-tight", compact ? "text-2xl lg:pr-80" : "text-3xl lg:text-5xl")}>{title}</h1>
          {sub ? <p className="mt-2 max-w-3xl text-md opacity-90">{sub}</p> : null}
          <div className={compact ? "mt-4" : "mt-6"}>{children}</div>
        </div>
        {compact ? null : <Collage />}
      </div>
    </section>
  );
}
