import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { FlatList, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ProductCondition, SearchQueryInput, SearchSort, Suggestion } from "@pricora/contracts";
import { ProductRow, RowSkeleton } from "@/components/product";
import { Sheet } from "@/components/Sheet";
import { AppText, Chip, Divider, EmptyState, ErrorState, Field, IconButton, Notice, OfflineBanner, PressableRow, Row } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { money } from "@/lib/format";
import { param, useDebounced } from "@/lib/hooks";
import { tokens, typeStyle, useTheme } from "@/lib/theme";

const sp = tokens.spacing;

const SORTS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "lowest_total", label: "Lowest total" },
  { value: "best_deal", label: "Best deal" },
  { value: "biggest_drop", label: "Biggest drop" },
  { value: "price_desc", label: "Price: high" },
  { value: "newest", label: "Newest" },
];

interface Filters {
  minDollars: string;
  maxDollars: string;
  condition: ProductCondition[];
  inStock: boolean;
  freeShipping: boolean;
  brand: string[];
  retailer: string[];
}
const EMPTY_FILTERS: Filters = { minDollars: "", maxDollars: "", condition: [], inStock: false, freeShipping: false, brand: [], retailer: [] };

const dollarsToCents = (s: string): number | undefined => {
  const n = Number.parseFloat(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

export default function SearchScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ q?: string; category?: string; label?: string; focus?: string }>();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState(param(params.q) ?? "");
  const [submitted, setSubmitted] = useState(param(params.q) ?? "");
  const [category, setCategory] = useState<{ slug: string; label: string } | null>(() => {
    const slug = param(params.category);
    return slug ? { slug, label: param(params.label) ?? slug } : null;
  });
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  // Deep links / home chips: /search?category=…&label=… or ?q=… — adjust state during render when params change.
  const paramSig = `${param(params.category) ?? ""}|${param(params.label) ?? ""}|${param(params.q) ?? ""}`;
  const [seenSig, setSeenSig] = useState(paramSig);
  if (paramSig !== seenSig) {
    setSeenSig(paramSig);
    const slug = param(params.category);
    if (slug) setCategory({ slug, label: param(params.label) ?? slug });
    const q = param(params.q);
    if (q !== undefined) {
      setText(q);
      setSubmitted(q);
    }
  }
  useEffect(() => {
    if (param(params.focus) !== "1") return;
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [params.focus]);

  const debounced = useDebounced(text.trim(), 200);
  const suggest = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: ({ signal }) => api.search.suggest(debounced, { signal }),
    enabled: focused && debounced.length >= 2,
    staleTime: 5 * 60_000,
  });

  const query = useMemo<SearchQueryInput>(
    () => ({
      q: submitted || undefined,
      category: category?.slug,
      sort,
      minPrice: dollarsToCents(filters.minDollars),
      maxPrice: dollarsToCents(filters.maxDollars),
      condition: filters.condition.length ? filters.condition.join(",") : undefined,
      inStock: filters.inStock ? "true" : undefined,
      freeShipping: filters.freeShipping ? "true" : undefined,
      brand: filters.brand.length ? filters.brand.join(",") : undefined,
      retailer: filters.retailer.length ? filters.retailer.join(",") : undefined,
      pageSize: 24,
    }),
    [submitted, category, sort, filters],
  );
  const hasQuery = !!(query.q || query.category);

  const results = useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam, signal }) => api.search.search({ ...query, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: hasQuery,
  });
  const first = results.data?.pages[0];
  const items = useMemo(() => results.data?.pages.flatMap((p) => p.items) ?? [], [results.data]);

  useEffect(() => {
    if (first && results.data?.pages.length === 1) {
      const q = query.q ?? "";
      track("search_performed", {
        kind: !q ? "empty" : first.parsed?.identifier ? "gtin" : first.parsed?.url ? "url" : "text",
        queryLength: q.length,
        termCount: q.split(/\s+/).filter(Boolean).length,
        resultCount: first.total,
        hasPriceFilter: query.minPrice !== undefined || query.maxPrice !== undefined,
        categoryHint: query.category ?? null,
        sort: query.sort ?? null,
        degraded: first.degraded,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  const submit = (q: string) => {
    setText(q);
    setSubmitted(q.trim());
    setFocused(false);
    inputRef.current?.blur();
  };

  const onSuggestion = (s: Suggestion) => {
    if (s.type === "product") router.push({ pathname: "/products/[slug]", params: { slug: s.slug } });
    else if (s.type === "category") {
      setCategory({ slug: s.slug, label: s.text });
      submit("");
    } else if (s.type === "brand") {
      setFilters((f) => ({ ...f, brand: [s.slug] }));
      submit("");
    } else submit(s.text);
  };

  const filterCount = activeFilterCount(filters);
  const showSuggestions = focused && debounced.length >= 2 && (suggest.data?.items.length ?? 0) > 0;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <View style={{ paddingHorizontal: tokens.layout.gutter.base, paddingTop: sp[2], gap: sp[2] }}>
        <Row
          gap={2}
          style={{
            minHeight: 48,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: focused ? c.primary : c["border-strong"],
            backgroundColor: c.surface,
            paddingHorizontal: sp[3],
          }}
        >
          <Ionicons name="search" size={18} color={c["text-muted"]} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => submit(text)}
            placeholder="Search products, brands, or UPC"
            placeholderTextColor={c["text-muted"]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            accessibilityLabel="Search products"
            style={[typeStyle("md"), { flex: 1, color: c.text, paddingVertical: sp[2] }]}
          />
        </Row>
        {category ? (
          <Row gap={2}>
            <Chip label={`Category: ${category.label}`} selected icon="close" onPress={() => setCategory(null)} />
          </Row>
        ) : null}
      </View>

      {showSuggestions ? (
        <FlatList
          data={suggest.data?.items ?? []}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(s, i) => s.type + s.text + i}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingHorizontal: tokens.layout.gutter.base }}
          renderItem={({ item }) => (
            <PressableRow onPress={() => onSuggestion(item)} accessibilityLabel={item.text} style={{ justifyContent: "center", paddingVertical: sp[2] }}>
              <Row gap={3}>
                <Ionicons
                  name={item.type === "product" ? "pricetag-outline" : item.type === "category" ? "grid-outline" : item.type === "brand" ? "ribbon-outline" : "search-outline"}
                  size={18}
                  color={c["text-muted"]}
                />
                <AppText variant="bodyLg" numberOfLines={1} style={{ flex: 1 }}>
                  {item.text}
                </AppText>
                {item.type === "product" && item.lowestPriceCents !== null ? (
                  <AppText variant="priceSm">{money(item.lowestPriceCents)}</AppText>
                ) : null}
              </Row>
            </PressableRow>
          )}
        />
      ) : !hasQuery ? (
        <TrendingPanel onPick={submit} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={{ paddingHorizontal: tokens.layout.gutter.base, paddingBottom: sp[12] }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
          }}
          ListHeaderComponent={
            <View style={{ gap: sp[2], paddingVertical: sp[2] }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp[2] }}>
                <Chip
                  label={filterCount ? `Filters (${filterCount})` : "Filters"}
                  icon="options-outline"
                  selected={filterCount > 0}
                  onPress={() => {
                    setDraft(filters);
                    setSheetOpen(true);
                  }}
                />
                {SORTS.map((s) => (
                  <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
                ))}
              </ScrollView>
              {first ? (
                <AppText variant="caption" color="text-muted">
                  {first.total.toLocaleString("en-US")} results{first.parsed?.maxPriceCents ? ` · under ${money(first.parsed.maxPriceCents, "USD", "auto")}` : ""}
                </AppText>
              ) : null}
              {first?.degraded ? <Notice tone="warning">Search is running in basic mode right now; results may be less relevant.</Notice> : null}
              {items.some((p) => p.hasDemoData) ? <Notice tone="demo">Results include demo data, not live retailer prices.</Notice> : null}
            </View>
          }
          renderItem={({ item }) => <ProductRow p={item} />}
          ListEmptyComponent={
            results.isPending ? (
              <RowSkeleton />
            ) : results.isError ? (
              <ErrorState message={errorMessage(results.error)} onRetry={() => void results.refetch()} />
            ) : (
              <EmptyState icon="search-outline" title="No matches" message="Try fewer words, a different spelling, or remove filters." />
            )
          }
          ListFooterComponent={results.isFetchingNextPage ? <RowSkeleton count={2} /> : undefined}
        />
      )}

      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        secondary={{ label: "Reset", onPress: () => setDraft(EMPTY_FILTERS) }}
        primary={{
          label: "Show results",
          onPress: () => {
            setFilters(draft);
            setSheetOpen(false);
          },
        }}
      >
        <View style={{ gap: sp[2] }}>
          <AppText variant="label">Price (USD)</AppText>
          <Row gap={3}>
            <Field style={{ flex: 1 }} placeholder="Min" keyboardType="decimal-pad" value={draft.minDollars} onChangeText={(v) => setDraft({ ...draft, minDollars: v })} accessibilityLabel="Minimum price" />
            <Field style={{ flex: 1 }} placeholder="Max" keyboardType="decimal-pad" value={draft.maxDollars} onChangeText={(v) => setDraft({ ...draft, maxDollars: v })} accessibilityLabel="Maximum price" />
          </Row>
        </View>
        <View style={{ gap: sp[2] }}>
          <AppText variant="label">Condition</AppText>
          <Row gap={2} style={{ flexWrap: "wrap" }}>
            {(["new", "refurbished", "open_box", "used"] as const).map((cond) => (
              <Chip
                key={cond}
                label={cond === "open_box" ? "Open box" : cond[0]!.toUpperCase() + cond.slice(1)}
                selected={draft.condition.includes(cond)}
                onPress={() => setDraft({ ...draft, condition: toggle(draft.condition, cond) })}
              />
            ))}
          </Row>
        </View>
        <View style={{ gap: sp[2] }}>
          <AppText variant="label">Availability</AppText>
          <Row gap={2} style={{ flexWrap: "wrap" }}>
            <Chip label="In stock" selected={draft.inStock} onPress={() => setDraft({ ...draft, inStock: !draft.inStock })} />
            <Chip label="Free shipping" selected={draft.freeShipping} onPress={() => setDraft({ ...draft, freeShipping: !draft.freeShipping })} />
          </Row>
        </View>
        {first && first.facets.brands.length > 0 ? (
          <View style={{ gap: sp[2] }}>
            <AppText variant="label">Brand</AppText>
            <Row gap={2} style={{ flexWrap: "wrap" }}>
              {first.facets.brands.slice(0, 16).map((b) => (
                <Chip key={b.value} label={`${b.label} (${b.count})`} selected={draft.brand.includes(b.value)} onPress={() => setDraft({ ...draft, brand: toggle(draft.brand, b.value) })} />
              ))}
            </Row>
          </View>
        ) : null}
        {first && first.facets.retailers.length > 0 ? (
          <View style={{ gap: sp[2] }}>
            <AppText variant="label">Store</AppText>
            <Row gap={2} style={{ flexWrap: "wrap" }}>
              {first.facets.retailers.slice(0, 16).map((r) => (
                <Chip key={r.value} label={`${r.label} (${r.count})`} selected={draft.retailer.includes(r.value)} onPress={() => setDraft({ ...draft, retailer: toggle(draft.retailer, r.value) })} />
              ))}
            </Row>
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function activeFilterCount(f: Filters): number {
  return (
    (f.minDollars ? 1 : 0) +
    (f.maxDollars ? 1 : 0) +
    f.condition.length +
    (f.inStock ? 1 : 0) +
    (f.freeShipping ? 1 : 0) +
    f.brand.length +
    f.retailer.length
  );
}

function TrendingPanel({ onPick }: { onPick: (q: string) => void }) {
  const trending = useQuery({ queryKey: ["trending"], queryFn: ({ signal }) => api.search.trending({ signal }), staleTime: 10 * 60_000 });
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: tokens.layout.gutter.base, paddingVertical: sp[4], gap: sp[3] }} keyboardShouldPersistTaps="handled">
      <AppText variant="h4">Trending searches</AppText>
      {trending.data?.queries.length ? (
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {trending.data.queries.map((q) => (
            <Chip key={q.text} label={q.text} icon="trending-up-outline" onPress={() => onPick(q.text)} />
          ))}
        </Row>
      ) : trending.isPending ? null : (
        <AppText color="text-muted">Search by product name, brand, model number, or scan a barcode.</AppText>
      )}
      <IconButton icon="barcode-outline" label="Scan a barcode" onPress={() => router.push("/scan")} />
    </ScrollView>
  );
}
