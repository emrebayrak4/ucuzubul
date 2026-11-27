import { useMemo, useState } from "react";
import { PanResponder, Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import type { ProductHistoryResponse } from "@pricora/contracts";
import { formatDateShortUS } from "@pricora/utils";
import { haptic, money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, DemoBadge, Row } from "./ui";

const GAP_BREAK_MS = 3 * 24 * 60 * 60 * 1000;
const NEAR_MS = 2 * 24 * 60 * 60 * 1000;
const sp = tokens.spacing;
/** Fallback series colors when a store has no brand color (distinct, readable in both themes). */
const PALETTE = ["#0EA5E9", "#F97316", "#10B981", "#A855F7", "#EAB308", "#EF4444", "#14B8A6", "#6366F1"];

interface Series {
  key: string;
  label: string;
  color: string;
  demo: boolean;
  points: { x: number; y: number }[];
}

/**
 * Price history from REAL observations only: the daily lowest line plus one line per store, each toggleable.
 * Lines break across gaps > 3 days (no implied prices). Drag across the chart to read values.
 */
export function HistoryChart({ data, height = 180 }: { data: ProductHistoryResponse; height?: number }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(data.series.map((s) => s.retailer.slug)));
  const [scrubX, setScrubX] = useState<number | null>(null);

  const series = useMemo<Series[]>(() => {
    const toPts = (pts: { t: string; priceCents: number }[]) =>
      pts
        .map((p) => ({ x: new Date(p.t).getTime(), y: p.priceCents }))
        .filter((p) => Number.isFinite(p.x))
        .sort((a, b) => a.x - b.x);
    return [
      { key: "lowest", label: "Lowest", color: c.primary, demo: false, points: toPts(data.lowest) },
      ...data.series.map((s, i) => ({
        key: s.retailer.slug,
        label: s.retailer.name,
        color: s.retailer.brandColor ?? PALETTE[i % PALETTE.length]!,
        demo: s.source === "demo",
        points: toPts(s.points),
      })),
    ];
  }, [data, c.primary]);

  const visible = series.filter((s) => !hidden.has(s.key) && s.points.length > 0);
  const visibleKey = visible.map((s) => s.key).join(",");
  const all = visible.flatMap((s) => s.points);

  const geom = useMemo(() => {
    if (all.length < 2 || width === 0) return null;
    const padX = 6;
    const padTop = 10;
    const padBottom = 18;
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const sx = (x: number) => padX + ((x - minX) / spanX) * (width - padX * 2);
    const sy = (y: number) => padTop + (1 - (y - minY) / spanY) * (height - padTop - padBottom);
    const invX = (px: number) => minX + ((px - padX) / (width - padX * 2)) * spanX;
    const path = (pts: { x: number; y: number }[]) =>
      pts
        .map((p, i) => {
          const prev = pts[i - 1];
          return `${!prev || p.x - prev.x > GAP_BREAK_MS ? "M" : "L"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
        })
        .join(" ");
    return { minX, maxX, minY, maxY, sx, sy, invX, path };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `all` derives from the visible series (visibleKey)
  }, [visibleKey, series, width, height]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: (e) => {
          setScrubX(e.nativeEvent.locationX);
          haptic.toggle();
        },
        onPanResponderMove: (e) => setScrubX(e.nativeEvent.locationX),
        onPanResponderRelease: () => setScrubX(null),
        onPanResponderTerminate: () => setScrubX(null),
      }),
    [],
  );

  const readout = useMemo(() => {
    if (scrubX === null || !geom) return null;
    const t = geom.invX(scrubX);
    const rows = visible.flatMap((s) => {
      let best: { x: number; y: number } | null = null;
      for (const p of s.points) if (!best || Math.abs(p.x - t) < Math.abs(best.x - t)) best = p;
      return best && Math.abs(best.x - t) <= NEAR_MS ? [{ s, p: best }] : [];
    });
    return { t, rows };
  }, [scrubX, geom, visible]);

  const toggle = (key: string) => {
    haptic.toggle();
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const lowestSeries = series[0]!;
  const minPt = lowestSeries.points.length ? lowestSeries.points.reduce((a, b) => (b.y < a.y ? b : a)) : null;

  return (
    <View style={{ gap: sp[2] }}>
      <View style={{ minHeight: 20 }}>
        {readout ? (
          <Row gap={3} style={{ flexWrap: "wrap" }}>
            <AppText variant="caption" color="text-muted">
              {formatDateShortUS(readout.t)}
            </AppText>
            {readout.rows.map(({ s, p }) => (
              <AppText key={s.key} variant="caption" style={{ color: s.color, fontVariant: ["tabular-nums"] }}>
                {s.label} {money(p.y, data.currency)}
              </AppText>
            ))}
          </Row>
        ) : geom ? (
          <AppText variant="caption" color="text-muted">
            {money(geom.minY, data.currency)} – {money(geom.maxY, data.currency)} · drag to read prices
          </AppText>
        ) : null}
      </View>
      <View
        onLayout={onLayout}
        style={{ height }}
        {...responder.panHandlers}
        accessible
        accessibilityLabel={
          geom
            ? `Price history chart, ${visible.length} lines. Low ${money(geom.minY, data.currency)}, high ${money(geom.maxY, data.currency)}.`
            : "Price history chart"
        }
      >
        {geom ? (
          <Svg width={width} height={height}>
            {[0, 0.5, 1].map((f) => {
              const y = 10 + f * (height - 28);
              return <Line key={f} x1={0} x2={width} y1={y} y2={y} stroke={c.border} strokeWidth={1} strokeDasharray={f === 1 ? undefined : "3 4"} />;
            })}
            <SvgText x={width - 4} y={18} fontSize={10} fill={c["text-muted"]} textAnchor="end">
              {money(geom.maxY, data.currency)}
            </SvgText>
            <SvgText x={width - 4} y={height - 22} fontSize={10} fill={c["text-muted"]} textAnchor="end">
              {money(geom.minY, data.currency)}
            </SvgText>
            {visible
              .slice()
              .reverse()
              .map((s) => (
                <Path
                  key={s.key}
                  d={geom.path(s.points)}
                  stroke={s.color}
                  strokeWidth={s.key === "lowest" ? 2.5 : 1.5}
                  strokeOpacity={s.key === "lowest" ? 1 : 0.85}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            {!hidden.has("lowest") && minPt ? <Circle cx={geom.sx(minPt.x)} cy={geom.sy(minPt.y)} r={4} fill={c["price-drop"]} /> : null}
            {readout ? (
              <>
                <Line x1={scrubX ?? 0} x2={scrubX ?? 0} y1={0} y2={height - 18} stroke={c["text-muted"]} strokeWidth={1} />
                {readout.rows.map(({ s, p }) => (
                  <Circle key={s.key} cx={geom.sx(p.x)} cy={geom.sy(p.y)} r={4} fill={s.color} stroke={c.surface} strokeWidth={1.5} />
                ))}
              </>
            ) : null}
            <SvgText x={4} y={height - 4} fontSize={10} fill={c["text-muted"]}>
              {formatDateShortUS(geom.minX)}
            </SvgText>
            <SvgText x={width - 4} y={height - 4} fontSize={10} fill={c["text-muted"]} textAnchor="end">
              {formatDateShortUS(geom.maxX)}
            </SvgText>
          </Svg>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <AppText color="text-muted">{visible.length ? "Not enough price history yet." : "Turn on a line below."}</AppText>
          </View>
        )}
      </View>
      {/* Series toggles */}
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {series
          .filter((s) => s.points.length > 0)
          .map((s) => {
            const on = !hidden.has(s.key);
            return (
              <Pressable
                key={s.key}
                onPress={() => toggle(s.key)}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${s.label} line`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 32,
                  paddingHorizontal: sp[2.5],
                  borderRadius: tokens.radius.full,
                  borderWidth: 1,
                  borderColor: on ? s.color : c.border,
                  backgroundColor: on ? c.surface : c["surface-2"],
                }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: on ? s.color : c["surface-3"] }} />
                <AppText variant="caption" color={on ? "text" : "text-muted"}>
                  {s.label}
                </AppText>
              </Pressable>
            );
          })}
      </Row>
      {data.series.some((s) => s.source === "demo") ? <DemoBadge /> : null}
    </View>
  );
}
