import Ionicons from "@expo/vector-icons/Ionicons";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { FacetBucket, SearchFacets, SearchSort } from "@pricora/contracts";
import { api } from "@/lib/api";
import { CONDITION_GROUPS, DISCOUNTS, EMPTY_FILTERS, effectiveConditions, toggleCondition, toQuery, type BrowseFilters, type BrowseScope } from "@/lib/browse";
import { conditionGroupLabel } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";
import { StoreMark } from "../common";
import { Sheet } from "../Sheet";
import { AppText, Chip, Divider, Field, Row } from "../ui";
import { PriceRangeSlider } from "./PriceRangeSlider";

const sp = tokens.spacing;

function Section({ title, children, initiallyOpen = true, badge }: { title: string; children: ReactNode; initiallyOpen?: boolean; badge?: number }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}
      >
        <Row gap={2}>
          <AppText variant="h4">{title}</AppText>
          {badge ? (
            <View style={{ backgroundColor: c.primary, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, alignItems: "center" }}>
              <AppText variant="caption" style={{ color: c["primary-fg"] }}>
                {badge}
              </AppText>
            </View>
          ) : null}
        </Row>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c["text-muted"]} />
      </Pressable>
      {open ? <View style={{ gap: sp[2], paddingBottom: sp[2] }}>{children}</View> : null}
    </View>
  );
}

/** Checkbox row with count; zero-count rows are disabled unless selected. */
function CheckRow({
  label,
  count,
  selected,
  onPress,
  left,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
  left?: ReactNode;
}) {
  const { c } = useTheme();
  const disabled = count === 0 && !selected;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={count !== undefined ? `${label}, ${count} results` : label}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: sp[3], minHeight: 44, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}
    >
      <Ionicons name={selected ? "checkbox" : "square-outline"} size={22} color={selected ? c.primary : c["text-muted"]} />
      {left}
      <AppText style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </AppText>
      {count !== undefined ? (
        <AppText variant="caption" color="text-muted" style={{ fontVariant: ["tabular-nums"] }}>
          {count}
        </AppText>
      ) : null}
    </Pressable>
  );
}

function MultiSelect({
  buckets,
  selected,
  onToggle,
  withLogos,
}: {
  buckets: FacetBucket[];
  selected: string[];
  onToggle: (v: string) => void;
  withLogos?: boolean;
}) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const filtered = q ? buckets.filter((b) => b.label.toLowerCase().includes(q.toLowerCase())) : buckets;
  // Selected first, then by count.
  const sorted = [...filtered].sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)) || b.count - a.count);
  const shown = all || q ? sorted : sorted.slice(0, 8);
  return (
    <View>
      {buckets.length > 10 ? <Field placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} style={{ marginBottom: sp[1] }} /> : null}
      {shown.map((b) => (
        <CheckRow
          key={b.value}
          label={b.label}
          count={b.count}
          selected={selected.includes(b.value)}
          onPress={() => onToggle(b.value)}
          left={withLogos ? <StoreMark name={b.label} logoUrl={b.logoUrl} brandColor={b.color} size={24} /> : undefined}
        />
      ))}
      {!q && sorted.length > 8 ? (
        <Chip label={all ? "Show fewer" : `Show all ${sorted.length}`} onPress={() => setAll((v) => !v)} />
      ) : null}
    </View>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function FilterSheet({
  visible,
  onClose,
  facets,
  scope,
  sort,
  value,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  facets: SearchFacets | undefined;
  scope: BrowseScope;
  sort: SearchSort;
  value: BrowseFilters;
  onApply: (f: BrowseFilters) => void;
}) {
  const [draft, setDraft] = useState<BrowseFilters>(value);
  // Reset the draft to the applied filters each time the sheet opens (adjust state during render).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  // Live result count for the draft (pageSize 1), so the button says what you'll get.
  const debounced = useDebounced(draft, 250);
  const count = useQuery({
    queryKey: ["search", "count", scope, debounced],
    queryFn: ({ signal }) => api.search.search({ ...toQuery(scope, debounced, sort, 1), page: 1 }, { signal }),
    enabled: visible,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  // Facet counts follow the draft when available.
  const f = count.data?.facets ?? facets;
  const total = count.data?.total;

  const priceMin = f?.price.histogram[0]?.fromCents ?? f?.price.minCents ?? 0;
  const priceMax = f?.price.histogram[f.price.histogram.length - 1]?.toCents ?? f?.price.maxCents ?? 0;

  // Brands / stores fixed by the screen scope are not offered as filters.
  const brands = (f?.brands ?? []).filter((b) => b.value !== scope.brand);
  const retailers = (f?.retailers ?? []).filter((b) => b.value !== scope.retailer);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      secondary={{ label: "Clear all", onPress: () => setDraft(EMPTY_FILTERS) }}
      primary={{
        label: total === undefined ? "Show results" : total === 0 ? "No results" : `Show ${total.toLocaleString("en-US")} results`,
        loading: count.isFetching && total === undefined,
        disabled: total === 0,
        onPress: () => {
          onApply(draft);
          onClose();
        },
      }}
    >
      {!scope.category && (f?.categories.length ?? 0) > 1 ? (
        <>
          <Section title="Category" badge={draft.category ? 1 : undefined} initiallyOpen={!!draft.category}>
            {f!.categories.slice(0, 20).map((b) => (
              <CheckRow
                key={b.value}
                label={b.label}
                count={b.count}
                selected={draft.category === b.value}
                onPress={() => setDraft((d) => ({ ...d, category: d.category === b.value ? undefined : b.value }))}
              />
            ))}
          </Section>
          <Divider />
        </>
      ) : null}
      {priceMax > priceMin ? (
        <Section title="Price" badge={draft.minPrice !== undefined || draft.maxPrice !== undefined ? 1 : undefined}>
          <PriceRangeSlider
            histogram={f?.price.histogram ?? []}
            minBound={priceMin}
            maxBound={priceMax}
            value={{ min: draft.minPrice, max: draft.maxPrice }}
            onChange={(v) => setDraft((d) => ({ ...d, minPrice: v.min, maxPrice: v.max }))}
          />
        </Section>
      ) : null}
      <Divider />

      <Section title="Deals & availability">
        <CheckRow
          label="In stock"
          count={f?.inStockCount}
          selected={draft.inStock}
          onPress={() => setDraft((d) => ({ ...d, inStock: !d.inStock }))}
        />
        <CheckRow
          label="Free shipping"
          count={f?.freeShippingCount}
          selected={draft.freeShipping}
          onPress={() => setDraft((d) => ({ ...d, freeShipping: !d.freeShipping }))}
        />
        {scope.zip ? (
          <CheckRow
            label={`Available near me (${scope.zip})`}
            count={f?.nearbyCount ?? undefined}
            selected={draft.near}
            onPress={() => setDraft((d) => ({ ...d, near: !d.near }))}
          />
        ) : (
          <AppText variant="caption" color="text-muted">
            Set your ZIP (Account → ZIP) to see products available at stores near you.
          </AppText>
        )}
        <CheckRow
          label="Pay over time available"
          count={f?.payOverTimeCount}
          selected={draft.payOverTime}
          onPress={() => setDraft((d) => ({ ...d, payOverTime: !d.payOverTime }))}
        />
        <AppText variant="caption" color="text-muted">
          Stores offering pay in 4 or financing at checkout. Subject to approval.
        </AppText>
        <AppText variant="label" style={{ marginTop: sp[1] }}>
          Below its 30-day typical price
        </AppText>
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {DISCOUNTS.map((dsc) => (
            <Chip
              key={dsc}
              label={`${Math.round(dsc * 100)}%+ off`}
              selected={draft.minDiscount === dsc}
              onPress={() => setDraft((d) => ({ ...d, minDiscount: d.minDiscount === dsc ? undefined : dsc }))}
            />
          ))}
        </Row>
      </Section>
      <Divider />

      <Section title="Condition" badge={draft.condition.length ? 1 : undefined}>
        {CONDITION_GROUPS.map((g) => {
          const b = f?.conditions.find((x) => x.value === g);
          const on = effectiveConditions(draft.condition).includes(g);
          return (
            <CheckRow
              key={g}
              label={b?.label ?? conditionGroupLabel[g]}
              count={b?.count}
              selected={on}
              onPress={() => setDraft((d) => ({ ...d, condition: toggleCondition(d.condition, g) }))}
            />
          );
        })}
        <Chip
          label="Any condition"
          selected={draft.condition.includes("all")}
          onPress={() => setDraft((d) => ({ ...d, condition: d.condition.includes("all") ? [] : ["all"] }))}
        />
        <AppText variant="caption" color="text-muted">
          New only by default, so a used or refurbished offer never shows up as the lowest price unless you include it.
        </AppText>
      </Section>
      <Divider />

      {f?.specs.map((s) => (
        <View key={s.key}>
          <Section title={s.label} initiallyOpen={draft.spec.some((v) => v.startsWith(s.key + "."))} badge={draft.spec.filter((v) => v.startsWith(s.key + ".")).length || undefined}>
            <Row gap={2} style={{ flexWrap: "wrap" }}>
              {s.buckets.map((b) => {
                const sel = draft.spec.includes(b.value);
                return (
                  <Chip
                    key={b.value}
                    label={`${b.label} · ${b.count}`}
                    selected={sel}
                    onPress={b.count === 0 && !sel ? undefined : () => setDraft((d) => ({ ...d, spec: toggle(d.spec, b.value) }))}
                  />
                );
              })}
            </Row>
          </Section>
          <Divider />
        </View>
      ))}

      {brands.length > 1 ? (
        <>
          <Section title="Brand" badge={draft.brand.length || undefined}>
            <MultiSelect buckets={brands} selected={draft.brand} onToggle={(v) => setDraft((d) => ({ ...d, brand: toggle(d.brand, v) }))} />
          </Section>
          <Divider />
        </>
      ) : null}

      {retailers.length > 1 ? (
        <Section title="Store" badge={draft.retailer.length || undefined}>
          <MultiSelect
            buckets={retailers}
            selected={draft.retailer}
            withLogos
            onToggle={(v) => setDraft((d) => ({ ...d, retailer: toggle(d.retailer, v) }))}
          />
        </Section>
      ) : null}
    </Sheet>
  );
}
