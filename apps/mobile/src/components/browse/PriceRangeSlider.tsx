import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import type { PriceHistogramBin } from "@pricora/contracts";
import { haptic, money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Field, Row } from "../ui";

const THUMB = 28;
const sp = tokens.spacing;

/**
 * Two-thumb price slider over the result histogram (equal-width bins from the API, ignoring the price filter).
 * Built on PanResponder so it works inside the RN Modal sheet on Android without a nested gesture root.
 * Values are cents; `undefined` = open end.
 */
export function PriceRangeSlider({
  histogram,
  minBound,
  maxBound,
  value,
  onChange,
}: {
  histogram: PriceHistogramBin[];
  minBound: number;
  maxBound: number;
  value: { min?: number; max?: number };
  onChange: (v: { min?: number; max?: number }) => void;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const span = Math.max(1, maxBound - minBound);
  const lo = Math.max(minBound, Math.min(value.min ?? minBound, maxBound));
  const hi = Math.min(maxBound, Math.max(value.max ?? maxBound, minBound));
  const track = Math.max(1, width - THUMB);
  const toX = (cents: number) => ((cents - minBound) / span) * track;
  const toCents = (x: number) => {
    const raw = minBound + (Math.max(0, Math.min(track, x)) / track) * span;
    const step = span > 200_000 ? 1000 : 100; // $10 steps on wide ranges, $1 otherwise
    return Math.round(raw / step) * step;
  };

  const emit = (nextLo: number, nextHi: number) =>
    onChange({ min: nextLo <= minBound ? undefined : nextLo, max: nextHi >= maxBound ? undefined : nextHi });

  // Latest render values for the gesture handlers (synced after each render; handlers run outside render).
  const live = useRef({ lo, hi, startX: 0, toX, toCents, emit });
  useLayoutEffect(() => {
    live.current = { ...live.current, lo, hi, toX, toCents, emit };
  });

  const responders = useMemo(() => {
    const make = (which: "lo" | "hi") =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const l = live.current;
          l.startX = l.toX(which === "lo" ? l.lo : l.hi);
          haptic.toggle();
        },
        onPanResponderMove: (_, g) => {
          const l = live.current;
          const cents = l.toCents(l.startX + g.dx);
          if (which === "lo") l.emit(Math.min(cents, l.hi), l.hi);
          else l.emit(l.lo, Math.max(cents, l.lo));
        },
      });
    // eslint-disable-next-line react-hooks/refs -- handlers only read `live` inside gesture callbacks, never during render
    return { lo: make("lo"), hi: make("hi") };
  }, []);

  const maxCount = Math.max(1, ...histogram.map((b) => b.count));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const [minText, setMinText] = useState<string | null>(null);
  const [maxText, setMaxText] = useState<string | null>(null);
  const parse = (s: string) => {
    const n = Number.parseFloat(s.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
  };

  return (
    <View style={{ gap: sp[3] }}>
      <View onLayout={onLayout}>
        {/* Histogram */}
        <View style={{ height: 48, flexDirection: "row", alignItems: "flex-end", gap: 2, paddingHorizontal: THUMB / 2 }} accessible={false}>
          {histogram.map((b) => {
            const inRange = b.toCents >= lo && b.fromCents <= hi;
            return (
              <View
                key={b.fromCents}
                style={{
                  flex: 1,
                  height: Math.max(3, (b.count / maxCount) * 48),
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                  backgroundColor: inRange ? c.primary : c["surface-3"],
                  opacity: inRange ? 0.85 : 1,
                }}
              />
            );
          })}
        </View>
        {/* Track + thumbs */}
        <View style={{ height: THUMB, justifyContent: "center" }}>
          <View style={{ marginHorizontal: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: c["surface-3"] }} />
          {width > 0 ? (
            <>
              <View
                style={{
                  position: "absolute",
                  left: toX(lo) + THUMB / 2,
                  width: Math.max(0, toX(hi) - toX(lo)),
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.primary,
                }}
              />
              {(["lo", "hi"] as const).map((which) => (
                <View
                  key={which}
                  {...responders[which].panHandlers}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={which === "lo" ? "Minimum price" : "Maximum price"}
                  accessibilityValue={{ text: money(which === "lo" ? lo : hi, "USD", "auto") }}
                  accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                  onAccessibilityAction={(e) => {
                    const step = Math.max(100, Math.round(span / 20 / 100) * 100);
                    const d = e.nativeEvent.actionName === "increment" ? step : -step;
                    if (which === "lo") emit(Math.min(Math.max(minBound, lo + d), hi), hi);
                    else emit(lo, Math.max(Math.min(maxBound, hi + d), lo));
                  }}
                  style={{
                    position: "absolute",
                    left: toX(which === "lo" ? lo : hi),
                    width: THUMB,
                    height: THUMB,
                    borderRadius: THUMB / 2,
                    backgroundColor: c.surface,
                    borderWidth: 2,
                    borderColor: c.primary,
                    ...tokens.nativeShadow.sm,
                  }}
                />
              ))}
            </>
          ) : null}
        </View>
      </View>
      <Row gap={3}>
        <Field
          label="Min ($)"
          style={{ flex: 1 }}
          keyboardType="decimal-pad"
          placeholder={String(Math.floor(minBound / 100))}
          value={minText ?? (value.min !== undefined ? String(Math.round(value.min / 100)) : "")}
          onChangeText={setMinText}
          onEndEditing={() => {
            if (minText !== null) emit(parse(minText) ?? minBound, hi);
            setMinText(null);
          }}
        />
        <Field
          label="Max ($)"
          style={{ flex: 1 }}
          keyboardType="decimal-pad"
          placeholder={String(Math.ceil(maxBound / 100))}
          value={maxText ?? (value.max !== undefined ? String(Math.round(value.max / 100)) : "")}
          onChangeText={setMaxText}
          onEndEditing={() => {
            if (maxText !== null) emit(lo, parse(maxText) ?? maxBound);
            setMaxText(null);
          }}
        />
      </Row>
      <AppText variant="caption" color="text-muted">
        {money(lo, "USD", "auto")} – {money(hi, "USD", "auto")}
        {value.min === undefined && value.max === undefined ? " · any price" : ""}
      </AppText>
    </View>
  );
}
