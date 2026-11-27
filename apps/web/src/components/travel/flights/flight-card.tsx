"use client";

import * as React from "react";
import { AlertTriangle, Briefcase, ChevronDown, ChevronUp, Clock3, ExternalLink, Luggage, Moon, Plane, Repeat } from "lucide-react";
import { FARE_BRAND_LABELS, type FareOption, type FlightBaggage, type FlightOffer, type FlightSearchResponse, type FlightSlice } from "@pricora/contracts";
import { Badge, Button, DemoDataBadge, cn } from "@pricora/ui";
import { PUBLIC_API_URL } from "@/lib/env";
import { cabinLabel } from "@/lib/format";
import { AirlineLogo, AirlineLogos } from "./airline-logo";
import { dayDiff, duration, localTime, shortDate, usd } from "./format";

type Airports = NonNullable<FlightSearchResponse["airports"]>;

function carriersOf(s: FlightSlice) {
  return [...new Map(s.segments.map((g) => [g.marketingCarrier.iata, g.marketingCarrier])).values()];
}

function SliceRow({ slice }: { slice: FlightSlice }) {
  const plus = dayDiff(slice.departAt, slice.arriveAt);
  const carriers = carriersOf(slice);
  const stopsLabel = slice.stops === 0 ? "Nonstop" : `${slice.stops} stop${slice.stops > 1 ? "s" : ""}`;
  const via = (slice.layovers ?? []).map((l) => (l.changeAirport ? `${l.airport}/${l.nextAirport}` : l.airport)).join(", ");
  const warn = (slice.layovers ?? []).some((l) => l.overnight || l.changeAirport || l.selfTransfer);
  return (
    <div className="grid grid-cols-[2.25rem_1fr] items-center gap-3 sm:grid-cols-[2.25rem_8rem_1fr]">
      <AirlineLogos airlines={carriers} />
      <p className="hidden truncate text-xs text-text-muted sm:block" title={carriers.map((c) => c.name).join(" + ")}>
        {carriers.map((c) => c.name).join(" + ")}
      </p>
      <div className="col-span-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:col-span-1">
        <div className="text-right">
          <p className="price text-lg font-semibold leading-tight">{localTime(slice.departAt)}</p>
          <p className="font-mono text-xs text-text-muted">{slice.from}</p>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1 px-1">
          <span className="price text-xs text-text-muted">{duration(slice.durationMinutes)}</span>
          <div className="relative h-px w-full bg-border-strong">
            {Array.from({ length: slice.stops }, (_, i) => (
              <span key={i} className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-surface bg-warning" style={{ left: `calc(${((i + 1) / (slice.stops + 1)) * 100}% - 4px)` }} />
            ))}
            <Plane aria-hidden className="absolute -right-1 top-1/2 size-3 -translate-y-1/2 text-text-muted" />
          </div>
          <span className={cn("max-w-full truncate text-xs", slice.stops === 0 ? "font-medium text-success" : "text-text-muted")}>
            {stopsLabel}
            {via ? <span className="font-mono"> · {via}</span> : null}
            {warn ? <AlertTriangle aria-label="Connection warning — see details" className="ml-1 inline size-3 text-warning" /> : null}
          </span>
        </div>
        <div>
          <p className="price text-lg font-semibold leading-tight">
            {localTime(slice.arriveAt)}
            {plus > 0 ? (
              <sup className="ml-0.5 text-2xs font-semibold text-warning" title={`Arrives ${shortDate(slice.arriveAt)}`}>
                +{plus}
              </sup>
            ) : null}
          </p>
          <p className="font-mono text-xs text-text-muted">{slice.to}</p>
        </div>
      </div>
    </div>
  );
}

function BagIcons({ b }: { b: FlightBaggage | null }) {
  if (!b) return <span className="text-xs text-text-muted">Bags: check with provider</span>;
  const carry = (b.carryOn ?? 0) >= 1;
  const checked = b.checked ?? 0;
  return (
    <span className="flex items-center gap-3 text-xs" aria-label="Baggage">
      <span className={cn("inline-flex items-center gap-1", carry ? "text-text" : "text-text-muted line-through")} title={carry ? "Carry-on bag included" : `Personal item only${b.carryOnFeeCents ? ` · carry-on est. ${usd(b.carryOnFeeCents)}` : ""}`}>
        <Briefcase aria-hidden className="size-3.5" />
        {carry ? "Carry-on" : "No carry-on"}
      </span>
      <span className={cn("inline-flex items-center gap-1", checked ? "text-text" : "text-text-muted")} title={checked ? `${checked} checked bag(s) included` : b.checkedBagFeeCents ? `Checked bag est. ${usd(b.checkedBagFeeCents)} (est.)` : "Checked bag not included"}>
        <Luggage aria-hidden className="size-3.5" />
        {checked ? `${checked} checked` : b.checkedBagFeeCents ? `Bag est. ${usd(b.checkedBagFeeCents)}` : "No checked bag"}
      </span>
    </span>
  );
}

function SliceDetails({ slice, airports, index, total }: { slice: FlightSlice; airports: Airports; index: number; total: number }) {
  const name = (c: string) => (airports[c] ? `${airports[c]!.city} (${c})` : c);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">
        {total === 2 ? (index === 0 ? "Outbound" : "Return") : total > 2 ? `Flight ${index + 1}` : "Departure"} · {shortDate(slice.departAt)} · {name(slice.from)} → {name(slice.to)}
        <span className="font-normal text-text-muted"> · {duration(slice.durationMinutes)}</span>
      </p>
      <ol className="relative ml-2 border-l-2 border-dashed border-border-strong pl-5">
        {slice.segments.map((g, i) => {
          const lay = slice.layovers?.[i];
          return (
            <li key={`${g.flightNumber}-${i}`} className="pb-3">
              <span className="absolute -left-[7px] mt-1 size-3 rounded-full border-2 border-flights-action bg-surface" aria-hidden />
              <p className="text-sm">
                <span className="price font-semibold">{localTime(g.departAt)}</span> {airports[g.from]?.name ?? g.from} <span className="font-mono text-xs text-text-muted">{g.from}</span>
              </p>
              <div className="my-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                <AirlineLogo airline={g.marketingCarrier} size="sm" />
                <span>
                  {g.marketingCarrier.name} · <span className="font-mono">{g.flightNumber}</span>
                </span>
                {g.operatingCarrier ? <span>Operated by {g.operatingCarrier.name}</span> : null}
                {g.aircraft ? <span>{g.aircraft}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <Clock3 aria-hidden className="size-3" /> {duration(g.durationMinutes)}
                </span>
              </div>
              <p className="text-sm">
                <span className="price font-semibold">{localTime(g.arriveAt)}</span>
                {dayDiff(g.departAt, g.arriveAt) > 0 ? <sup className="ml-0.5 text-2xs text-warning">+{dayDiff(g.departAt, g.arriveAt)}</sup> : null} {airports[g.to]?.name ?? g.to}{" "}
                <span className="font-mono text-xs text-text-muted">{g.to}</span>
              </p>
              {lay ? (
                <div className={cn("my-3 -ml-5 rounded-md px-3 py-2 text-xs", lay.overnight || lay.changeAirport || lay.selfTransfer ? "bg-warning-soft text-warning" : "bg-surface-2 text-text-muted")} data-testid="layover">
                  <p className="font-semibold text-text">
                    {duration(lay.durationMinutes)} layover · {name(lay.airport)}
                  </p>
                  {lay.overnight ? (
                    <p className="mt-0.5 inline-flex items-center gap-1">
                      <Moon aria-hidden className="size-3" /> Overnight layover
                    </p>
                  ) : null}
                  {lay.changeAirport ? (
                    <p className="mt-0.5 inline-flex items-center gap-1">
                      <AlertTriangle aria-hidden className="size-3" /> Change airports: arrive {lay.airport}, depart {lay.nextAirport}
                    </p>
                  ) : null}
                  {lay.selfTransfer ? (
                    <p className="mt-0.5 inline-flex items-center gap-1">
                      <Repeat aria-hidden className="size-3" /> Self-transfer: separate tickets — collect and re-check bags; a missed connection isn&apos;t protected
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FareOptions({ options, current, adults }: { options: FareOption[]; current: string | null | undefined; adults: number }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Fare options</p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {options.map((f) => (
          <li key={f.brand} className={cn("rounded-md border p-3 text-xs", f.brand === current ? "border-flights-action bg-flights-soft text-flights-soft-fg" : "border-border")}>
            <p className="flex items-center justify-between text-sm font-semibold">
              {FARE_BRAND_LABELS[f.brand]} <span className="price">{usd(f.pricePerAdultCents)}</span>
            </p>
            <p className="mt-1 text-text-muted">per adult{adults > 1 ? ` · ${usd(f.totalPriceCents)} total` : ""}</p>
            <ul className="mt-2 space-y-0.5">
              <li>{(f.baggage.carryOn ?? 0) >= 1 ? "✓ Carry-on bag" : "✗ Personal item only"}</li>
              <li>{(f.baggage.checked ?? 0) >= 1 ? `✓ ${f.baggage.checked} checked bag${(f.baggage.checked ?? 0) > 1 ? "s" : ""}` : `✗ Checked bag${f.baggage.checkedBagFeeCents ? ` (est. ${usd(f.baggage.checkedBagFeeCents)})` : ""}`}</li>
              <li>{f.changeable ? "✓ Changes allowed" : "✗ No changes"}</li>
              <li>{f.refundable ? "✓ Refundable" : "✗ Non-refundable"}</li>
              <li>{f.seatSelection === "included" ? "✓ Seat selection" : "Seat selection for a fee"}</li>
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlightCard({
  offer,
  adults,
  travelers,
  tags,
  airports,
  position,
}: {
  offer: FlightOffer;
  adults: number;
  travelers: number;
  tags: string[];
  airports: Airports;
  position: number;
}) {
  const [open, setOpen] = React.useState(false);
  const demo = offer.source === "demo";
  const href = offer.goUrl ? (offer.goUrl.startsWith("http") ? offer.goUrl : PUBLIC_API_URL + offer.goUrl) + `?placement=flight_results&position=${position}` : null;
  const detailsId = React.useId();
  return (
    <article className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs transition-shadow hover:shadow-sm" data-testid="flight-card" data-source={offer.source}>
      <div className="flex flex-col md:flex-row">
        <div className="flex flex-1 flex-col gap-4 p-4">
          {tags.length || demo || offer.selfTransfer ? (
            <div className="-mb-1 flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <Badge key={t} size="sm" variant={t === "Best" ? "info" : t === "Cheapest" ? "success" : "neutral"}>
                  {t}
                </Badge>
              ))}
              {offer.selfTransfer ? (
                <Badge size="sm" variant="warning">
                  Self-transfer
                </Badge>
              ) : null}
              {demo ? <DemoDataBadge size="sm" label="Demo fare" /> : null}
            </div>
          ) : null}
          {offer.slices.map((s, i) => (
            <SliceRow key={i} slice={s} />
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <BagIcons b={offer.baggage} />
            {offer.fareBrand ? (
              <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs font-medium">
                {cabinLabel[offer.cabin]} · {FARE_BRAND_LABELS[offer.fareBrand]}
              </span>
            ) : (
              <span className="text-xs text-text-muted">{cabinLabel[offer.cabin]}</span>
            )}
          </div>
        </div>
        <div className="flex flex-row items-end justify-between gap-3 border-t border-border bg-surface-2/50 p-4 md:w-56 md:flex-col md:items-stretch md:justify-center md:border-l md:border-t-0">
          <div className="md:text-right">
            <p className="price text-2xl font-bold leading-none" data-testid="flight-price">
              {usd(offer.pricePerAdultCents)}
            </p>
            <p className="mt-1 text-xs text-text-muted">per adult{travelers > 1 ? ` · ${usd(offer.totalPriceCents)} total` : ""}</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {offer.providerCount && offer.providerCount > 1 ? `${offer.providerCount} providers` : `via ${offer.provider.name}`}
            </p>
          </div>
          {demo || !href ? (
            <Button size="sm" disabled className="md:w-full" data-testid="flight-view-deal-disabled" title="Demo fares can't be booked">
              {demo ? "Demo — not bookable" : "No booking link"}
            </Button>
          ) : (
            <Button asChild size="sm" className="bg-flights-action text-flights-action-fg hover:bg-flights-action/90 md:w-full">
              <a href={href} target="_blank" rel="sponsored nofollow noopener" data-testid="flight-view-deal">
                View deal <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-xs font-semibold text-flights-action hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        data-testid="flight-details-toggle"
      >
        {open ? "Hide details" : "Flight details"} {open ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
      </button>
      {open ? (
        <div id={detailsId} className="flex flex-col gap-5 border-t border-border p-4" data-testid="flight-details">
          {offer.slices.map((s, i) => (
            <SliceDetails key={i} slice={s} airports={airports} index={i} total={offer.slices.length} />
          ))}
          {offer.fareOptions?.length ? <FareOptions options={offer.fareOptions} current={offer.fareBrand} adults={adults} /> : null}
          <p className="text-xs text-text-muted">
            Times are local to each airport. {demo ? "Demo fare: itinerary and price are generated samples and can't be booked." : "Fares can change until booked with the provider."}
          </p>
        </div>
      ) : null}
    </article>
  );
}
