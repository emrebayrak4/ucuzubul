"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BedDouble, Plane, Search } from "lucide-react";
import { FlightSearchQuery, HotelSearchQuery } from "@pricora/contracts";
import { addDays, toIsoDate } from "@pricora/utils";
import { Button, FieldMessage, Input, Label, Select, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@pricora/ui";
import { Segmented } from "@/components/segmented";
import { AirportInput } from "./airport-input";

function issuesToMap(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

const fieldCls = "h-11";

/* ------------------------------------------------------------ Flights */

export interface FlightFormValues {
  from: string;
  to: string;
  depart: string;
  return: string;
  adults: number;
  cabin: "economy" | "premium_economy" | "business" | "first";
  trip: "round" | "oneway";
}

export function FlightSearchForm({ initial, compact = false }: { initial?: Partial<FlightFormValues>; compact?: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<FlightFormValues>({
    from: initial?.from ?? "",
    to: initial?.to ?? "",
    depart: initial?.depart ?? "",
    return: initial?.return ?? "",
    adults: initial?.adults ?? 1,
    cabin: initial?.cabin ?? "economy",
    trip: initial?.trip ?? (initial?.depart && !initial?.return ? "oneway" : "round"),
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [minDate, setMinDate] = React.useState<string>();
  const id = React.useId();

  React.useEffect(() => {
    // Dates are computed on the client so a cached page never pre-fills past dates.
    const today = new Date();
    setMinDate(toIsoDate(today));
    setV((p) => ({
      ...p,
      depart: p.depart || toIsoDate(addDays(today, 14)),
      return: p.return || toIsoDate(addDays(today, 21)),
    }));
  }, []);

  const set = <K extends keyof FlightFormValues>(k: K, val: FlightFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = {
      from: v.from,
      to: v.to,
      depart: v.depart,
      return: v.trip === "round" ? v.return : undefined,
      adults: v.adults,
      cabin: v.cabin,
    };
    const parsed = FlightSearchQuery.safeParse(query);
    if (!parsed.success) {
      const map = issuesToMap(parsed.error.issues);
      if (!v.from) map.from = "Choose a departure airport";
      if (!v.to) map.to = "Choose a destination airport";
      setErrors(map);
      return;
    }
    setErrors({});
    const sp = new URLSearchParams({ from: parsed.data.from, to: parsed.data.to, depart: parsed.data.depart, adults: String(parsed.data.adults), cabin: parsed.data.cabin });
    if (parsed.data.return) sp.set("return", parsed.data.return);
    router.push("/travel/flights/search?" + sp.toString());
  };

  const err = (k: string) =>
    errors[k] ? (
      <FieldMessage id={`${id}-${k}-err`} tone="error" className="mt-1">
        {errors[k]}
      </FieldMessage>
    ) : null;

  return (
    <form onSubmit={submit} noValidate aria-label="Search flights" data-testid="flight-search-form">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="Trip type"
          value={v.trip}
          onChange={(t) => set("trip", t)}
          options={[
            { value: "round", label: "Round trip" },
            { value: "oneway", label: "One way" },
          ]}
        />
        <Select
          aria-label="Passengers"
          size="sm"
          containerClassName="w-auto"
          value={v.adults}
          onChange={(e) => set("adults", Number(e.target.value))}
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "adult" : "adults"}
            </option>
          ))}
        </Select>
        <Select aria-label="Cabin class" size="sm" containerClassName="w-auto" value={v.cabin} onChange={(e) => set("cabin", e.target.value as FlightFormValues["cabin"])}>
          <option value="economy">Economy</option>
          <option value="premium_economy">Premium economy</option>
          <option value="business">Business</option>
          <option value="first">First</option>
        </Select>
      </div>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_auto]")}>
        <div>
          <AirportInput id={`${id}-from`} label="From" kind="from" value={v.from} onChange={(x) => set("from", x)} invalid={Boolean(errors.from)} describedBy={errors.from ? `${id}-from-err` : undefined} testId="flight-from" />
          {err("from")}
        </div>
        <div>
          <AirportInput id={`${id}-to`} label="To" kind="to" value={v.to} onChange={(x) => set("to", x)} invalid={Boolean(errors.to)} describedBy={errors.to ? `${id}-to-err` : undefined} testId="flight-to" />
          {err("to")}
        </div>
        <div>
          <Label htmlFor={`${id}-depart`} className="mb-1 block text-xs font-medium text-text-muted">
            Depart
          </Label>
          <Input id={`${id}-depart`} type="date" min={minDate} className={fieldCls} value={v.depart} invalid={Boolean(errors.depart)} onChange={(e) => set("depart", e.target.value)} />
          {err("depart")}
        </div>
        <div>
          <Label htmlFor={`${id}-return`} className="mb-1 block text-xs font-medium text-text-muted">
            Return
          </Label>
          <Input
            id={`${id}-return`}
            type="date"
            min={v.depart || minDate}
            className={fieldCls}
            value={v.trip === "round" ? v.return : ""}
            disabled={v.trip === "oneway"}
            invalid={Boolean(errors.return)}
            onChange={(e) => set("return", e.target.value)}
          />
          {err("return")}
        </div>
        <div className={cn("flex items-end", compact && "sm:col-span-2")}>
          <Button type="submit" size="lg" fullWidth className="h-11 bg-travel text-travel-fg hover:bg-travel/90" data-testid="flight-search-submit">
            <Search aria-hidden />
            Search flights
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- Hotels */

export interface HotelFormValues {
  city: string;
  checkin: string;
  checkout: string;
  guests: number;
  rooms: number;
}

export function HotelSearchForm({ initial, compact = false }: { initial?: Partial<HotelFormValues>; compact?: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState<HotelFormValues>({
    city: initial?.city ?? "",
    checkin: initial?.checkin ?? "",
    checkout: initial?.checkout ?? "",
    guests: initial?.guests ?? 2,
    rooms: initial?.rooms ?? 1,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [minDate, setMinDate] = React.useState<string>();
  const id = React.useId();

  React.useEffect(() => {
    const today = new Date();
    setMinDate(toIsoDate(today));
    setV((p) => ({
      ...p,
      checkin: p.checkin || toIsoDate(addDays(today, 14)),
      checkout: p.checkout || toIsoDate(addDays(today, 17)),
    }));
  }, []);

  const set = <K extends keyof HotelFormValues>(k: K, val: HotelFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = HotelSearchQuery.safeParse(v);
    if (!parsed.success) {
      const map = issuesToMap(parsed.error.issues);
      if (map.city) map.city = "Enter a city (at least 2 letters)";
      setErrors(map);
      return;
    }
    setErrors({});
    const sp = new URLSearchParams({
      city: parsed.data.city,
      checkin: parsed.data.checkin,
      checkout: parsed.data.checkout,
      guests: String(parsed.data.guests),
      rooms: String(parsed.data.rooms),
    });
    router.push("/travel/hotels/search?" + sp.toString());
  };

  const err = (k: string) =>
    errors[k] ? (
      <FieldMessage id={`${id}-${k}-err`} tone="error" className="mt-1">
        {errors[k]}
      </FieldMessage>
    ) : null;

  return (
    <form onSubmit={submit} noValidate aria-label="Search hotels" data-testid="hotel-search-form">
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-[1.4fr_160px_160px_110px_110px_auto]")}>
        <div className={compact ? "sm:col-span-2" : undefined}>
          <Label htmlFor={`${id}-city`} className="mb-1 block text-xs font-medium text-text-muted">
            City
          </Label>
          <div className="relative">
            <BedDouble aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              id={`${id}-city`}
              className={cn(fieldCls, "pl-9")}
              placeholder="e.g. Chicago"
              value={v.city}
              invalid={Boolean(errors.city)}
              aria-describedby={errors.city ? `${id}-city-err` : undefined}
              onChange={(e) => set("city", e.target.value)}
              data-testid="hotel-city"
            />
          </div>
          {err("city")}
        </div>
        <div>
          <Label htmlFor={`${id}-in`} className="mb-1 block text-xs font-medium text-text-muted">
            Check-in
          </Label>
          <Input id={`${id}-in`} type="date" min={minDate} className={fieldCls} value={v.checkin} invalid={Boolean(errors.checkin)} onChange={(e) => set("checkin", e.target.value)} />
          {err("checkin")}
        </div>
        <div>
          <Label htmlFor={`${id}-out`} className="mb-1 block text-xs font-medium text-text-muted">
            Check-out
          </Label>
          <Input id={`${id}-out`} type="date" min={v.checkin || minDate} className={fieldCls} value={v.checkout} invalid={Boolean(errors.checkout)} onChange={(e) => set("checkout", e.target.value)} />
          {err("checkout")}
        </div>
        <div>
          <Label htmlFor={`${id}-guests`} className="mb-1 block text-xs font-medium text-text-muted">
            Guests
          </Label>
          <Select id={`${id}-guests`} className={fieldCls} value={v.guests} onChange={(e) => set("guests", Number(e.target.value))}>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-rooms`} className="mb-1 block text-xs font-medium text-text-muted">
            Rooms
          </Label>
          <Select id={`${id}-rooms`} className={fieldCls} value={v.rooms} onChange={(e) => set("rooms", Number(e.target.value))}>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className={cn("flex items-end", compact && "sm:col-span-2")}>
          <Button type="submit" size="lg" fullWidth className="h-11 bg-travel text-travel-fg hover:bg-travel/90" data-testid="hotel-search-submit">
            <Search aria-hidden />
            Search hotels
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Compact Flights | Hotels module for the homepage. */
export function TravelQuickSearch({ compact = true }: { compact?: boolean }) {
  return (
    <Tabs defaultValue="flights" className="w-full">
      <TabsList variant="segmented" aria-label="Travel search type" className="mb-3">
        <TabsTrigger value="flights">
          <Plane aria-hidden className="size-4" /> Flights
        </TabsTrigger>
        <TabsTrigger value="hotels">
          <BedDouble aria-hidden className="size-4" /> Hotels
        </TabsTrigger>
      </TabsList>
      <TabsContent value="flights" className="mt-0">
        <FlightSearchForm compact={compact} />
      </TabsContent>
      <TabsContent value="hotels" className="mt-0">
        <HotelSearchForm compact={compact} />
      </TabsContent>
    </Tabs>
  );
}
