"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, TrendingDown } from "lucide-react";
import type { CabinClass, FlightCalendarResponse } from "@pricora/contracts";
import { DemoDataBadge, Skeleton, cn } from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { shortDate, usd } from "./format";

type Props = { from: string; to: string; depart: string; ret: string | null; cabin: CabinClass };

const md = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const wd = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

/** Green = cheapest third, amber = middle, neutral = priciest (relative to the visible cells). */
function tone(p: number | null, lo: number, hi: number): string {
  if (p === null) return "text-text-muted";
  const t = hi === lo ? 0 : (p - lo) / (hi - lo);
  return t <= 0.33 ? "bg-success-soft text-success" : t <= 0.66 ? "bg-warning-soft text-warning" : "bg-surface-2 text-text";
}

function useNavigateDates() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (depart: string, ret: string | null) => {
    const next = new URLSearchParams(sp.toString());
    next.set("depart", depart);
    if (ret) next.set("return", ret);
    next.delete("limit");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

function RoundTripGrid({ data, depart, ret }: { data: FlightCalendarResponse; depart: string; ret: string }) {
  const go = useNavigateDates();
  const grid = data.grid ?? [];
  const departs = [...new Set(grid.map((g) => g.depart))];
  const returns = [...new Set(grid.map((g) => g.return))];
  const prices = grid.map((g) => g.minPriceCents).filter((p): p is number => p !== null);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const cell = (d: string, r: string) => grid.find((g) => g.depart === d && g.return === r);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-center text-xs" data-testid="calendar-grid">
        <caption className="sr-only">Round-trip prices: rows are departure dates, columns are return dates</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left text-2xs font-medium text-text-muted">
              Depart ↓ / Return →
            </th>
            {returns.map((r) => (
              <th key={r} scope="col" className={cn("font-medium", r === ret && "text-flights-action")}>
                {wd(r)}
                <br />
                {md(r)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {departs.map((d) => (
            <tr key={d}>
              <th scope="row" className={cn("whitespace-nowrap text-left font-medium", d === depart && "text-flights-action")}>
                {wd(d)} {md(d)}
              </th>
              {returns.map((r) => {
                const c = cell(d, r);
                const p = c?.minPriceCents ?? null;
                const sel = d === depart && r === ret;
                return (
                  <td key={r}>
                    {p === null ? (
                      <span className="block py-2 text-text-muted">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => go(d, r)}
                        aria-label={`Depart ${shortDate(d)}, return ${shortDate(r)}: ${usd(p)}`}
                        aria-current={sel ? "date" : undefined}
                        className={cn("price block w-full rounded-md py-2 font-semibold hover:ring-2 hover:ring-flights-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tone(p, lo, hi), sel && "ring-2 ring-flights")}
                      >
                        {usd(p)}
                        {p === lo ? <span className="block text-2xs font-medium">Lowest</span> : null}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthGrid({ data, depart, month, setMonth }: { data: FlightCalendarResponse; depart: string; month: string; setMonth: (m: string) => void }) {
  const go = useNavigateDates();
  const days = data.days ?? [];
  const prices = days.map((d) => d.minPriceCents).filter((p): p is number => p !== null);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const shift = (n: number) => {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div data-testid="calendar-month">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} aria-label="Previous month" className="rounded-md p-1 hover:bg-surface-2 disabled:opacity-30">
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <p className="text-sm font-semibold">{new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-md p-1 hover:bg-surface-2">
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-2xs font-medium text-text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((d) => {
          const sel = d.date === depart;
          return d.minPriceCents === null ? (
            <span key={d.date} className="rounded-md py-1.5 text-text-muted">
              {Number(d.date.slice(8))}
              <span className="block text-2xs">—</span>
            </span>
          ) : (
            <button
              key={d.date}
              type="button"
              onClick={() => go(d.date, null)}
              aria-label={`${shortDate(d.date)}: ${usd(d.minPriceCents)}`}
              aria-current={sel ? "date" : undefined}
              className={cn("rounded-md py-1.5 hover:ring-2 hover:ring-flights-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tone(d.minPriceCents, lo, hi), sel && "ring-2 ring-flights")}
            >
              <span className="font-medium">{Number(d.date.slice(8))}</span>
              <span className="price block text-2xs font-semibold">{usd(d.minPriceCents)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mini price-trend chart: cheapest fare per departure day around the chosen date. */
export function PriceTrend({ trend, depart }: { trend: FlightCalendarResponse["trend"]; depart: string }) {
  const pts = trend.filter((t) => t.minPriceCents !== null) as Array<{ date: string; minPriceCents: number }>;
  if (pts.length < 2) return <p className="text-sm text-text-muted">Not enough data for a trend.</p>;
  const W = 600;
  const H = 120;
  const P = 8;
  const lo = Math.min(...pts.map((p) => p.minPriceCents));
  const hi = Math.max(...pts.map((p) => p.minPriceCents));
  const x = (i: number) => P + (i / (trend.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / Math.max(1, hi - lo)) * (H - 2 * P);
  const idx = (d: string) => trend.findIndex((t) => t.date === d);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(idx(p.date)).toFixed(1)},${y(p.minPriceCents).toFixed(1)}`).join(" ");
  const sel = trend[idx(depart)];
  const cheapest = pts.reduce((m, p) => (p.minPriceCents < m.minPriceCents ? p : m));
  return (
    <figure data-testid="price-trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label={`Cheapest fare by departure date: from ${usd(lo)} to ${usd(hi)}. Lowest on ${shortDate(cheapest.date)}.`}>
        <path d={`${path} L${x(trend.length - 1)},${H} L${x(0)},${H} Z`} className="fill-flights-soft" />
        <path d={path} className="fill-none stroke-flights-action" strokeWidth={2} strokeLinejoin="round" />
        {sel?.minPriceCents ? (
          <>
            <line x1={x(idx(depart))} x2={x(idx(depart))} y1={0} y2={H} className="stroke-flights" strokeDasharray="3 3" />
            <circle cx={x(idx(depart))} cy={y(sel.minPriceCents)} r={4} className="fill-flights stroke-surface" strokeWidth={2} />
          </>
        ) : null}
        <circle cx={x(idx(cheapest.date))} cy={y(cheapest.minPriceCents)} r={4} className="fill-success stroke-surface" strokeWidth={2} />
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-text-muted">
        <span>{md(trend[0]!.date)}</span>
        <span>
          Your date: <span className="price font-semibold text-text">{sel?.minPriceCents ? usd(sel.minPriceCents) : "—"}</span> · Lowest:{" "}
          <span className="price font-semibold text-success">{usd(cheapest.minPriceCents)}</span> on {shortDate(cheapest.date)}
        </span>
        <span>{md(trend[trend.length - 1]!.date)}</span>
      </figcaption>
    </figure>
  );
}

export function FlexibleDates({ from, to, depart, ret, cabin }: Props) {
  const [tab, setTab] = React.useState<"calendar" | "trend">("calendar");
  const [month, setMonth] = React.useState(depart.slice(0, 7));
  React.useEffect(() => setMonth(depart.slice(0, 7)), [depart]);
  const q = useQuery({
    queryKey: ["flight-calendar", from, to, depart, ret, cabin, ret ? null : month],
    queryFn: ({ signal }) => api.travel.flightCalendar({ from, to, depart, ...(ret ? { return: ret } : { month }), cabin }, { signal }),
    staleTime: 5 * 60_000,
  });
  const d = q.data;
  if (d && d.source === "none") return null;
  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-label="Flexible dates" data-testid="flexible-dates">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Flexible dates view" className="inline-flex rounded-md bg-surface-2 p-0.5 text-sm">
          {(
            [
              ["calendar", ret ? "±3 days" : "Month view", CalendarDays],
              ["trend", "Price trend", TrendingDown],
            ] as const
          ).map(([v, label, Icon]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1 font-medium", tab === v ? "bg-surface shadow-xs" : "text-text-muted hover:text-text")}>
              <Icon aria-hidden className="size-4" /> {label}
            </button>
          ))}
        </div>
        {d?.source === "demo" ? <DemoDataBadge size="sm" label="Demo fares" /> : null}
      </div>
      {q.isLoading || !d ? (
        q.isError ? (
          <p className="text-sm text-text-muted">Flexible-date prices are unavailable right now.</p>
        ) : (
          <Skeleton className="h-40 w-full" />
        )
      ) : tab === "trend" ? (
        <PriceTrend trend={d.trend} depart={depart} />
      ) : ret ? (
        <RoundTripGrid data={d} depart={depart} ret={ret} />
      ) : (
        <MonthGrid data={d} depart={depart} month={month} setMonth={setMonth} />
      )}
      <p className="mt-2 text-2xs text-text-muted">Cheapest fare per adult{ret ? " for the round trip" : ""}. {d?.source === "demo" ? "Demo fares — generated samples, not live quotes." : ""}</p>
    </section>
  );
}
