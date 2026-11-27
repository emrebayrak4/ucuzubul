"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlaneTakeoff, Search } from "lucide-react";
import { Checkbox, Label } from "@pricora/ui";
import type { Place } from "@/lib/places";
import { DateRangePicker, iso } from "../date-range-picker";
import { PlaceInput } from "../place-input";

export interface ExploreValues {
  from: string;
  depart: string;
  tripLength: number;
  maxPrice: string;
  direct: boolean;
}

/** Origin + when + budget + trip length + direct-only for "Explore everywhere". */
export function ExploreFilters({ initial }: { initial: ExploreValues }) {
  const router = useRouter();
  const id = React.useId();
  const [from, setFrom] = React.useState<Place | null>(initial.from ? { id: `airport-${initial.from}`, type: "airport", name: initial.from, code: initial.from, detail: "", label: initial.from, city: null } : null);
  const [depart, setDepart] = React.useState<string | null>(initial.depart || null);
  const [tripLength, setTripLength] = React.useState(initial.tripLength);
  const [maxPrice, setMaxPrice] = React.useState(initial.maxPrice);
  const [direct, setDirect] = React.useState(initial.direct);
  const [error, setError] = React.useState<string | null>(null);
  const [min, setMin] = React.useState("2000-01-01");
  React.useEffect(() => setMin(iso(new Date())), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from?.code) return setError("Choose a city or airport to fly from.");
    setError(null);
    const sp = new URLSearchParams({ from: from.code, tripLength: String(tripLength) });
    if (depart) sp.set("depart", depart);
    if (maxPrice) sp.set("maxPrice", maxPrice);
    if (direct) sp.set("direct", "1");
    router.push(`/travel/flights/explore?${sp.toString()}`);
  };
  const select = "h-14 w-full rounded-lg bg-surface px-3 text-sm font-medium text-text";
  return (
    <form onSubmit={submit} noValidate aria-label="Explore destinations" data-testid="explore-form">
      <div className="grid gap-2 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
        <div className="rounded-lg bg-surface text-text">
          <PlaceInput id={`${id}-from`} label="From" placeholder="City or airport" value={from} onChange={setFrom} types={["city", "airport"]} recentKey="flight-from" icon={PlaneTakeoff} testId="explore-from" invalid={Boolean(error)} />
        </div>
        <div className="rounded-lg bg-surface text-text">
          <DateRangePicker id={`${id}-d`} mode="single" startLabel="Depart (optional)" value={{ start: depart, end: null }} onChange={(r) => setDepart(r.start)} min={min} />
        </div>
        <label className="sr-only" htmlFor={`${id}-len`}>
          Trip length
        </label>
        <select id={`${id}-len`} value={tripLength} onChange={(e) => setTripLength(Number(e.target.value))} className={select}>
          <option value={0}>One way</option>
          <option value={3}>Weekend (3 nights)</option>
          <option value={5}>5 nights</option>
          <option value={7}>1 week</option>
          <option value={10}>10 nights</option>
          <option value={14}>2 weeks</option>
        </select>
        <label className="sr-only" htmlFor={`${id}-budget`}>
          Budget
        </label>
        <select id={`${id}-budget`} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className={select}>
          <option value="">Any budget</option>
          <option value="150">Under $150</option>
          <option value="300">Under $300</option>
          <option value="500">Under $500</option>
          <option value="800">Under $800</option>
          <option value="1200">Under $1,200</option>
        </select>
        <button type="submit" className="inline-flex h-14 items-center justify-center gap-2 rounded-lg bg-flights-action px-8 font-bold text-flights-action-fg hover:bg-flights-action/90" data-testid="explore-submit">
          <Search aria-hidden className="size-5" /> Explore
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Checkbox id={`${id}-direct`} checked={direct} onCheckedChange={(c) => setDirect(c === true)} className="border-current" />
        <Label htmlFor={`${id}-direct`} className="text-sm font-medium text-current">
          Direct flights only
        </Label>
      </div>
      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-error-soft px-3 py-2 text-sm font-medium text-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
