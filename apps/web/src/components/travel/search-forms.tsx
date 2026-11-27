"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Search } from "lucide-react";
import { HotelSearchQuery } from "@pricora/contracts";
import { Checkbox, Label, cn } from "@pricora/ui";
import type { Place } from "@/lib/places";
import { DateRangePicker, iso, type DateRange } from "./date-range-picker";
import { PlaceInput } from "./place-input";
import { ChildAges, Stepper, TravelersField } from "./travelers-popover";

function placeFromCode(code: string | undefined, type: Place["type"] = "airport"): Place | null {
  if (!code) return null;
  return { id: `${type}-${code}`, type, name: code, code, detail: "", label: code, city: type === "city" ? code : null };
}

function today(): string {
  return iso(new Date());
}
function plus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

function ErrorBox({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div role="alert" className="mt-3 rounded-md bg-error-soft px-3 py-2 text-sm font-medium text-error">
      {errors.map((e) => (
        <p key={e}>{e}</p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Flights */

/** Flight form lives with the flights feature (multi-city etc.); re-exported so existing imports keep working. */
export { FlightSearchForm, type FlightFormValues } from "./flights/flight-search-form";

/* ------------------------------------------------------------- Hotels */

export interface HotelFormValues {
  city: string;
  checkin: string;
  checkout: string;
  adults: number;
  childAges: number[];
  rooms: number;
  work: boolean;
  /** Back-compat: total guests (adults + children). */
  guests: number;
}

/** Booking-style joined bar with an amber frame: Destination | Check-in — Check-out | Rooms & guests | Search. */
export function HotelSearchForm({
  initial,
  layout = "bar",
  extraParams,
}: {
  initial?: Partial<HotelFormValues>;
  compact?: boolean;
  layout?: "bar" | "stacked";
  /** Extra query params carried into the results URL (e.g. a property-type filter from the hotels home). */
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const id = React.useId();
  const [dest, setDest] = React.useState<Place | null>(placeFromCode(initial?.city || undefined, "city"));
  const [dates, setDates] = React.useState<DateRange>({ start: initial?.checkin || null, end: initial?.checkout || null });
  const [adults, setAdults] = React.useState(initial?.adults ?? Math.max(1, (initial?.guests ?? 2) - (initial?.childAges?.length ?? 0)));
  const [childAges, setChildAges] = React.useState<number[]>(initial?.childAges ?? []);
  const [rooms, setRooms] = React.useState(initial?.rooms ?? 1);
  const [work, setWork] = React.useState(initial?.work ?? false);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [min, setMin] = React.useState("2000-01-01");

  React.useEffect(() => {
    setMin(today());
    setDates((d) => (d.start ? d : { start: plus(14), end: plus(17) }));
  }, []);

  const guests = adults + childAges.length;
  const summary = `${adults} ${adults === 1 ? "adult" : "adults"} · ${childAges.length} ${childAges.length === 1 ? "child" : "children"} · ${rooms} ${rooms === 1 ? "room" : "rooms"}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const city = dest?.city ?? dest?.name ?? "";
    const errs: string[] = [];
    if (!dest) errs.push("Enter a destination.");
    if (!dates.start || !dates.end) errs.push("Choose check-in and check-out dates.");
    if (rooms > adults) errs.push("Each room needs at least one adult.");
    if (errs.length) return setErrors(errs);
    const parsed = HotelSearchQuery.safeParse({ city, checkin: dates.start, checkout: dates.end, guests, rooms });
    if (!parsed.success) return setErrors(parsed.error.issues.map((i) => i.message));
    setErrors([]);
    const sp = new URLSearchParams({ city, checkin: parsed.data.checkin, checkout: parsed.data.checkout, guests: String(guests), rooms: String(rooms), adults: String(adults) });
    if (childAges.length) sp.set("ages", childAges.join(","));
    if (work) sp.set("work", "1");
    if (dest && /^(city|airport|country)_[A-Za-z0-9]+$/.test(dest.id)) sp.set("placeId", dest.id);
    for (const [k, v] of Object.entries(extraParams ?? {})) if (v) sp.set(k, v);
    router.push("/travel/hotels/search?" + sp.toString());
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Search hotels" data-testid="hotel-search-form">
      <div className={cn("grid gap-1 rounded-lg bg-hotels-accent p-1", layout === "bar" && "lg:grid-cols-[1.5fr_1.3fr_1.2fr_auto]")}>
        <div className="rounded-md bg-surface text-text">
          <PlaceInput id={`${id}-city`} label="Destination" placeholder="Where are you going?" value={dest} onChange={setDest} types={["city", "country"]} recentKey="hotel-dest" icon={BedDouble} testId="hotel-city" invalid={errors.length > 0 && !dest} />
        </div>
        <div className="rounded-md bg-surface text-text">
          <DateRangePicker id={`${id}-dates`} startLabel="Check-in" endLabel="Check-out" value={dates} onChange={setDates} min={min} testId="hotel-dates" />
        </div>
        <div className="rounded-md bg-surface text-text">
          <TravelersField id={`${id}-guests`} label="Rooms and guests" summary={summary} testId="hotel-guests">
            <Stepper label="Adults" value={adults} min={1} max={16} onChange={setAdults} />
            <Stepper label="Children" hint="0–17" value={childAges.length} min={0} max={8} onChange={(n) => setChildAges((a) => (n > a.length ? [...a, 8] : a.slice(0, n)))} />
            <ChildAges ages={childAges} onChange={setChildAges} />
            <Stepper label="Rooms" value={rooms} min={1} max={8} onChange={setRooms} />
          </TravelersField>
        </div>
        <button
          type="submit"
          className={cn("inline-flex h-14 items-center justify-center gap-2 rounded-md bg-hotels px-8 text-md font-bold text-hotels-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", layout === "bar" && "lg:h-auto")}
          data-testid="hotel-search-submit"
        >
          <Search aria-hidden className="size-5" /> Search
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Checkbox id={`${id}-work`} checked={work} onCheckedChange={(c) => setWork(c === true)} className="border-current" />
        <Label htmlFor={`${id}-work`} className="text-sm font-medium text-current">
          I&apos;m traveling for work <span className="opacity-80">(refundable rates first)</span>
        </Label>
      </div>
      <ErrorBox errors={errors} />
    </form>
  );
}
