"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { cn } from "@pricora/ui";
import { DateRangePicker, iso, type DateRange } from "../date-range-picker";
import { Stepper, TravelersField } from "../travelers-popover";
import { fmtUsd } from "./format";

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="flex size-full items-center justify-center bg-surface-2 text-sm text-text-muted">Loading map…</div>,
});

export function HotelLocationMap({ lat, lon, name, className }: { lat: number; lon: number; name: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)}>
      <LeafletMap pins={[{ id: "hotel", lat, lon, label: "Here", title: name }]} center={{ lat, lng: lon }} zoom={15} className="size-full" />
    </div>
  );
}

type Stay = { checkin: string; checkout: string; nights: number; guests: number; rooms: number };

/** Edits dates/guests in the URL (server re-prices). Shared by the sticky side box and the mobile bottom bar. */
function useStayEditor(stay: Stay) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = React.useTransition();
  const apply = (next: Partial<Stay>) => {
    const s = { ...stay, ...next };
    const sp = new URLSearchParams({ checkin: s.checkin, checkout: s.checkout, guests: String(s.guests), rooms: String(s.rooms) });
    start(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  };
  return { apply, pending };
}

export function StayPriceBox({ stay, lowestTotal, lowestNightly, taxesEstimated, demo, roomsAvailable }: { stay: Stay; lowestTotal: number | null; lowestNightly: number | null; taxesEstimated: boolean; demo: boolean; roomsAvailable: number }) {
  const { apply, pending } = useStayEditor(stay);
  const id = React.useId();
  const [dates, setDates] = React.useState<DateRange>({ start: stay.checkin, end: stay.checkout });
  const [guests, setGuests] = React.useState(stay.guests);
  const [rooms, setRooms] = React.useState(stay.rooms);
  const [min, setMin] = React.useState("2000-01-01");
  React.useEffect(() => setMin(iso(new Date())), []);
  React.useEffect(() => {
    setDates({ start: stay.checkin, end: stay.checkout });
    setGuests(stay.guests);
    setRooms(stay.rooms);
  }, [stay.checkin, stay.checkout, stay.guests, stay.rooms]);
  const dirty = dates.start !== stay.checkin || dates.end !== stay.checkout || guests !== stay.guests || rooms !== stay.rooms;

  return (
    <div className="rounded-lg border-2 border-hotels-accent bg-surface p-4 shadow-sm" aria-busy={pending} data-testid="price-box">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Your stay</p>
      <div className="mt-2 grid gap-2">
        <div className="rounded-md border border-border">
          <DateRangePicker id={`${id}-d`} startLabel="Check-in" endLabel="Check-out" value={dates} onChange={setDates} min={min} testId="detail-dates" />
        </div>
        <div className="rounded-md border border-border">
          <TravelersField id={`${id}-g`} label="Guests and rooms" summary={`${guests} ${guests === 1 ? "guest" : "guests"} · ${rooms} ${rooms === 1 ? "room" : "rooms"}`}>
            <Stepper label="Guests" value={guests} min={1} max={16} onChange={setGuests} />
            <Stepper label="Rooms" value={rooms} min={1} max={Math.min(8, guests)} onChange={setRooms} />
          </TravelersField>
        </div>
        {dirty ? (
          <button
            type="button"
            disabled={!dates.start || !dates.end}
            onClick={() => dates.start && dates.end && apply({ checkin: dates.start, checkout: dates.end, guests, rooms: Math.min(rooms, guests) })}
            className="h-11 rounded-md bg-hotels text-sm font-bold text-hotels-fg hover:opacity-90 disabled:opacity-50"
            data-testid="update-stay"
          >
            Update prices
          </button>
        ) : null}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        {lowestTotal !== null && lowestNightly !== null ? (
          <>
            <p className="text-xs text-text-muted">
              Lowest price · {stay.nights} {stay.nights === 1 ? "night" : "nights"}, {stay.rooms} {stay.rooms === 1 ? "room" : "rooms"}
            </p>
            <p className="price text-2xl font-extrabold">{fmtUsd(lowestTotal)}</p>
            <p className="text-xs text-text-muted">
              {fmtUsd(lowestNightly)} / night · {taxesEstimated ? "incl. estimated taxes & fees" : "incl. taxes & fees"}
            </p>
            {demo ? <p className="mt-1 text-xs font-semibold text-demo-fg">Demo price — not bookable</p> : null}
          </>
        ) : (
          <p className="text-sm text-text-muted">No rates for these dates. Try other dates.</p>
        )}
        <a href="#rooms" className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md bg-hotels text-sm font-bold text-hotels-fg hover:opacity-90">
          {roomsAvailable ? `See ${roomsAvailable} room ${roomsAvailable === 1 ? "type" : "types"}` : "See rooms"}
        </a>
      </div>
    </div>
  );
}

/** Mobile: sticky bottom bar with the price and a jump to dates/rooms. */
export function MobileStayBar({ stay, lowestTotal }: { stay: Stay; lowestTotal: number | null }) {
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:hidden" data-testid="mobile-stay-bar">
      <div className="flex items-center gap-3">
        <a href="#stay" className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <CalendarDays aria-hidden className="size-3.5" /> {fmt(stay.checkin)} – {fmt(stay.checkout)} · {stay.guests} guests
          </span>
          <span className="price block text-lg font-extrabold">{lowestTotal !== null ? fmtUsd(lowestTotal) : "Select dates"}</span>
        </a>
        <a href="#rooms" className="inline-flex h-11 items-center rounded-md bg-hotels px-5 text-sm font-bold text-hotels-fg">
          See rooms
        </a>
      </div>
    </div>
  );
}
