"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ChevronDown, Plus, PlaneLanding, PlaneTakeoff, Search, X } from "lucide-react";
import { FlightSearchQuery } from "@pricora/contracts";
import { Checkbox, Label, cn } from "@pricora/ui";
import type { Place } from "@/lib/places";
import { DateRangePicker, iso, type DateRange } from "../date-range-picker";
import { PlaceInput } from "../place-input";
import { Stepper, TravelersField } from "../travelers-popover";

type Cabin = "economy" | "premium_economy" | "business" | "first";
const cabinText: Record<Cabin, string> = { economy: "Economy", premium_economy: "Premium economy", business: "Business", first: "First" };
export type TripType = "round" | "oneway" | "multi";

export interface FlightFormValues {
  from: string;
  to: string;
  depart: string;
  return: string;
  adults: number;
  children: number;
  infants: number;
  cabin: Cabin;
  trip: TripType;
  direct: boolean;
  bags: number;
  /** Multi-city legs. */
  legs: Array<{ from: string; to: string; date: string }>;
}

function placeFromCode(code: string | undefined): Place | null {
  if (!code) return null;
  return { id: `airport-${code}`, type: "airport", name: code, code, detail: "", label: code, city: null };
}
const plus = (days: number, from?: string) => {
  const d = from ? new Date(`${from}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};

function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 cursor-pointer appearance-none rounded-md border border-current/40 bg-transparent pl-3 pr-8 text-sm font-semibold text-current hover:border-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current [&>option]:text-text"
        data-testid={label === "Trip type" ? "trip-type" : undefined}
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

interface LegState {
  key: number;
  from: Place | null;
  to: Place | null;
  date: string | null;
}

/** Skyscanner-pattern joined bar: From | ⇄ | To | Dates | Travelers & cabin | Search — plus multi-city (up to 5 flights). */
export function FlightSearchForm({ initial }: { initial?: Partial<FlightFormValues> }) {
  const router = useRouter();
  const id = React.useId();
  const [trip, setTrip] = React.useState<TripType>(initial?.trip ?? (initial?.legs?.length ? "multi" : initial?.depart && !initial?.return ? "oneway" : "round"));
  const [from, setFrom] = React.useState<Place | null>(placeFromCode(initial?.from));
  const [to, setTo] = React.useState<Place | null>(placeFromCode(initial?.to));
  const [dates, setDates] = React.useState<DateRange>({ start: initial?.depart || null, end: initial?.return || null });
  const nextKey = React.useRef(10);
  const [legs, setLegs] = React.useState<LegState[]>(
    initial?.legs?.length
      ? initial.legs.map((l, i) => ({ key: i, from: placeFromCode(l.from), to: placeFromCode(l.to), date: l.date }))
      : [
          { key: 0, from: placeFromCode(initial?.from), to: placeFromCode(initial?.to), date: initial?.depart || null },
          { key: 1, from: placeFromCode(initial?.to), to: null, date: null },
        ],
  );
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
    setMin(iso(new Date()));
    setDates((d) => (d.start ? d : { start: plus(14), end: trip === "round" ? plus(21) : null }));
    setLegs((ls) => ls.map((l, i) => (l.date ? l : { ...l, date: plus(14 + i * 4) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const travelers = adults + children + infants;
  const summary = `${travelers} ${travelers === 1 ? "traveler" : "travelers"}, ${cabinText[cabin]}`;
  const setLeg = (i: number, patch: Partial<LegState>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : j === i + 1 && patch.to !== undefined && !l.from ? { ...l, from: patch.to } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (infants > adults) errs.push("Each infant needs an adult on the booking.");
    const sp = new URLSearchParams({ adults: String(adults) });
    if (cabin !== "economy") sp.set("cabin", cabin);
    if (children) sp.set("children", String(children));
    if (infants) sp.set("infants", String(infants));
    if (direct) sp.set("stops", "0");
    if (bags) sp.set("bags", "checked");
    if (trip === "multi") {
      legs.forEach((l, i) => {
        if (!l.from?.code || !l.to?.code || !l.date) errs.push(`Flight ${i + 1}: choose origin, destination and date.`);
      });
      if (errs.length) return setErrors(errs);
      const token = legs.map((l) => `${l.from!.code}:${l.to!.code}:${l.date}`).join(",");
      const parsed = FlightSearchQuery.safeParse({ legs: token, adults, children, infants, cabin });
      if (!parsed.success) return setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
      sp.set("legs", token);
    } else {
      if (!from?.code) errs.push(from?.type === "country" ? "Choose a city or airport to fly from (not a whole country)." : "Choose where you're flying from.");
      if (!to?.code) errs.push(to?.type === "country" ? "Choose a city or airport to fly to (not a whole country)." : "Choose where you're flying to.");
      if (!dates.start) errs.push("Choose a departure date.");
      if (trip === "round" && !dates.end) errs.push("Choose a return date, or switch to one way.");
      if (errs.length) return setErrors(errs);
      const parsed = FlightSearchQuery.safeParse({ from: from!.code!, to: to!.code!, depart: dates.start!, return: trip === "round" ? (dates.end ?? undefined) : undefined, adults, children, infants, cabin });
      if (!parsed.success) return setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
      sp.set("from", from!.code!);
      sp.set("to", to!.code!);
      sp.set("depart", dates.start!);
      if (trip === "round" && dates.end) sp.set("return", dates.end);
    }
    setErrors([]);
    router.push("/travel/flights/search?" + sp.toString());
  };

  const seg = "bg-surface text-text";
  const travelersField = (
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
  );
  const submitButton = (
    <button
      type="submit"
      className="mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-flights-action px-8 text-md font-bold text-flights-action-fg hover:bg-flights-action/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flights-fg focus-visible:ring-offset-2 focus-visible:ring-offset-flights @2xl:mt-0 @2xl:h-auto @5xl:ml-2"
      data-testid="flight-search-submit"
    >
      <Search aria-hidden className="size-5" /> Search
    </button>
  );

  return (
    <form onSubmit={submit} noValidate aria-label="Search flights" data-testid="flight-search-form" className="@container">
      <div className="mb-3 flex flex-wrap gap-2">
        <PillSelect
          label="Trip type"
          value={trip}
          onChange={(v) => {
            const t = v as TripType;
            setTrip(t);
            if (t === "oneway") setDates((d) => ({ start: d.start, end: null }));
            if (t === "multi") setLegs((ls) => [{ ...ls[0]!, from: ls[0]!.from ?? from, to: ls[0]!.to ?? to, date: ls[0]!.date ?? dates.start }, ...ls.slice(1).map((l, i) => (i === 0 && !l.from ? { ...l, from: to } : l))]);
          }}
          options={[
            { value: "round", label: "Round trip" },
            { value: "oneway", label: "One way" },
            { value: "multi", label: "Multi-city" },
          ]}
        />
        <PillSelect
          label="Checked bags"
          value={String(bags)}
          onChange={(v) => setBags(Number(v))}
          options={[
            { value: "0", label: "Bags: any" },
            { value: "1", label: "Checked bag included" },
          ]}
        />
      </div>

      {trip === "multi" ? (
        <div className="flex flex-col gap-2" data-testid="multi-city">
          {legs.map((l, i) => (
            <div key={l.key} className="grid gap-0.5 rounded-lg @3xl:grid-cols-[1fr_1fr_0.9fr_auto]">
              <div className={cn("rounded-t-lg @3xl:rounded-l-lg @3xl:rounded-tr-none", seg)}>
                <PlaceInput id={`${id}-l${l.key}-from`} label={`Flight ${i + 1} from`} placeholder="City or airport" value={l.from} onChange={(p) => setLeg(i, { from: p })} types={["city", "airport"]} recentKey="flight-from" icon={PlaneTakeoff} testId={`leg-${i}-from`} />
              </div>
              <div className={seg}>
                <PlaceInput id={`${id}-l${l.key}-to`} label="To" placeholder="City or airport" value={l.to} onChange={(p) => setLeg(i, { to: p })} types={["city", "airport"]} recentKey="flight-to" icon={PlaneLanding} testId={`leg-${i}-to`} />
              </div>
              <div className={cn("rounded-b-lg @3xl:rounded-none @3xl:rounded-r-lg", seg)}>
                <DateRangePicker id={`${id}-l${l.key}-date`} mode="single" startLabel="Depart" value={{ start: l.date, end: null }} onChange={(r) => setLeg(i, { date: r.start })} min={i > 0 ? (legs[i - 1]?.date ?? min) : min} testId={`leg-${i}-date`} />
              </div>
              <div className="flex items-center justify-end @3xl:pl-2">
                {legs.length > 2 ? (
                  <button type="button" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove flight ${i + 1}`} className="rounded-full p-2 text-current hover:bg-white/10">
                    <X aria-hidden className="size-5" />
                  </button>
                ) : (
                  <span className="hidden w-9 @3xl:block" />
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 @3xl:flex-row @3xl:items-stretch">
            {legs.length < 5 ? (
              <button
                type="button"
                onClick={() => {
                  const last = legs[legs.length - 1];
                  setLegs((ls) => [...ls, { key: nextKey.current++, from: last?.to ?? null, to: null, date: last?.date ? plus(4, last.date) : null }]);
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-current/40 px-4 text-sm font-semibold hover:border-current"
                data-testid="add-flight"
              >
                <Plus aria-hidden className="size-4" /> Add another flight
              </button>
            ) : null}
            <div className={cn("flex-1 rounded-lg", seg)}>{travelersField}</div>
            {submitButton}
          </div>
        </div>
      ) : (
        <div className="grid gap-1 overflow-visible @2xl:grid-cols-6 @5xl:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(0,1.35fr)_minmax(0,1.1fr)_auto] @5xl:gap-0.5">
          <div className={cn("relative rounded-lg @2xl:col-span-3 @5xl:col-span-1 @5xl:rounded-r-none", seg)}>
            <PlaceInput id={`${id}-from`} label="From" placeholder="Country, city or airport" value={from} onChange={setFrom} types={["city", "airport", "country"]} recentKey="flight-from" icon={PlaneTakeoff} testId="flight-from" invalid={errors.length > 0 && !from?.code} />
            <button
              type="button"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              aria-label="Swap origin and destination"
              className="absolute -bottom-4 right-6 z-raised flex size-8 items-center justify-center rounded-full border-2 border-flights bg-surface text-text shadow-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:-right-4 @2xl:bottom-auto @2xl:top-1/2 @2xl:-translate-y-1/2"
            >
              <ArrowLeftRight aria-hidden className="size-4 rotate-90 @2xl:rotate-0" />
            </button>
          </div>
          <div className={cn("rounded-lg @2xl:col-span-3 @5xl:col-span-1 @5xl:rounded-none", seg)}>
            <PlaceInput id={`${id}-to`} label="To" placeholder="Country, city or airport" value={to} onChange={setTo} types={["city", "airport", "country"]} recentKey="flight-to" icon={PlaneLanding} testId="flight-to" className="@2xl:pl-3" invalid={errors.length > 0 && !to?.code} />
          </div>
          <div className={cn("rounded-lg @2xl:col-span-3 @5xl:col-span-1 @5xl:rounded-none", seg)}>
            <DateRangePicker id={`${id}-dates`} mode={trip === "round" ? "range" : "single"} startLabel="Depart" endLabel="Return" value={dates} onChange={setDates} min={min} testId="flight-dates" />
          </div>
          <div className={cn("rounded-lg @2xl:col-span-2 @5xl:col-span-1 @5xl:rounded-l-none", seg)}>{travelersField}</div>
          {submitButton}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-direct`} checked={direct} onCheckedChange={(c) => setDirect(c === true)} className="border-current" />
          <Label htmlFor={`${id}-direct`} className="text-sm font-medium text-current">
            Direct flights only
          </Label>
        </div>
      </div>
      {errors.length ? (
        <div role="alert" className="mt-3 rounded-md bg-error-soft px-3 py-2 text-sm font-medium text-error">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
