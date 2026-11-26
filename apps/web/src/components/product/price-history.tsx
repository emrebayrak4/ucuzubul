"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { LineChart as LineChartIcon } from "lucide-react";
import type { HistoryRange, PriceStats } from "@pricora/contracts";
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

function Chart({ data, currency }: { data: Array<[number, number | null]>; currency: string }) {
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
        const real = data.filter((d) => d[1] !== null);
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
          series: [
            {
              name: "Lowest price",
              type: "line",
              step: false,
              smooth: false,
              connectNulls: false,
              showSymbol: real.length <= 40,
              symbolSize: 5,
              lineStyle: { color: primary, width: 2 },
              itemStyle: { color: primary },
              data,
            },
          ],
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
  }, [data, currency, resolvedTheme]);

  if (failed) return <p className="py-10 text-center text-sm text-text-muted">Chart failed to load.</p>;
  return <div ref={ref} className="h-64 w-full" role="img" aria-label={`Price history chart with ${data.filter((d) => d[1] !== null).length} real observations`} />;
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

export function PriceHistory({ slug, initialStats, currency = "USD", hasDemoData }: { slug: string; initialStats: PriceStats; currency?: string; hasDemoData: boolean }) {
  const [range, setRange] = React.useState<HistoryRange>("90d");
  const q = useQuery({
    queryKey: ["history", slug, range],
    queryFn: ({ signal }) => api.catalog.productHistory(slug, { range }, { signal }),
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const data = React.useMemo(() => (q.data ? withGaps(q.data.lowest) : []), [q.data]);
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
        <Segmented label="History range" value={range} onChange={setRange} options={ranges} itemClassName="price px-2.5" />
      </div>
      <p className="mb-2 text-xs text-text-muted">Daily lowest price across stores. Only real observations are plotted — gaps mean no data, never an estimate.</p>
      {q.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError ? (
        <ErrorState title="Price history unavailable" description="We couldn't load the price history right now." onRetry={() => void q.refetch()} />
      ) : realCount < 2 ? (
        <EmptyState size="sm" icon={<LineChartIcon aria-hidden />} title="Not enough history yet" description="We need at least two observations in this range to draw a chart. Try a longer range." />
      ) : (
        <Chart data={data} currency={q.data?.currency ?? currency} />
      )}
      <div className="mt-4">
        <StatsRow stats={q.data?.stats ?? initialStats} currency={currency} />
      </div>
    </section>
  );
}
