import Link from "next/link";
import { BedDouble, Building2, Car, Check, Coffee, Dumbbell, Home, Hotel, MapPin, PawPrint, Plug, Sparkles, Tent, TreePalm, Utensils, Waves, Wifi, type LucideIcon } from "lucide-react";
import { HOTEL_AMENITY_LABELS, HOTEL_PROPERTY_TYPE_LABELS, type HotelPropertyType, type HotelSummary } from "@pricora/contracts";
import { DemoDataBadge } from "@pricora/ui";
import { cn } from "@pricora/ui/utils";
import { StarClass } from "../hotel-card";
import { fmtUsd } from "./format";

export const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  parking: Car,
  pool: Waves,
  fitness_center: Dumbbell,
  spa: Sparkles,
  pets: PawPrint,
  ev_charging: Plug,
  breakfast: Coffee,
  restaurant: Utensils,
  kitchen: Utensils,
  beach_access: TreePalm,
};
const KEY_AMENITIES = ["wifi", "pool", "parking", "breakfast", "fitness_center", "spa", "pets", "kitchen", "ev_charging", "beach_access"];

const TYPE_ICONS: Record<HotelPropertyType, LucideIcon> = {
  hotel: Hotel,
  boutique: Hotel,
  apartment: Building2,
  resort: TreePalm,
  villa: Home,
  hostel: BedDouble,
  guest_house: Home,
  bed_and_breakfast: Coffee,
  motel: Car,
};

/** Photo slot: real image when a provider supplies one, otherwise a neutral tile (never a stock photo pretending to be the property). */
export function PhotoTile({ hotel, className, iconClass }: { hotel: Pick<HotelSummary, "imageUrl" | "propertyType" | "name" | "neighborhood">; className?: string; iconClass?: string }) {
  if (hotel.imageUrl) return <img src={hotel.imageUrl} alt="" className={cn("group-hover-zoom size-full object-cover", className)} loading="lazy" />;
  const Icon = TYPE_ICONS[hotel.propertyType] ?? Tent;
  return (
    <span className={cn("flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-hotels-soft to-surface-2 text-hotels-soft-fg", className)}>
      <Icon aria-hidden className={cn("group-hover-zoom size-10 opacity-70", iconClass)} />
      <span className="px-2 text-center text-2xs font-semibold uppercase tracking-wide opacity-70">No photo yet</span>
    </span>
  );
}

export function HotelResultCard({
  hotel,
  nights,
  href,
  layout = "list",
  active = false,
  onHover,
}: {
  hotel: HotelSummary;
  nights: number;
  href: string;
  layout?: "list" | "grid";
  active?: boolean;
  onHover?: (id: string | null) => void;
}) {
  const amenities = KEY_AMENITIES.filter((a) => hotel.amenities.includes(a)).slice(0, layout === "grid" ? 3 : 5);
  const grid = layout === "grid";
  return (
    <article
      className={cn(
        "group hover-lift flex overflow-hidden rounded-lg border bg-surface transition-shadow hover:shadow-md",
        grid ? "h-full flex-col" : "flex-col sm:flex-row",
        active ? "border-hotels shadow-md ring-1 ring-hotels" : "border-border",
      )}
      data-testid="hotel-card"
      data-hotel-id={hotel.id}
      onMouseEnter={onHover ? () => onHover(hotel.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(hotel.id) : undefined}
    >
      <Link href={href} className={cn("relative block shrink-0 overflow-hidden bg-surface-2", grid ? "aspect-[16/10]" : "aspect-[16/10] sm:aspect-auto sm:w-56 lg:w-64")} tabIndex={-1} aria-hidden>
        <PhotoTile hotel={hotel} />
        {hotel.source === "demo" ? <DemoDataBadge size="sm" className="absolute left-2 top-2" /> : null}
      </Link>
      <div className={cn("flex min-w-0 flex-1 gap-3 p-4", grid ? "flex-col" : "flex-col md:flex-row")}>
        <div className="min-w-0 flex-1">
          <h3 className="text-md font-bold leading-snug">
            <Link href={href} className="text-hotels-soft-fg hover:underline">
              {hotel.name}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
            <StarClass stars={hotel.stars} />
            <span>{HOTEL_PROPERTY_TYPE_LABELS[hotel.propertyType]}</span>
            {hotel.chain ? <span>· {hotel.chain}</span> : null}
          </div>
          <p className="mt-1.5 flex items-start gap-1 text-sm">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
            <span>
              <span className="font-semibold underline decoration-dotted underline-offset-2">{hotel.neighborhood ?? hotel.city}</span>
              {hotel.distanceKm !== null ? <span className="text-text-muted"> · {hotel.distanceKm < 1 ? `${Math.round(hotel.distanceKm * 1000)} m` : `${hotel.distanceKm.toFixed(1)} km`} from center</span> : null}
            </span>
          </p>
          {hotel.roomSummary ? (
            <p className="mt-2 border-l-2 border-border pl-2 text-sm">
              <span className="font-semibold">{hotel.roomSummary.split(" · ")[0]}</span>
              {hotel.roomSummary.includes(" · ") ? <span className="block text-xs text-text-muted">{hotel.roomSummary.split(" · ").slice(1).join(" · ")}</span> : null}
            </p>
          ) : null}
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted" aria-label="Key facilities">
            {amenities.map((a) => {
              const Icon = AMENITY_ICONS[a] ?? Check;
              return (
                <li key={a} className="inline-flex items-center gap-1">
                  <Icon aria-hidden className="size-3.5" />
                  {HOTEL_AMENITY_LABELS[a] ?? a}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
            {hotel.freeCancellation ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check aria-hidden className="size-3.5" /> Free cancellation available
              </span>
            ) : hotel.lowestNightlyCents !== null ? (
              <span className="text-text-muted">Non-refundable rates</span>
            ) : null}
            {hotel.payAtProperty ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check aria-hidden className="size-3.5" /> Pay at the property option
              </span>
            ) : null}
          </div>
        </div>
        <div className={cn("flex shrink-0 flex-col gap-1", grid ? "items-start border-t border-border pt-3" : "items-start md:w-44 md:items-end md:text-right")}>
          {hotel.lowestNightlyCents !== null ? (
            <>
              <span className="text-xs text-text-muted">
                {nights} {nights === 1 ? "night" : "nights"}
              </span>
              <span className="price text-xl font-extrabold leading-none" data-testid="card-total">
                {fmtUsd(hotel.lowestTotalCents ?? 0)}
              </span>
              <span className="text-xs text-text-muted">{hotel.taxesEstimated ? "incl. estimated taxes & fees" : hotel.lowestTaxesCents !== null ? "incl. taxes & fees" : "taxes & fees not included"}</span>
              <span className="price text-sm">
                <span className="font-semibold">{fmtUsd(hotel.lowestNightlyCents)}</span>
                <span className="text-text-muted"> / night</span>
              </span>
              <span className="text-xs text-text-muted">
                {hotel.providerCount} {hotel.providerCount === 1 ? "provider" : "providers"} compared
              </span>
            </>
          ) : (
            <span className="text-sm text-text-muted">No rates for these dates</span>
          )}
          <Link href={href} className="mt-1 inline-flex h-9 items-center justify-center rounded-md bg-hotels px-4 text-sm font-bold text-hotels-fg hover:opacity-90">
            See availability
          </Link>
        </div>
      </div>
    </article>
  );
}
