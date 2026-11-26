import { useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { formatDateShortUS } from "@pricora/utils";
import { money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Row } from "./ui";

/** Gap (ms) above which we break the line: no implied prices between distant observations. */
const GAP_BREAK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Mini price history chart drawn from REAL points only (react-native-svg, no charting lib).
 * The line is split where observations are more than 3 days apart, so gaps stay gaps.
 */
export function PriceChart({
  points,
  currency = "USD",
  height = 140,
}: {
  points: { t: string; priceCents: number }[];
  currency?: string;
  height?: number;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const data = useMemo(
    () =>
      points
        .map((p) => ({ x: new Date(p.t).getTime(), y: p.priceCents }))
        .filter((p) => Number.isFinite(p.x))
        .sort((a, b) => a.x - b.x),
    [points],
  );

  const geom = useMemo(() => {
    if (data.length === 0 || width === 0) return null;
    const pad = 6;
    const xs = data.map((d) => d.x);
    const ys = data.map((d) => d.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const sx = (x: number) => pad + ((x - minX) / spanX) * (width - pad * 2);
    const sy = (y: number) => pad + (1 - (y - minY) / spanY) * (height - pad * 2);
    let d = "";
    data.forEach((p, i) => {
      const prev = data[i - 1];
      const cmd = !prev || p.x - prev.x > GAP_BREAK_MS ? "M" : "L";
      d += `${cmd}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)} `;
    });
    const minPoint = data.reduce((a, b) => (b.y < a.y ? b : a));
    const last = data[data.length - 1]!;
    return { d, minY, maxY, minX, maxX, sx, sy, minPoint, last };
  }, [data, width, height]);

  if (data.length < 2) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <AppText color="text-muted">Not enough price history yet.</AppText>
      </View>
    );
  }

  return (
    <View>
      <View
        onLayout={onLayout}
        style={{ height }}
        accessible
        accessibilityLabel={
          geom
            ? `Price history chart. Low ${money(geom.minY, currency)}, high ${money(geom.maxY, currency)}, ${data.length} observations.`
            : "Price history chart"
        }
      >
        {geom ? (
          <Svg width={width} height={height}>
            <Line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke={c.border} strokeWidth={1} />
            <Path d={geom.d} stroke={c.primary} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={geom.sx(geom.minPoint.x)} cy={geom.sy(geom.minPoint.y)} r={4} fill={c["price-drop"]} />
            <Circle cx={geom.sx(geom.last.x)} cy={geom.sy(geom.last.y)} r={4} fill={c.primary} />
          </Svg>
        ) : null}
      </View>
      {geom ? (
        <Row style={{ justifyContent: "space-between", marginTop: tokens.spacing[1] }}>
          <AppText variant="caption" color="text-muted">
            {formatDateShortUS(geom.minX)}
          </AppText>
          <AppText variant="caption" color="price-drop">
            Low {money(geom.minY, currency)}
          </AppText>
          <AppText variant="caption" color="text-muted">
            {formatDateShortUS(geom.maxX)}
          </AppText>
        </Row>
      ) : null}
    </View>
  );
}
