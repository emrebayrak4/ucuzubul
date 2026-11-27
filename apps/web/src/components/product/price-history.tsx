"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { LineChart as LineChartIcon } from "lucide-react";
import type { ConditionGroup, HistoryRange, PriceStats } from "@pricora/contracts";
import { DemoDataBadge, EmptyState, ErrorState, Skeleton, Stat, formatPrice } from "@pricora/ui";
import { api } from "@/lib/api-browser";
import { Segmented } from "@/components/segmented";

const ranges: Array<{ value: HistoryRange; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "180d", label: "180d" },
  { value: "365d", label: "1y" },
  { value: "all", label: "All" },
];

const DAY = 86_400_000;

/** Insert a null after a gap so the line is NOT drawn across days with no observations (no interpolation). */
function withGaps(points: Array<{ t: string; priceCents: number }>): Array<[number, number | null]> {
  const out: Array<[number, number | null]> = [];
  const times = points.map((p) => new Date(p.t).getTime());
  const intervals = times.slice(1).map((t, i) => t - times[i]!).sort((a, b) => a - b);
  const median = intervals.length ? intervals[Math.floor(intervals.length / 2)]! : DAY;
  const threshold = Math.max(2.5 * DAY, 3 * median);
  points.forEach((p, i) => {
    const t = times[i]!;
    if (i > 0 && t - times[i - 1]! > threshold) out.push([times[i - 1]! + 1, null]);
    out.push([t, p.priceCents]);
  });
  return out;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

interface Line {
  id: string;
  name: string;
  color: string | null;
  data: Array<[number, number | null]>;
  primary?: boolean;
}

const FALLBACK_COLORS = ["#E8590C", "#0CA678", "#7048E8", "#1C7ED6", "#D6336C", "#F59F00", "#495057"];

function Chart({ lines, currency }: { lines: Line[]; currency: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let disposed = false;
    let chart: { dispose: () => void; resize: () => void } | null = null;
    let ro: ResizeObserver | null = null;
    import("./echarts-setup")
      .then(({ echarts }) => {
        if (disposed || !ref.current) return;
        const primary = cssVar("--pc-color-primary", "#104C3B");
        const muted = cssVar("--pc-color-text-muted", "#5F6763");
        const border = cssVar("--pc-color-border", "#E5E8E5");
        const surface = cssVar("--pc-color-surface", "#FFFFFF");
        const text = cssVar("--pc-color-text", "#141816");
        const c = echarts.init(ref.current, undefined, { renderer: "canvas" });
        chart = c;
        const realCount = lines.reduce((n, l) => n + l.data.filter((d) => d[1] !== null).length, 0);
        c.setOption({
          animation: false,
          grid: { left: 64, right: 16, top: 16, bottom: 28 },
          tooltip: {
            trigger: "axis",
            backgroundColor: surface,
            borderColor: border,
            textStyle: { color: text, fontSize: 12 },
            valueFormatter: (v: unknown) => (typeof v === "number" ? formatPrice(v, { currency }) : "No data"),
          },
          xAxis: {
            type: "time",
            axisLine: { lineStyle: { color: border } },
            axisLabel: { color: muted, fontSize: 11, hideOverlap: true },
            splitLine: { show: false },
          },
          yAxis: {
            type: "value",
            scale: true,
            axisLabel: { color: muted, fontSize: 11, formatter: (v: number) => formatPrice(v, { currency, trimZeroCents: true }) },
            splitLine: { lineStyle: { color: border } },
          },
          series: lines.map((l, i) => {
            const color = l.primary ? primary : l.color && l.color.toUpperCase() !== "#000000" && l.color.toUpperCase() !== "#111111" ? l.color : FALLBACK_COLORS[i % FALLBACK_COLORS.length];
            return {
              name: l.name,
              type: "line",
              step: l.primary ? false : "end",
              smooth: false,
              connectNulls: false,
              showSymbol: l.primary && realCount <= 40,
              symbolSize: 5,
              z: l.primary ? 3 : 2,
              lineStyle: { color, width: l.primary ? 2.5 : 1.5, opacity: l.primary ? 1 : 0.85 },
              itemStyle: { color },
              data: l.data,
            };
          }),
        });
        ro = new ResizeObserver(() => c.resize());
        ro.observe(ref.current);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.dispose();
    };
  }, [lines, currency, resolvedTheme]);

  if (failed) return <p className="py-10 text-center text-sm text-text-muted">Chart failed to load.</p>;
  return <div ref={ref} className="h-72 w-full" role="img" aria-label={`Price history chart: ${lines.map((l) => l.name).join(", ")}`} />;
}

function StatsRow({ stats, currency }: { stats: PriceStats; currency: string }) {
  const fmt = (c: number | null) => (c === null ? "—" : formatPrice(c, { currency }));
  const vsMedian =
    stats.currentLowestCents !== null && stats.median90Cents !== null && stats.median90Cents > 0
      ? (stats.currentLowestCents - stats.median90Cents) / stats.median90Cents
      : null;
  return (
    <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
      <Stat label="Lowest ever" value={fmt(stats.allTimeLowCents)} hint={stats.allTimeLowAt ? new Date(stats.allTimeLowAt).toLocaleDateString("en-US") : undefined} />
      <Stat label="90-day median" value={fmt(stats.median90Cents)} />
      <Stat label="90-day average" value={fmt(stats.avg90Cents)} />
      <Stat
        label="Current vs median"
        value={vsMedian === null ? "—" : `${vsMedian > 0 ? "+" : ""}${Math.round(vsMedian * 100)}%`}
        hint={`${stats.sampleSize} observations`}
      />
    </div>
  );
}

export function PriceHistory({
  slug,
  initialStats,
  currency = "USD",
  hasDemoData,
  defaultCondition = "new",
  conditions = [],
}: {
  slug: string;
  initialStats: PriceStats;
  currency?: string;
  hasDemoData: boolean;
  defaultCondition?: ConditionGroup;
  conditions?: ConditionGroup[];
}) {
  const [range, setRange] = React.useState<HistoryRange>("90d");
  // One condition per chart — used / refurbished prices never enter the new-price history or "lowest ever".
  const [condition, setCondition] = React.useState<ConditionGroup>(defaultCondition);
  const q = useQuery({
    queryKey: ["history", slug, range, condition],
    queryFn: ({ signal }) => api.catalog.productHistory(slug, { range, condition }, { signal }),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const [hidden, setHidden] = React.useState<Set<string> | null>(null);
  const series = q.data?.series ?? [];
  // Default: lowest line + up to 4 stores visible; the rest can be toggled on.
  const off = hidden ?? new Set(series.slice(4).map((s) => s.offerId));
  const offKey = [...off].sort().join(",");
  const lines: Line[] = React.useMemo(() => {
    if (!q.data) return [];
    const offSet = new Set(offKey.split(",").filter(Boolean));
    const out: Line[] = [];
    if (!offSet.has("lowest")) out.push({ id: "lowest", name: "Lowest price", color: null, data: withGaps(q.data.lowest), primary: true });
    for (const s of q.data.series) if (!offSet.has(s.offerId) && s.points.length) out.push({ id: s.offerId, name: s.retailer.name, color: s.retailer.brandColor, data: withGaps(s.points) });
    return out;
  }, [q.data, offKey]);
  const toggle = (id: string) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
  };
  const realCount = q.data?.lowest.length ?? 0;
  const anyDemo = hasDemoData || Boolean(q.data?.series.some((s) => s.source === "demo"));

  return (
    <section aria-labelledby="history-title" className="rounded-lg border border-border bg-surface p-4" data-testid="price-history">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 id="history-title" className="text-xl font-semibold tracking-tight">
            Price history
          </h2>
          {anyDemo ? <DemoDataBadge size="sm" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conditions.length > 1 ? (
            <Segmented
              label="Condition"
              value={condition}
              onChange={(v) => setCondition(v)}
              options={conditions.map((c) => ({ value: c, label: c === "new" ? "New" : c === "open_box" ? "Open box" : c === "refurbished" ? "Refurbished" : "Used" }))}
              itemClassName="px-2.5"
            />
          ) : null}
          <Segmented label="History range" value={range} onChange={setRange} options={ranges} itemClassName="price px-2.5" />
        </div>
      </div>
      <p className="mb-2 text-xs text-text-muted">Daily lowest price across stores, plus each store&apos;s own price. Only real observations are plotted — gaps mean no data, never an estimate.</p>
      {series.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Show price lines" data-testid="history-store-toggles">
          {[{ id: "lowest", name: "Lowest", color: null as string | null }, ...series.map((s) => ({ id: s.offerId, name: s.retailer.name, color: s.retailer.brandColor }))].map((l, i) => {
            const on = !off.has(l.id);
            const color = l.id === "lowest" ? "var(--pc-color-primary)" : l.color && !/^#(000000|111111)$/i.test(l.color) ? l.color : FALLBACK_COLORS[(i - 1) % FALLBACK_COLORS.length];
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(l.id)}
                className={"inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium " + (on ? "border-text/20 bg-surface" : "border-border bg-surface-2 text-text-muted line-through")}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: on ? color : "transparent", border: `2px solid ${color}` }} />
                {l.name}
              </button>
            );
          })}
        </div>
      ) : null}
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        <ErrorState title="Price history unavailable" description="We couldn't load the price history right now." onRetry={() => void q.refetch()} />
      ) : realCount < 2 ? (
        <EmptyState size="sm" icon={<LineChartIcon aria-hidden />} title="Not enough history yet" description="We need at least two observations in this range to draw a chart. Try a longer range." />
      ) : (
        <Chart lines={lines} currency={q.data?.currency ?? currency} />
      )}
      <div className="mt-4">
        <StatsRow stats={q.data?.stats ?? initialStats} currency={currency} />
      </div>
    </section>
  );
}
