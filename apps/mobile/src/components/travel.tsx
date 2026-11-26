import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import type { ProviderStatus } from "@pricora/contracts";
import { addDays, formatTravelDate, toIsoDate } from "@pricora/utils";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Chip, Divider, Field, PressableRow, Row } from "./ui";

const sp = tokens.spacing;

export const isoInDays = (days: number): string => toIsoDate(addDays(new Date(), days));

/** Airport input with live suggestions from /v1/travel/airports. */
export function AirportField({ label, value, onChange }: { label: string; value: string; onChange: (iata: string) => void }) {
  const { c } = useTheme();
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const q = useDebounced(text.trim(), 200);
  const airports = useQuery({
    queryKey: ["airports", q],
    queryFn: ({ signal }) => api.travel.airports(q, { signal }),
    enabled: focused && q.length >= 2,
    staleTime: 60 * 60_000,
  });
  return (
    <View style={{ gap: sp[1] }}>
      <Field
        label={label}
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (/^[A-Za-z]{3}$/.test(v.trim())) onChange(v.trim().toUpperCase());
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="City or airport code"
      />
      {focused && airports.data?.items.length ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: tokens.radius.md, backgroundColor: c.surface }}>
          {airports.data.items.slice(0, 6).map((a, i) => (
            <View key={a.iata}>
              {i ? <Divider /> : null}
              <PressableRow
                accessibilityLabel={`${a.city}, ${a.name}, ${a.iata}`}
                onPress={() => {
                  setText(`${a.iata} · ${a.city}`);
                  onChange(a.iata);
                  setFocused(false);
                }}
                style={{ paddingHorizontal: sp[3], justifyContent: "center" }}
              >
                <Row gap={3}>
                  <AppText variant="label" style={{ width: 40, fontVariant: ["tabular-nums"] }}>
                    {a.iata}
                  </AppText>
                  <AppText numberOfLines={1} style={{ flex: 1 }}>
                    {a.city} — {a.name}
                  </AppText>
                </Row>
              </PressableRow>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Date picker without a native dependency: YYYY-MM-DD field + quick offsets. */
export function DateField({
  label,
  value,
  onChange,
  quick,
  error,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  quick: { label: string; days: number }[];
  error?: string | null;
}) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={{ gap: sp[2] }}>
      <Field
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        error={error}
        hint={valid ? formatTravelDate(value) : undefined}
      />
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {quick.map((q) => (
          <Chip key={q.label} label={q.label} selected={value === isoInDays(q.days)} onPress={() => onChange(isoInDays(q.days))} />
        ))}
      </Row>
    </View>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const btn = (icon: "remove" | "add", disabled: boolean, next: number) => (
    <PressableRow
      onPress={() => !disabled && onChange(next)}
      accessibilityLabel={`${icon === "add" ? "Increase" : "Decrease"} ${label}`}
      accessibilityState={{ disabled }}
      style={{
        width: tokens.layout.minTouchTarget,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: tokens.radius.md,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={18} color={c.text} />
    </PressableRow>
  );
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <AppText variant="bodyLg">{label}</AppText>
      <Row gap={3}>
        {btn("remove", value <= min, value - 1)}
        <AppText variant="price" style={{ minWidth: 20, textAlign: "center" }} accessibilityLabel={`${value} ${label}`}>
          {value}
        </AppText>
        {btn("add", value >= max, value + 1)}
      </Row>
    </Row>
  );
}

/** Provider strip: each provider with honest connection status. */
export function ProviderStrip({ providers }: { providers: ProviderStatus[] }) {
  const { c } = useTheme();
  if (!providers.length) return null;
  return (
    <Row gap={2} style={{ flexWrap: "wrap" }}>
      {providers.map((p) => {
        const live = p.status === "live";
        return (
          <Row
            key={p.id}
            gap={1}
            style={{ paddingHorizontal: sp[2], paddingVertical: 2, borderRadius: tokens.radius.full, borderWidth: 1, borderColor: c.border }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? c.success : p.status === "error" ? c.error : c["border-strong"] }} />
            <AppText variant="caption" color="text-muted">
              {p.name} · {live ? "Connected" : p.status === "error" ? "Error" : "Not connected"}
            </AppText>
          </Row>
        );
      })}
    </Row>
  );
}
