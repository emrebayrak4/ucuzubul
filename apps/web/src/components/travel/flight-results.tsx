"use client";

import * as React from "react";
import { ExternalLink, PlaneTakeoff } from "lucide-react";
import type { FlightOffer, FlightSearchResponse, FlightSlice } from "@pricora/contracts";
import { Badge, Button, Checkbox, DemoDataBadge, EmptyState, Label, StoreLogo, cn, formatPrice } from "@pricora/ui";
import { Segmented } from "@/components/segmented";
import { formatDuration } from "@pricora/utils";
import { PUBLIC_API_URL } from "@/lib/env";
import { cabinLabel } from "@/lib/format";

type Sort = "best" | "cheapest" | "fastest";

/** HH:MM from an ISO string with offset — shown in the airport's local time (no browser TZ conversion). */
function localTime(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}
const totalDuration = (o: FlightOffer) => o.slices.reduce((s, x) => s + x.durationMinutes, 0);
const maxStops = (o: FlightOffer) => Math.max(...o.slices.map((s) => s.stops));

function SliceRow({ slice }: { slice: FlightSlice }) {
  const plus = dayDiff(slice.departAt, slice.arriveAt);
  const layovers = slice.segments.slice(0, -1).map((seg, i) => {
    const next = slice.segments[i + 1]!;
    const mins = Math.round((Date.parse(next.departAt) - Date.parse(seg.arriveAt)) / 60000);
    return `${seg.to} ${formatDuration(mins)}`;
  });
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
      <div className="text-right">
        <p className="price text-lg font-semibold">{localTime(slice.departAt)}</p>
        <p className="font-mono text-xs text-text-muted">{slice.from}</p>
      </div>
      <div className="flex flex-col items-center gap-1 px-1">
        <span className="price text-xs text-text-muted">{formatDuration(slice.durationMinutes)}</span>
        <div className="relative h-px w-full bg-border-strong">
          {Array.from({ length: slice.stops }, (_, i) => (
            <span key={i} className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-text-muted" style={{ left: `${((i + 1) / (slice.stops + 1)) * 100}%` }} />
          ))}
        </div>
        <span className={cn("text-xs", slice.stops === 0 ? "text-success" : "text-text-muted")}>
          {slice.stops === 0 ? "Nonstop" : `${slice.stops} stop${slice.stops > 1 ? "s" : ""} · ${layovers.join(", ")}`}
        </span>
      </div>
      <div>
        <p className="price text-lg font-semibold">
          {localTime(slice.arriveAt)}
          {plus > 0 ? <sup className="ml-0.5 text-2xs font-medium text-warning">+{plus}</sup> : null}
        </p>
        <p className="font-mono text-xs text-text-muted">{slice.to}</p>
      </div>
    </div>
  );
}

function FlightCard({ offer, adults, tags }: { offer: FlightOffer; adults: number; tags: string[] }) {
  const carriers = Array.from(new Map(offer.slices.flatMap((s) => s.segments.map((g) => [g.marketingCarrier.iata, g.marketingCarrier]))).values());
  const main = carriers[0];
  const href = (offer.goUrl.startsWith("http") ? offer.goUrl : PUBLIC_API_URL + offer.goUrl) + "?placement=flight_results";
  return (
    <article className="rounded-md border border-border bg-surface p-4" data-testid="flight-card">
      {tags.length ? (
        <div className="mb-2 flex gap-1.5">
          {tags.map((t) => (
            <Badge key={t} size="sm" variant="neutral">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2.5 md:w-40">
          {main ? <StoreLogo name={main.name} logoUrl={main.logoUrl} size="md" /> : null}
          <p className="text-xs text-text-muted">{carriers.map((c) => c.name).join(", ")}</p>
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {offer.slices.map((s, i) => (
            <SliceRow key={i} slice={s} />
          ))}
        </div>
        <div className="flex flex-col items-start gap-1 border-t border-border pt-3 md:w-52 md:items-end md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <span className="price text-xl font-semibold">{formatPrice(offer.totalPriceCents, { currency: offer.currency })}</span>
          <span className="text-xs text-text-muted">
            total for {adults} {adults === 1 ? "adult" : "adults"}
            {adults > 1 ? ` · ${formatPrice(offer.pricePerAdultCents, { currency: offer.currency })} per adult` : ""}
          </span>
          <span className="text-xs text-text-muted">
            {cabinLabel[offer.cabin]} · via {offer.provider.name}
            {offer.refundable ? " · Refundable" : ""}
          </span>
          {offer.source === "demo" ? <DemoDataBadge size="sm" /> : null}
          {offer.source === "demo" ? (
            <span className="mt-1 text-xs text-text-muted" data-testid="demo-fare-no-link">
              Demo fare — no booking link
            </span>
          ) : (
            <Button asChild size="sm" className="mt-1">
              <a href={href} target="_blank" rel="sponsored nofollow noopener" data-testid="flight-view-deal" className="bg-flights-action text-flights-action-fg hover:bg-flights-action/90">
                View deal <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function FlightResults({ data, minCheckedBags = 0 }: { data: FlightSearchResponse; minCheckedBags?: number }) {
  const [sort, setSort] = React.useState<Sort>("best");
  const [stops, setStops] = React.useState<Set<number>>(new Set());
  const [airlines, setAirlines] = React.useState<Set<string>>(new Set());

  const offers = data.offers;
  const minPrice = Math.min(...offers.map((o) => o.totalPriceCents));
  const maxPrice = Math.max(...offers.map((o) => o.totalPriceCents));
  const minDur = Math.min(...offers.map(totalDuration));
  const maxDur = Math.max(...offers.map(totalDuration));
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0 : (v - lo) / (hi - lo));
  const bestScore = (o: FlightOffer) => 0.6 * norm(o.totalPriceCents, minPrice, maxPrice) + 0.4 * norm(totalDuration(o), minDur, maxDur);

  const cheapestId = offers.reduce<FlightOffer | null>((a, o) => (!a || o.totalPriceCents < a.totalPriceCents ? o : a), null)?.id;
  const fastestId = offers.reduce<FlightOffer | null>((a, o) => (!a || totalDuration(o) < totalDuration(a) ? o : a), null)?.id;
  const bestId = offers.reduce<FlightOffer | null>((a, o) => (!a || bestScore(o) < bestScore(a) ? o : a), null)?.id;

  const stopOptions = Array.from(new Set(offers.map(maxStops))).sort();
  const airlineOptions = data.airlines.length
    ? data.airlines
    : Array.from(new Map(offers.flatMap((o) => o.slices.flatMap((s) => s.segments.map((g) => [g.marketingCarrier.iata, g.marketingCarrier])))).values());

  const filtered = offers
    // Bags filter: offers with unknown baggage are kept (the card says so) rather than hidden.
    .filter((o) => !minCheckedBags || o.baggage?.checked === null || o.baggage === null || (o.baggage?.checked ?? 0) >= minCheckedBags)
    .filter((o) => stops.size === 0 || stops.has(Math.min(maxStops(o), 2)))
    .filter((o) => airlines.size === 0 || o.slices.some((s) => s.segments.some((g) => airlines.has(g.marketingCarrier.iata))))
    .sort((a, b) =>
      sort === "cheapest" ? a.totalPriceCents - b.totalPriceCents : sort === "fastest" ? totalDuration(a) - totalDuration(b) : bestScore(a) - bestScore(b),
    );

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="shrink-0 lg:w-56" aria-label="Flight filters">
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold">Stops</legend>
          {[0, 1, 2]
            .filter((s) => stopOptions.some((o) => Math.min(o, 2) === s))
            .map((s) => (
              <div key={s} className="mb-1.5 flex items-center gap-2">
                <Checkbox id={`stops-${s}`} checked={stops.has(s)} onCheckedChange={() => setStops((p) => toggle(p, s))} />
                <Label htmlFor={`stops-${s}`} className="text-sm font-normal">
                  {s === 0 ? "Nonstop" : s === 1 ? "1 stop" : "2+ stops"}
                </Label>
              </div>
            ))}
        </fieldset>
        {airlineOptions.length > 1 ? (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Airlines</legend>
            {airlineOptions.map((a) => (
              <div key={a.iata} className="mb-1.5 flex items-center gap-2">
                <Checkbox id={`al-${a.iata}`} checked={airlines.has(a.iata)} onCheckedChange={() => setAirlines((p) => toggle(p, a.iata))} />
                <Label htmlFor={`al-${a.iata}`} className="text-sm font-normal">
                  {a.name}
                </Label>
              </div>
            ))}
          </fieldset>
        ) : null}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-text-muted">
            <span className="price font-semibold text-text">{filtered.length}</span> of {offers.length} itineraries
          </p>
          <Segmented
            label="Sort flights"
            value={sort}
            onChange={setSort}
            options={[
              { value: "best", label: "Best" },
              { value: "cheapest", label: "Cheapest" },
              { value: "fastest", label: "Fastest" },
            ]}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<PlaneTakeoff aria-hidden />}
            title="No flights match these filters"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStops(new Set());
                  setAirlines(new Set());
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3" data-testid="flight-results">
            {filtered.map((o) => (
              <li key={o.id}>
                <FlightCard
                  offer={o}
                  adults={data.query.adults}
                  tags={[o.id === bestId ? "Best" : null, o.id === cheapestId ? "Cheapest" : null, o.id === fastestId ? "Fastest" : null].filter((t): t is string => Boolean(t))}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-text-muted">
          Fares are totals for all travelers as returned by the provider and can change until booked. We may earn a commission from “View deal”
          links; it never affects the order of results.
        </p>
      </div>
    </div>
  );
}
