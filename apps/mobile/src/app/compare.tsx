import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueries, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from "react-native";
import type { CompareResponse, ProductCard } from "@pricora/contracts";
import { ProductImage, openProduct } from "@/components/product";
import { Sheet } from "@/components/Sheet";
import {
  AppText,
  Button,
  DealScoreBadge,
  DemoBadge,
  EmptyState,
  ErrorState,
  Field,
  OfflineBanner,
  PressableRow,
  Row,
  Skeleton,
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import {
  clearCompare,
  COMPARE_MAX,
  removeFromCompare,
  toggleCompare,
  useCompare,
} from "@/lib/compare";
import { conditionGroupLabel, money } from "@/lib/format";
import { useDebounced } from "@/lib/hooks";
import { openOffer } from "@/lib/links";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const COL = 156;
const LABEL = 112;

/** "min" / "max" = the best value in the row gets highlighted (only rows where better is unambiguous). */
type Best = "min" | "max" | "yes" | null;
type CmpRow = {
  key: string;
  label: string;
  group: string;
  values: string[];
  nums?: (number | null)[];
  best: Best;
};

function buildRows(d: CompareResponse): CmpRow[] {
  const ps = d.products;
  const cents = (
    pick: (p: CompareResponse["products"][number]) => number | null,
  ) => ps.map(pick);
  const moneyRow = (
    key: string,
    label: string,
    pick: (p: CompareResponse["products"][number]) => number | null,
  ): CmpRow => {
    const nums = cents(pick);
    return {
      key,
      label,
      group: "Price",
      values: nums.map((n, i) => money(n, ps[i]!.card.currency)),
      nums,
      best: "min",
    };
  };
  const fixed: CmpRow[] = [
    moneyRow("price", "Lowest price", (p) => p.card.lowestPriceCents),
    moneyRow("total", "Lowest total", (p) => p.card.lowestTotalCents),
    moneyRow("low", "Lowest ever", (p) => p.priceStats.allTimeLowCents),
    moneyRow("median", "90-day median", (p) => p.priceStats.median90Cents),
    {
      key: "score",
      label: "Deal Score",
      group: "Price",
      values: ps.map((p) => (p.dealScore ? String(p.dealScore.score) : "—")),
      nums: ps.map((p) => p.dealScore?.score ?? null),
      best: "max",
    },
    {
      key: "stores",
      label: "Stores",
      group: "Price",
      values: ps.map((p) => String(p.card.storeCount)),
      nums: ps.map((p) => p.card.storeCount),
      best: "max",
    },
    {
      key: "stock",
      label: "In stock",
      group: "Price",
      values: ps.map((p) => (p.card.inStock ? "Yes" : "No")),
      best: "yes",
    },
    {
      key: "cond",
      label: "Price condition",
      group: "Price",
      values: ps.map((p) =>
        p.card.priceCondition
          ? conditionGroupLabel[p.card.priceCondition]
          : "New",
      ),
      best: null,
    },
    {
      key: "brand",
      label: "Brand",
      group: "Overview",
      values: ps.map((p) => p.card.brand?.name ?? "—"),
      best: null,
    },
  ];
  const attrs: CmpRow[] = d.attributeKeys.map((k) => ({
    key: `a:${k.group ?? ""}:${k.name}`,
    label: k.name,
    group: k.group ?? "Specifications",
    best: null,
    values: ps.map((p) => {
      const a =
        p.attributes.find(
          (x) => x.name === k.name && (x.group ?? null) === (k.group ?? null),
        ) ?? p.attributes.find((x) => x.name === k.name);
      return a ? a.value + (a.unit ? ` ${a.unit}` : "") : "—";
    }),
  }));
  return [...fixed, ...attrs];
}

function bestIndexes(r: CmpRow): Set<number> {
  if (r.best === "yes")
    return new Set(
      r.values.flatMap((v, i) =>
        v === "Yes" && r.values.some((x) => x !== "Yes") ? [i] : [],
      ),
    );
  if (!r.best || !r.nums) return new Set();
  const valid = r.nums.filter((n): n is number => n !== null);
  if (valid.length < 2 || new Set(valid).size < 2) return new Set();
  const target = r.best === "min" ? Math.min(...valid) : Math.max(...valid);
  return new Set(r.nums.flatMap((n, i) => (n === target ? [i] : [])));
}

/**
 * Side-by-side compare (2–5 products): sticky product header row (image, name, lowest price, Visit store),
 * spec table grouped by section, "Only show differences", best value per row highlighted, remove / add from search.
 */
export default function CompareScreen() {
  const { c } = useTheme();
  const items = useCompare();
  const ids = items.map((i) => i.id);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const q = useQuery({
    queryKey: ["compare", ids.join(",")],
    queryFn: ({ signal }) => api.catalog.compare(ids, { signal }),
    enabled: ids.length >= 2,
  });
  // Lowest offer per product for "Visit store" (/v1/go/:offerId — never a raw retailer URL).
  const details = useQueries({
    queries: items.map((i) => ({
      queryKey: ["product", i.slug, null],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.catalog.product(i.slug, undefined, { signal }),
      staleTime: 5 * 60_000,
    })),
  });
  useEffect(() => {
    if (q.data)
      track("compare_viewed", { productCount: q.data.products.length });
  }, [q.data]);

  const rows = useMemo(() => (q.data ? buildRows(q.data) : []), [q.data]);
  const shown = onlyDiff
    ? rows.filter((r) => new Set(r.values.map((v) => v.toLowerCase())).size > 1)
    : rows;
  const d = q.data;

  if (ids.length < 2) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState
          icon="git-compare-outline"
          title={
            ids.length === 1
              ? "Add one more product"
              : "Pick at least 2 products"
          }
          message={`Tap the compare icon on any product (up to ${COMPARE_MAX}), or add one here.`}
          action={{ label: "Add a product", onPress: () => setAddOpen(true) }}
        />
        <Button
          title="Browse categories"
          variant="ghost"
          onPress={() => router.push("/categories")}
        />
        <AddSheet
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          existing={ids}
        />
      </View>
    );
  }

  // Explicit table width: a vertical ScrollView inside a horizontal one otherwise collapses to the screen width.
  const tableWidth = d
    ? LABEL +
      COL * d.products.length +
      (d.products.length < COMPARE_MAX ? COL : 0)
    : 0;
  const header = d ? (
    <View style={{ width: tableWidth, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: "row",
          width: tableWidth,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        <View
          style={{
            width: LABEL,
            paddingLeft: GUTTER,
            justifyContent: "flex-end",
            paddingBottom: sp[2],
          }}
        >
          <AppText variant="caption" color="text-muted">
            {d.products.length} of {COMPARE_MAX}
          </AppText>
        </View>
        {d.products.map((p) => {
          const detail = details.find(
            (x) => x.data?.product.id === p.card.id,
          )?.data;
          const offer = detail
            ? (detail.offers.find((o) => o.id === detail.lowestOfferId) ?? null)
            : null;
          return (
            <View
              key={p.card.id}
              style={{ width: COL, padding: sp[2], gap: sp[1] }}
            >
              <Pressable
                onPress={() => openProduct(p.card.slug)}
                accessibilityRole="link"
                accessibilityLabel={p.card.title}
              >
                <ProductImage
                  uri={p.card.image?.url}
                  size={COL - sp[4]}
                  height={72}
                />
                <AppText
                  variant="label"
                  numberOfLines={2}
                  style={{ marginTop: sp[1] }}
                >
                  {p.card.title}
                </AppText>
              </Pressable>
              <AppText variant="priceSm">
                {money(p.card.lowestPriceCents, p.card.currency)}
              </AppText>
              <Row gap={1} style={{ flexWrap: "wrap" }}>
                {p.dealScore ? (
                  <DealScoreBadge score={p.dealScore.score} />
                ) : null}
                {p.card.hasDemoData ? <DemoBadge /> : null}
              </Row>
              <Button
                title="Visit store"
                size="sm"
                icon="open-outline"
                disabled={!offer}
                accessibilityLabel={
                  offer ? `Visit ${offer.retailer.name}` : "Visit store"
                }
                onPress={() =>
                  offer &&
                  void openOffer(offer.id, offer.retailer.name, "app_compare")
                }
              />
              <Pressable
                onPress={() => removeFromCompare(p.card.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.card.title}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  minHeight: 32,
                }}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={16}
                  color={c["text-muted"]}
                />
                <AppText variant="caption" color="text-muted">
                  Remove
                </AppText>
              </Pressable>
            </View>
          );
        })}
        {d.products.length < COMPARE_MAX ? (
          <Pressable
            onPress={() => setAddOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add a product to compare"
            style={{
              width: COL - 30,
              margin: sp[2],
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: c["border-strong"],
              alignItems: "center",
              justifyContent: "center",
              gap: sp[1],
            }}
          >
            <Ionicons name="add-circle-outline" size={28} color={c.primary} />
            <AppText variant="label" color="primary">
              Add product
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <Row
        style={{
          paddingHorizontal: GUTTER,
          paddingVertical: sp[2],
          justifyContent: "space-between",
        }}
      >
        <Row gap={2}>
          <Switch
            value={onlyDiff}
            onValueChange={setOnlyDiff}
            trackColor={{ true: c.primary, false: c["surface-3"] }}
            accessibilityLabel="Only show differences"
          />
          <AppText variant="label">Only show differences</AppText>
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
        <ErrorState
          message={errorMessage(q.error)}
          onRetry={() => void q.refetch()}
        />
      ) : !d ? (
        <View style={{ padding: GUTTER, gap: sp[3] }}>
          <Skeleton height={220} />
          <Skeleton height={300} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {/* Vertical list inside the horizontal scroller so the product header row stays pinned while scrolling specs. */}
          <ScrollView
            style={{ width: tableWidth }}
            stickyHeaderIndices={[0]}
            contentContainerStyle={{ paddingBottom: sp[16] }}
            refreshControl={
              <RefreshControl
                refreshing={q.isRefetching}
                onRefresh={() => void q.refetch()}
                tintColor={c.primary}
              />
            }
          >
            {header}
            {shown.map((r, i) => {
              const groupHeader =
                i === 0 || shown[i - 1]?.group !== r.group ? r.group : null;
              const differs =
                new Set(r.values.map((v) => v.toLowerCase())).size > 1;
              const best = bestIndexes(r);
              return (
                <View key={r.key}>
                  {groupHeader ? (
                    <View
                      style={{
                        backgroundColor: c["surface-2"],
                        paddingVertical: sp[1.5],
                        paddingLeft: GUTTER,
                      }}
                    >
                      <AppText variant="overline" color="text-muted">
                        {groupHeader}
                      </AppText>
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: "row",
                      borderTopWidth: groupHeader ? 0 : 1,
                      borderColor: c.border,
                    }}
                  >
                    <View
                      style={{
                        width: LABEL,
                        paddingLeft: GUTTER,
                        paddingVertical: sp[2],
                        paddingRight: sp[1],
                      }}
                    >
                      <AppText variant="caption" color="text-muted">
                        {r.label}
                      </AppText>
                    </View>
                    {r.values.map((v, j) => {
                      const isBest = best.has(j);
                      return (
                        <View
                          key={j}
                          style={{
                            width: COL,
                            paddingVertical: sp[2],
                            paddingHorizontal: sp[2],
                            backgroundColor: isBest
                              ? c["success-soft"]
                              : undefined,
                          }}
                          accessibilityLabel={isBest ? `${v}, best in row` : v}
                        >
                          <AppText
                            variant={
                              r.group === "Price"
                                ? "priceSm"
                                : differs
                                  ? "label"
                                  : "body"
                            }
                            color={isBest ? "success" : "text"}
                          >
                            {v}
                          </AppText>
                          {isBest ? (
                            <AppText variant="caption" color="success">
                              Best
                            </AppText>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
            {onlyDiff && shown.length === 0 ? (
              <AppText color="text-muted" style={{ padding: GUTTER }}>
                These products don’t differ on any listed spec.
              </AppText>
            ) : null}
            <AppText
              variant="caption"
              color="text-muted"
              style={{ padding: GUTTER, maxWidth: 360 }}
            >
              “Best” marks the lowest price, highest Deal Score, most stores or
              in-stock value in a row. Spec rows aren’t ranked.
            </AppText>
          </ScrollView>
        </ScrollView>
      )}
      <AddSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        existing={ids}
      />
    </View>
  );
}

/** Add a product to compare from search (GET /v1/search returns ids, unlike suggestions). */
function AddSheet({
  visible,
  onClose,
  existing,
}: {
  visible: boolean;
  onClose: () => void;
  existing: string[];
}) {
  const { c } = useTheme();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const res = useQuery({
    queryKey: ["search", "compare-add", q],
    queryFn: ({ signal }) => api.search.search({ q, pageSize: 12 }, { signal }),
    enabled: visible && q.length >= 2,
  });
  const close = () => {
    setText("");
    onClose();
  };
  const add = (p: ProductCard) => {
    if (
      toggleCompare({
        id: p.id,
        slug: p.slug,
        title: p.title,
        imageUrl: p.image?.url ?? null,
      }) !== "full"
    )
      close();
  };
  return (
    <Sheet visible={visible} onClose={close} title="Add a product to compare">
      <Field
        placeholder="Search products"
        value={text}
        onChangeText={setText}
        autoFocus
        autoCorrect={false}
      />
      {res.isFetching && !res.data ? <Skeleton height={56} /> : null}
      {res.data?.items
        .filter((p) => !existing.includes(p.id))
        .map((p) => (
          <PressableRow
            key={p.id}
            onPress={() => add(p)}
            accessibilityLabel={`Add ${p.title}`}
          >
            <Row gap={3} style={{ paddingVertical: sp[1] }}>
              <ProductImage uri={p.image?.url} size={44} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" numberOfLines={2}>
                  {p.title}
                </AppText>
                <AppText variant="caption" color="text-muted">
                  {money(p.lowestPriceCents, p.currency)} · {p.storeCount}{" "}
                  stores
                </AppText>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={c.primary} />
            </Row>
          </PressableRow>
        ))}
      {res.data && res.data.items.length === 0 ? (
        <AppText color="text-muted">No matches.</AppText>
      ) : null}
    </Sheet>
  );
}
