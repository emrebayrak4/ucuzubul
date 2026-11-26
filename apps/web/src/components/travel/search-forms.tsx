"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BedDouble, ChevronDown, PlaneLanding, PlaneTakeoff, Search } from "lucide-react";
import { FlightSearchQuery, HotelSearchQuery } from "@pricora/contracts";
import { Checkbox, Label, cn } from "@pricora/ui";
import type { Place } from "@/lib/places";
import { DateRangePicker, iso, type DateRange } from "./date-range-picker";
import { PlaceInput } from "./place-input";
import { ChildAges, Stepper, TravelersField } from "./travelers-popover";

type Cabin = "economy" | "premium_economy" | "business" | "first";
const cabinText: Record<Cabin, string> = { economy: "Economy", premium_economy: "Premium economy", business: "Business", first: "First" };

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

/** Pill-style select shown above the flights bar (trip type, bags). */
function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-md border border-current/40 bg-transparent pl-3 pr-8 text-sm font-semibold text-current hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current [&>option]:text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2" />
    </span>
  );
}

/* ------------------------------------------------------------ Flights */

export interface FlightFormValues {
  from: string;
  to: string;
  depart: string;
  return: string;
  adults: number;
  children: number;
  infants: number;
  cabin: Cabin;
  trip: "round" | "oneway";
  direct: boolean;
  bags: number;
}

/** Skyscanner-style joined bar: From | ⇄ | To | Depart — Return | Travelers & cabin | Search. */
export function FlightSearchForm({ initial }: { initial?: Partial<FlightFormValues>; compact?: boolean }) {
  const router = useRouter();
  const id = React.useId();
  const [from, setFrom] = React.useState<Place | null>(placeFromCode(initial?.from));
  const [to, setTo] = React.useState<Place | null>(placeFromCode(initial?.to));
  const [trip, setTrip] = React.useState<FlightFormValues["trip"]>(initial?.trip ?? (initial?.depart && !initial?.return ? "oneway" : "round"));
  const [dates, setDates] = React.useState<DateRange>({ start: initial?.depart || null, end: initial?.return || null });
  const [adults, setAdults] = React.useState(initial?.adults ?? 1);
  const [children, setChildren] = React.useState(initial?.children ?? 0);
  const [infants, setInfants] = React.useState(initial?.infants ?? 0);
  const [cabin, setCabin] = React.useState<Cabin>(initial?.cabin ?? "economy");
  const [direct, setDirect] = React.useState(initial?.direct ?? false);
  const [bags, setBags] = React.useState(initial?.bags ?? 0);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [min, setMin] = React.useState("2000-01-01");

  React.useEffect(() => {
    // Computed on the client so a cached page never pre-fills past dates.
    setMin(today());
    setDates((d) => (d.start ? d : { start: plus(14), end: trip === "round" ? plus(21) : null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const travelers = adults + children + infants;
  const summary = `${travelers} ${travelers === 1 ? "traveler" : "travelers"}, ${cabinText[cabin]}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!from?.code) errs.push(from?.type === "country" ? "Choose a city or airport to fly from (not a whole country)." : "Choose where you're flying from.");
    if (!to?.code) errs.push(to?.type === "country" ? "Choose a city or airport to fly to (not a whole country)." : "Choose where you're flying to.");
    if (!dates.start) errs.push("Choose a departure date.");
    if (trip === "round" && !dates.end) errs.push("Choose a return date, or switch to one way.");
    if (infants > adults) errs.push("Each infant needs an adult on the booking.");
    if (errs.length) return setErrors(errs);
    const query = {
      from: from!.code!,
      to: to!.code!,
      depart: dates.start!,
      return: trip === "round" ? (dates.end ?? undefined) : undefined,
      adults,
      children,
      infants,
      cabin,
      maxStops: direct ? 0 : undefined,
    };
    const parsed = FlightSearchQuery.safeParse(query);
    if (!parsed.success) return setErrors(parsed.error.issues.map((i) => i.message));
    setErrors([]);
    const sp = new URLSearchParams({ from: parsed.data.from, to: parsed.data.to, depart: parsed.data.depart, adults: String(adults), cabin });
    if (parsed.data.return) sp.set("return", parsed.data.return);
    if (children) sp.set("children", String(children));
    if (infants) sp.set("infants", String(infants));
    if (direct) sp.set("direct", "1");
    if (bags) sp.set("bags", String(bags));
    router.push("/travel/flights/search?" + sp.toString());
  };

  const seg = "bg-surface text-text";
  return (
    <form onSubmit={submit} noValidate aria-label="Search flights" data-testid="flight-search-form">
      <div className="mb-3 flex flex-wrap gap-2">
        <PillSelect
          label="Trip type"
          value={trip}
          onChange={(v) => {
            setTrip(v as FlightFormValues["trip"]);
            if (v === "oneway") setDates((d) => ({ start: d.start, end: null }));
          }}
          options={[
            { value: "round", label: "Round trip" },
            { value: "oneway", label: "One way" },
          ]}
        />
        <PillSelect
          label="Checked bags"
          value={String(bags)}
          onChange={(v) => setBags(Number(v))}
          options={[
            { value: "0", label: "Bags: any" },
            { value: "1", label: "1+ checked bag" },
            { value: "2", label: "2+ checked bags" },
          ]}
        />
      </div>
      <div className="grid gap-0.5 overflow-visible rounded-lg lg:grid-cols-[1fr_1fr_1.35fr_1.1fr_auto] lg:gap-0.5">
        <div className={cn("relative rounded-t-lg lg:rounded-l-lg lg:rounded-tr-none", seg)}>
          <PlaceInput id={`${id}-from`} label="From" placeholder="Country, city or airport" value={from} onChange={setFrom} types={["city", "airport", "country"]} recentKey="flight-from" icon={PlaneTakeoff} testId="flight-from" invalid={errors.length > 0 && !from?.code} />
          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            aria-label="Swap origin and destination"
            className="absolute -bottom-4 right-6 z-raised flex size-8 items-center justify-center rounded-full border-2 border-flights bg-surface text-text shadow-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:-right-4 lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
          >
            <ArrowLeftRight aria-hidden className="size-4 rotate-90 lg:rotate-0" />
          </button>
        </div>
        <div className={seg}>
          <PlaceInput id={`${id}-to`} label="To" placeholder="Country, city or airport" value={to} onChange={setTo} types={["city", "airport", "country"]} recentKey="flight-to" icon={PlaneLanding} testId="flight-to" className="lg:pl-3" invalid={errors.length > 0 && !to?.code} />
        </div>
        <div className={seg}>
          <DateRangePicker id={`${id}-dates`} mode={trip === "round" ? "range" : "single"} startLabel="Depart" endLabel="Return" value={dates} onChange={setDates} min={min} testId="flight-dates" />
        </div>
        <div className={cn("rounded-b-lg lg:rounded-none", seg)}>
          <TravelersField id={`${id}-pax`} label="Travelers and cabin class" summary={summary} testId="flight-travelers">
            <Stepper label="Adults" hint="18+" value={adults} min={1} max={9} onChange={setAdults} />
            <Stepper label="Children" hint="2–17" value={children} min={0} max={8} onChange={setChildren} />
            <Stepper label="Infants" hint="Under 2, on lap" value={infants} min={0} max={4} onChange={setInfants} />
            <div className="py-2">
              <label htmlFor={`${id}-cabin`} className="text-sm font-semibold">
                Cabin class
              </label>
              <select id={`${id}-cabin`} value={cabin} onChange={(e) => setCabin(e.target.value as Cabin)} className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm">
                {Object.entries(cabinText).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </TravelersField>
        </div>
        <button
          type="submit"
          className="mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-flights-action px-8 text-md font-bold text-flights-action-fg hover:bg-flights-action/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flights-fg focus-visible:ring-offset-2 focus-visible:ring-offset-flights lg:ml-2 lg:mt-0 lg:h-auto"
          data-testid="flight-search-submit"
        >
          <Search aria-hidden className="size-5" /> Search
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-direct`} checked={direct} onCheckedChange={(c) => setDirect(c === true)} className="border-current" />
          <Label htmlFor={`${id}-direct`} className="text-sm font-medium text-current">
            Direct flights only
          </Label>
        </div>
      </div>
      <ErrorBox errors={errors} />
    </form>
  );
}

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
export function HotelSearchForm({ initial, layout = "bar" }: { initial?: Partial<HotelFormValues>; compact?: boolean; layout?: "bar" | "stacked" }) {
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
