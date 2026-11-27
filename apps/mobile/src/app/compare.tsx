import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import type { CompareResponse } from "@pricora/contracts";
import { ProductImage, openProduct } from "@/components/product";
import { AppText, Button, DealScoreBadge, DemoBadge, EmptyState, ErrorState, OfflineBanner, Row, Skeleton } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { clearCompare, removeFromCompare, useCompare } from "@/lib/compare";
import { money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const COL = 150;
const LABEL = 116;

type CmpRow = { key: string; label: string; group: string | null; values: string[] };

function buildRows(d: CompareResponse): CmpRow[] {
  const fixed: CmpRow[] = [
    { key: "price", label: "Lowest price", group: "Price", values: d.products.map((p) => money(p.card.lowestPriceCents, p.card.currency)) },
    { key: "total", label: "Lowest total", group: "Price", values: d.products.map((p) => money(p.card.lowestTotalCents, p.card.currency)) },
    { key: "low", label: "Lowest ever", group: "Price", values: d.products.map((p) => money(p.priceStats.allTimeLowCents, p.card.currency)) },
    { key: "median", label: "90-day median", group: "Price", values: d.products.map((p) => money(p.priceStats.median90Cents, p.card.currency)) },
    { key: "stores", label: "Stores", group: "Price", values: d.products.map((p) => String(p.card.storeCount)) },
    { key: "stock", label: "In stock", group: "Price", values: d.products.map((p) => (p.card.inStock ? "Yes" : "No")) },
    { key: "brand", label: "Brand", group: "Overview", values: d.products.map((p) => p.card.brand?.name ?? "—") },
  ];
  const attrs = d.attributeKeys.map((k) => ({
    key: `a:${k.group ?? ""}:${k.name}`,
    label: k.name,
    group: k.group ?? "Specifications",
    values: d.products.map((p) => {
      const a = p.attributes.find((x) => x.name === k.name && (x.group ?? null) === (k.group ?? null)) ?? p.attributes.find((x) => x.name === k.name);
      return a ? a.value + (a.unit ? ` ${a.unit}` : "") : "—";
    }),
  }));
  return [...fixed, ...attrs];
}

/** Side-by-side compare (2–5 products) with sticky labels and an "only differences" toggle. */
export default function CompareScreen() {
  const { c } = useTheme();
  const items = useCompare();
  const ids = items.map((i) => i.id);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const q = useQuery({
    queryKey: ["compare", ids.join(",")],
    queryFn: ({ signal }) => api.catalog.compare(ids, { signal }),
    enabled: ids.length >= 2,
  });
  useEffect(() => {
    if (q.data) track("compare_viewed", { productCount: q.data.products.length });
  }, [q.data]);

  const rows = useMemo(() => (q.data ? buildRows(q.data) : []), [q.data]);
  const shown = onlyDiff ? rows.filter((r) => new Set(r.values.map((v) => v.toLowerCase())).size > 1) : rows;

  if (ids.length < 2) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState
          icon="git-compare-outline"
          title="Pick at least 2 products"
          message="Tap the compare icon on any product to add it here (up to 5)."
          action={{ label: "Browse categories", onPress: () => router.push("/categories") }}
        />
      </View>
    );
  }

  const d = q.data;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <Row style={{ paddingHorizontal: GUTTER, paddingVertical: sp[2], justifyContent: "space-between" }}>
        <Row gap={2}>
          <Switch value={onlyDiff} onValueChange={setOnlyDiff} trackColor={{ true: c.primary, false: c["surface-3"] }} accessibilityLabel="Only show differences" />
          <AppText variant="label">Only differences</AppText>
        </Row>
        <Button
          title="Clear"
          variant="ghost"
          size="sm"
          onPress={() => {
            clearCompare();
            router.back();
          }}
        />
      </Row>
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !d ? (
        <View style={{ padding: GUTTER, gap: sp[3] }}>
          <Skeleton height={180} />
          <Skeleton height={300} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: sp[16] }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* Product headers */}
              <View style={{ flexDirection: "row" }}>
                <View style={{ width: LABEL, paddingLeft: GUTTER }} />
                {d.products.map((p) => (
                  <View key={p.card.id} style={{ width: COL, padding: sp[2], gap: sp[1.5] }}>
                    <Pressable onPress={() => openProduct(p.card.slug)} accessibilityRole="link" accessibilityLabel={p.card.title}>
                      <ProductImage uri={p.card.image?.url} size={COL - sp[4]} height={100} />
                      <AppText variant="label" numberOfLines={3} style={{ marginTop: sp[1.5] }}>
                        {p.card.title}
                      </AppText>
                    </Pressable>
                    <Row gap={1} style={{ flexWrap: "wrap" }}>
                      {p.dealScore ? <DealScoreBadge score={p.dealScore.score} /> : null}
                      {p.card.hasDemoData ? <DemoBadge /> : null}
                    </Row>
                    <Pressable
                      onPress={() => removeFromCompare(p.card.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${p.card.title}`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={c["text-muted"]} />
                      <AppText variant="caption" color="text-muted">
                        Remove
                      </AppText>
                    </Pressable>
                  </View>
                ))}
              </View>
              {/* Rows */}
              {shown.map((r, i) => {
                const groupHeader = i === 0 || shown[i - 1]?.group !== r.group ? r.group : null;
                const differs = new Set(r.values.map((v) => v.toLowerCase())).size > 1;
                return (
                  <View key={r.key}>
                    {groupHeader ? (
                      <View style={{ backgroundColor: c["surface-2"], paddingVertical: sp[1.5], paddingLeft: GUTTER }}>
                        <AppText variant="overline" color="text-muted">
                          {groupHeader}
                        </AppText>
                      </View>
                    ) : null}
                    <View style={{ flexDirection: "row", borderTopWidth: groupHeader || i === 0 ? 0 : 1, borderColor: c.border }}>
                      <View style={{ width: LABEL, paddingLeft: GUTTER, paddingVertical: sp[2], paddingRight: sp[1] }}>
                        <AppText variant="caption" color="text-muted">
                          {r.label}
                        </AppText>
                      </View>
                      {r.values.map((v, j) => (
                        <View key={j} style={{ width: COL, paddingVertical: sp[2], paddingHorizontal: sp[2], }}>
                          <AppText variant={r.group === "Price" ? "priceSm" : differs ? "label" : "body"}>{v}</AppText>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
              {onlyDiff && shown.length === 0 ? (
                <AppText color="text-muted" style={{ padding: GUTTER }}>
                  These products don’t differ on any listed spec.
                </AppText>
              ) : null}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}
