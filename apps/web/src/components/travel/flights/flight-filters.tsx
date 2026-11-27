"use client";

import * as React from "react";
import { ALLIANCE_LABELS, type Alliance, type FlightFacets } from "@pricora/contracts";
import { Checkbox, Label, Switch, cn } from "@pricora/ui";
import { cabinLabel } from "@/lib/format";
import { clock, duration, usd } from "./format";
import { RangeSlider } from "./range-slider";

export type ParamUpdate = Record<string, string | null>;

export interface FilterState {
  stops: number[];
  airlines: string[];
  alliances: string[];
  layovers: string[];
  dep: string[];
  arr: string[];
  maxDuration: number | null;
  maxLayover: number | null;
  bags: string[];
  hideSelfTransfer: boolean;
  cabin: string;
}

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function readFilters(sp: URLSearchParams): FilterState {
  return {
    stops: list(sp.get("stops")).map(Number),
    airlines: list(sp.get("airlines")),
    alliances: list(sp.get("alliances")),
    layovers: list(sp.get("layovers")),
    dep: (sp.get("dep") ?? "").split(","),
    arr: (sp.get("arr") ?? "").split(","),
    maxDuration: sp.get("maxDuration") ? Number(sp.get("maxDuration")) : null,
    maxLayover: sp.get("maxLayover") ? Number(sp.get("maxLayover")) : null,
    bags: list(sp.get("bags")),
    hideSelfTransfer: sp.get("hideSelfTransfer") === "1",
    cabin: sp.get("cabin") ?? "economy",
  };
}

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const join = (arr: string[]) => (arr.length ? arr.join(",") : null);

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <fieldset className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <div className="mb-2 flex items-center justify-between">
        <legend className="text-sm font-semibold">{title}</legend>
        {action}
      </div>
      {children}
    </fieldset>
  );
}

function CheckRow({ id, checked, onChange, label, price, count, disabled, extra }: { id: string; checked: boolean; onChange: () => void; label: React.ReactNode; price?: number | null; count?: number; disabled?: boolean; extra?: React.ReactNode }) {
  return (
    <div className={cn("group flex items-center gap-2 py-1", disabled && "opacity-50")}>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <Label htmlFor={id} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm font-normal">
        <span className="truncate">
          {label}
          {count !== undefined ? <span className="text-xs text-text-muted"> ({count})</span> : null}
        </span>
        {price !== undefined ? <span className="price shrink-0 text-xs text-text-muted">{price !== null ? usd(price) : "—"}</span> : null}
      </Label>
      {extra}
    </div>
  );
}

/**
 * "All selected unless narrowed" list (airlines, layover airports): empty param = everything.
 */
function useNarrowList(all: string[], selected: string[]) {
  const effective = selected.length ? selected : all;
  return {
    isOn: (v: string) => effective.includes(v),
    toggled: (v: string) => {
      const next = toggle(effective, v);
      return next.length === all.length ? [] : next;
    },
  };
}

export function FlightFilters({ facets, state, onChange, legs }: { facets: FlightFacets; state: FilterState; onChange: (u: ParamUpdate) => void; legs: Array<{ from: string; to: string }> }) {
  const id = React.useId();
  const airlineCodes = facets.airlines.map((a) => a.iata);
  const airlines = useNarrowList(airlineCodes, state.airlines);
  const layCodes = facets.layoverAirports.map((a) => a.iata);
  const lays = useNarrowList(layCodes, state.layovers);
  const range = (s: string | undefined, lo: number, hi: number): [number, number] => {
    const m = /^(\d+)-(\d+)$/.exec(s ?? "");
    return m ? [Number(m[1]), Number(m[2])] : [lo, hi];
  };
  const setLegRange = (key: "dep" | "arr", leg: number, v: [number, number]) => {
    const cur = [...(key === "dep" ? state.dep : state.arr)];
    while (cur.length < legs.length) cur.push("");
    cur[leg] = v[0] <= 0 && v[1] >= 1439 ? "" : `${v[0]}-${v[1]}`;
    onChange({ [key]: cur.some(Boolean) ? cur.join(",") : null });
  };

  return (
    <div className="text-text" data-testid="flight-filters">
      <Section title="Stops">
        {facets.stops.map((s) => (
          <CheckRow
            key={s.value}
            id={`${id}-stops-${s.value}`}
            checked={state.stops.includes(s.value)}
            onChange={() => onChange({ stops: join(toggle(state.stops.map(String), String(s.value))) })}
            label={s.value === 0 ? "Nonstop" : s.value === 1 ? "1 stop" : "2+ stops"}
            price={s.minPriceCents}
            disabled={s.count === 0 && !state.stops.includes(s.value)}
          />
        ))}
      </Section>

      <Section title="Departure & arrival times">
        <div className="flex flex-col gap-4">
          {legs.map((l, i) => (
            <div key={i}>
              <p className="mb-1 text-xs font-semibold text-text-muted">
                {legs.length === 2 ? (i === 0 ? "Outbound" : "Return") : legs.length > 2 ? `Flight ${i + 1}` : "Flight"} · <span className="font-mono">{l.from}</span> → <span className="font-mono">{l.to}</span>
              </p>
              <p className="text-xs">Departure</p>
              <RangeSlider label={`Departure time ${l.from}`} min={0} max={1439} step={30} value={range(state.dep[i], 0, 1439)} onCommit={(v) => setLegRange("dep", i, v)} format={clock} testId={`dep-slider-${i}`} />
              <p className="mt-2 text-xs">Arrival</p>
              <RangeSlider label={`Arrival time ${l.to}`} min={0} max={1439} step={30} value={range(state.arr[i], 0, 1439)} onCommit={(v) => setLegRange("arr", i, v)} format={clock} />
            </div>
          ))}
        </div>
      </Section>

      {facets.duration.max > facets.duration.min ? (
        <Section title="Journey duration">
          <RangeSlider
            single
            label="Maximum journey duration"
            min={facets.duration.min}
            max={facets.duration.max}
            step={15}
            value={[facets.duration.min, Math.min(facets.duration.max, state.maxDuration ?? facets.duration.max)]}
            onCommit={([, hi]) => onChange({ maxDuration: hi >= facets.duration.max ? null : String(hi) })}
            format={duration}
            testId="duration-slider"
          />
        </Section>
      ) : null}

      {facets.airlines.length ? (
        <Section
          title="Airlines"
          action={
            <span className="flex gap-2 text-xs">
              <button type="button" className="font-semibold text-flights-action hover:underline" onClick={() => onChange({ airlines: null })}>
                Select all
              </button>
            </span>
          }
        >
          {facets.airlines.map((a) => (
            <CheckRow
              key={a.iata}
              id={`${id}-al-${a.iata}`}
              checked={airlines.isOn(a.iata)}
              onChange={() => onChange({ airlines: join(airlines.toggled(a.iata)) })}
              label={a.name}
              price={a.minPriceCents}
              extra={
                <button
                  type="button"
                  onClick={() => onChange({ airlines: a.iata })}
                  className="rounded px-1 text-xs font-semibold text-flights-action opacity-0 hover:underline focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Only ${a.name}`}
                >
                  Only
                </button>
              }
            />
          ))}
        </Section>
      ) : null}

      {facets.alliances.length ? (
        <Section title="Alliances">
          {facets.alliances.map((a) => (
            <CheckRow key={a.value} id={`${id}-all-${a.value}`} checked={state.alliances.includes(a.value)} onChange={() => onChange({ alliances: join(toggle(state.alliances, a.value)) })} label={ALLIANCE_LABELS[a.value as Alliance]} price={a.minPriceCents} />
          ))}
        </Section>
      ) : null}

      {facets.layoverAirports.length ? (
        <Section title="Connecting airports">
          <div className="max-h-56 overflow-y-auto pr-1">
            {facets.layoverAirports.map((a) => (
              <CheckRow
                key={a.iata}
                id={`${id}-lay-${a.iata}`}
                checked={lays.isOn(a.iata)}
                onChange={() => onChange({ layovers: join(lays.toggled(a.iata)) })}
                label={
                  <>
                    <span className="font-mono text-xs">{a.iata}</span> {a.city}
                  </>
                }
                price={a.minPriceCents}
              />
            ))}
          </div>
          {facets.layover.max > facets.layover.min ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-semibold">Max layover</p>
              <RangeSlider
                single
                label="Maximum layover duration"
                min={facets.layover.min}
                max={facets.layover.max}
                step={15}
                value={[facets.layover.min, Math.min(facets.layover.max, state.maxLayover ?? facets.layover.max)]}
                onCommit={([, hi]) => onChange({ maxLayover: hi >= facets.layover.max ? null : String(hi) })}
                format={duration}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title="Bags included">
        <CheckRow id={`${id}-bag-c`} checked={state.bags.includes("carry_on")} onChange={() => onChange({ bags: join(toggle(state.bags, "carry_on")) })} label="Carry-on bag" price={facets.bags.carryOn.minPriceCents} />
        <CheckRow id={`${id}-bag-k`} checked={state.bags.includes("checked")} onChange={() => onChange({ bags: join(toggle(state.bags, "checked")) })} label="Checked bag" price={facets.bags.checked.minPriceCents} />
        <p className="mt-1 text-xs text-text-muted">Prices update to the cheapest fare that includes the bags.</p>
      </Section>

      <Section title="Cabin">
        <select
          aria-label="Cabin class"
          value={state.cabin}
          onChange={(e) => onChange({ cabin: e.target.value === "economy" ? null : e.target.value })}
          className="h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm"
        >
          {Object.entries(cabinLabel).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Connections">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${id}-self`} className="text-sm font-normal">
            Hide self-transfer
            <span className="block text-xs text-text-muted">Separate tickets; re-check bags ({facets.selfTransfer.count})</span>
          </Label>
          <Switch id={`${id}-self`} checked={state.hideSelfTransfer} onCheckedChange={(c) => onChange({ hideSelfTransfer: c ? "1" : null })} />
        </div>
      </Section>
    </div>
  );
}

/** Removable chips for active filters. */
export function activeChips(state: FilterState, facets: FlightFacets, legs: Array<{ from: string; to: string }>): Array<{ key: string; label: string; clear: ParamUpdate }> {
  const chips: Array<{ key: string; label: string; clear: ParamUpdate }> = [];
  if (state.stops.length) chips.push({ key: "stops", label: state.stops.map((s) => (s === 0 ? "Nonstop" : s === 1 ? "1 stop" : "2+ stops")).join(", "), clear: { stops: null } });
  if (state.airlines.length) {
    const names = state.airlines.map((c) => facets.airlines.find((a) => a.iata === c)?.name ?? c);
    chips.push({ key: "airlines", label: names.length > 2 ? `${names.length} airlines` : names.join(", "), clear: { airlines: null } });
  }
  if (state.alliances.length) chips.push({ key: "alliances", label: state.alliances.map((a) => ALLIANCE_LABELS[a as Alliance] ?? a).join(", "), clear: { alliances: null } });
  if (state.layovers.length) chips.push({ key: "layovers", label: `Via ${state.layovers.length > 3 ? `${state.layovers.length} airports` : state.layovers.join(", ")}`, clear: { layovers: null } });
  state.dep.forEach((r, i) => {
    const m = /^(\d+)-(\d+)$/.exec(r);
    if (m) chips.push({ key: `dep${i}`, label: `${legs[i]?.from ?? ""} departs ${clock(Number(m[1]))}–${clock(Number(m[2]))}`, clear: { dep: null } });
  });
  state.arr.forEach((r, i) => {
    const m = /^(\d+)-(\d+)$/.exec(r);
    if (m) chips.push({ key: `arr${i}`, label: `${legs[i]?.to ?? ""} arrives ${clock(Number(m[1]))}–${clock(Number(m[2]))}`, clear: { arr: null } });
  });
  if (state.maxDuration) chips.push({ key: "dur", label: `Under ${duration(state.maxDuration)}`, clear: { maxDuration: null } });
  if (state.maxLayover) chips.push({ key: "lay", label: `Layover ≤ ${duration(state.maxLayover)}`, clear: { maxLayover: null } });
  if (state.bags.length) chips.push({ key: "bags", label: state.bags.map((b) => (b === "checked" ? "Checked bag" : "Carry-on")).join(" + "), clear: { bags: null } });
  if (state.hideSelfTransfer) chips.push({ key: "self", label: "No self-transfer", clear: { hideSelfTransfer: null } });
  return chips;
}
