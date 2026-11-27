import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import type { ProductCard, SearchResponse, SearchSort } from "@pricora/contracts";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { appliedChips, filterCount, SORTS, toQuery, type BrowseFilters, type BrowseScope, EMPTY_FILTERS } from "@/lib/browse";
import { haptic } from "@/lib/format";
import { createLocalStore, useLocalStore } from "@/lib/store";
import { tokens, useTheme } from "@/lib/theme";
import { GridSkeleton, ProductRow, ProductTile, RowSkeleton, useGridTileWidth } from "../product";
import { Sheet } from "../Sheet";
import { AppText, Chip, Divider, EmptyState, ErrorState, Notice, Row } from "../ui";
import { FilterSheet } from "./FilterSheet";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Grid vs list is a device preference shared by every listing. */
const layoutStore = createLocalStore<"grid" | "list">("pricora.browse-layout.v1", "grid", (v) => (v === "grid" || v === "list" ? v : null));

export function ToolbarButton({ icon, label, onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; badge?: number }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} applied` : label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: sp[3],
        borderRadius: tokens.radius.full,
        borderWidth: 1,
        borderColor: badge ? c.primary : c.border,
        backgroundColor: badge ? c["primary-soft"] : c.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={16} color={badge ? c["primary-soft-fg"] : c.text} />
      <AppText variant="label" color={badge ? "primary-soft-fg" : "text"} numberOfLines={1}>
        {label}
        {badge ? ` · ${badge}` : ""}
      </AppText>
    </Pressable>
  );
}

export interface ProductBrowserProps {
  scope: BrowseScope;
  initialFilters?: BrowseFilters;
  initialSort?: SearchSort;
  /** Sorts offered (defaults to all). */
  sorts?: SearchSort[];
  /** Rendered above the toolbar (title, subcategory chips…). Receives the first page once loaded. */
  header?: (first: SearchResponse | undefined) => ReactNode;
  /** Replaces the default zero-results state. */
  empty?: (first: SearchResponse, clear: () => void) => ReactNode;
  analyticsKind?: "text" | "empty";
  /** Extra bottom padding (tab screens: clears the floating tab bar). */
  bottomSpace?: number;
}

/**
 * Generic product listing used by search results, categories, brand, store, popular, new and price buckets.
 * GET /v1/search with infinite pages; sort sheet, filter sheet (facets + counts), grid/list, applied chips,
 * pull-to-refresh and skeletons.
 */
export function ProductBrowser({ scope, initialFilters, initialSort = "relevance", sorts, header, empty, analyticsKind, bottomSpace = sp[16] }: ProductBrowserProps) {
  const { c } = useTheme();
  const [filters, setFilters] = useState<BrowseFilters>(initialFilters ?? EMPTY_FILTERS);
  const [sort, setSort] = useState<SearchSort>(initialSort);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const layout = useLocalStore(layoutStore);
  const tileW = useGridTileWidth();

  const query = useMemo(() => toQuery(scope, filters, sort), [scope, filters, sort]);
  const results = useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam, signal }) => api.search.search({ ...query, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const first = results.data?.pages[0];
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (results.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [results.data]);
  const chips = appliedChips(filters, first?.facets);
  const nFilters = filterCount(filters);

  useEffect(() => {
    if (!first || results.data?.pages.length !== 1 || !analyticsKind) return;
    const q = scope.q ?? "";
    track("search_performed", {
      kind: !q ? "empty" : first.parsed?.identifier ? "gtin" : first.parsed?.url ? "url" : "text",
      queryLength: q.length,
      termCount: q.split(/\s+/).filter(Boolean).length,
      resultCount: first.total,
      hasPriceFilter: filters.minPrice !== undefined || filters.maxPrice !== undefined,
      categoryHint: scope.category ?? null,
      sort,
      degraded: first.degraded,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per new first page
  }, [first]);

  const clearAll = () => setFilters(EMPTY_FILTERS);
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? "Sort";
  const sortOptions = sorts ? SORTS.filter((s) => sorts.includes(s.value)) : SORTS;

  const listHeader = (
    <View style={{ paddingHorizontal: GUTTER }}>
      {header?.(first)}
      <Row gap={2} style={{ marginTop: sp[3] }}>
        <ToolbarButton icon="swap-vertical" label={sortLabel} onPress={() => setSortOpen(true)} />
        <ToolbarButton icon="options-outline" label="Filters" badge={nFilters || undefined} onPress={() => setFilterOpen(true)} />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            haptic.toggle();
            layoutStore.set(layout === "grid" ? "list" : "grid");
          }}
          accessibilityRole="button"
          accessibilityLabel={layout === "grid" ? "Show as list" : "Show as grid"}
          hitSlop={6}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name={layout === "grid" ? "list-outline" : "grid-outline"} size={22} color={c.text} />
        </Pressable>
      </Row>
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER, marginTop: sp[2] }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
          {chips.map((ch) => (
            <Chip key={ch.key} label={ch.label} icon="close" selected onPress={() => setFilters((f) => ch.remove(f))} />
          ))}
          <Chip label="Clear all" onPress={clearAll} />
        </ScrollView>
      ) : null}
      {first ? (
        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2], marginBottom: sp[1] }} accessibilityLiveRegion="polite">
          {first.total.toLocaleString("en-US")} {first.total === 1 ? "product" : "products"}
        </AppText>
      ) : null}
      {first?.degraded ? <Notice tone="info">Search is running in basic mode right now; ranking may be simpler.</Notice> : null}
      {items.some((p) => p.hasDemoData) ? (
        <View style={{ marginTop: sp[2] }}>
          <Notice tone="demo">Some prices here are demo data, not live retailer prices.</Notice>
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: ProductCard }) =>
    layout === "grid" ? (
      <View style={{ width: tileW, marginBottom: sp[4] }}>
        <ProductTile p={item} width={tileW} />
      </View>
    ) : (
      <View style={{ paddingHorizontal: GUTTER }}>
        <ProductRow p={item} />
      </View>
    );

  return (
    <>
      <FlatList
        key={layout}
        data={items}
        keyExtractor={(p) => p.id}
        numColumns={layout === "grid" ? 2 : 1}
        columnWrapperStyle={layout === "grid" ? { gap: sp[3], paddingHorizontal: GUTTER } : undefined}
        ItemSeparatorComponent={layout === "list" ? () => <Divider style={{ marginHorizontal: GUTTER }} /> : undefined}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={{ marginBottom: sp[2] }}
        ListEmptyComponent={
          results.isPending ? (
            <View style={{ paddingHorizontal: GUTTER }}>{layout === "grid" ? <GridSkeleton /> : <RowSkeleton />}</View>
          ) : results.isError ? (
            <ErrorState message={errorMessage(results.error)} onRetry={() => void results.refetch()} />
          ) : first ? (
            <>{empty?.(first, clearAll) ?? (
              <EmptyState
                icon="search-outline"
                title="No products match"
                message={nFilters ? "Try removing some filters." : "Try a different category or search."}
                action={nFilters ? { label: "Clear filters", onPress: clearAll } : undefined}
              />
            )}</>
          ) : undefined
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (results.hasNextPage && !results.isFetchingNextPage) void results.fetchNextPage();
        }}
        ListFooterComponent={
          results.isFetchingNextPage ? (
            <ActivityIndicator style={{ marginVertical: sp[6] }} color={c.primary} />
          ) : (
            <View style={{ height: bottomSpace }} />
          )
        }
        refreshControl={
          <RefreshControl refreshing={results.isRefetching && !results.isFetchingNextPage} onRefresh={() => void results.refetch()} tintColor={c.primary} />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        initialNumToRender={8}
        windowSize={7}
      />
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        facets={first?.facets}
        scope={scope}
        sort={sort}
        value={filters}
        onApply={(f) => {
          setFilters(f);
          track("filter_applied", { filter: "sheet", valueCount: filterCount(f) });
        }}
      />
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View>
          {sortOptions.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => {
                haptic.toggle();
                setSort(s.value);
                track("sort_changed", { sort: s.value });
                setSortOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: sort === s.value }}
              style={{ flexDirection: "row", alignItems: "center", minHeight: 48, gap: sp[3] }}
            >
              <Ionicons name={sort === s.value ? "radio-button-on" : "radio-button-off"} size={22} color={sort === s.value ? c.primary : c["text-muted"]} />
              <AppText variant="bodyLg">{s.label}</AppText>
            </Pressable>
          ))}
        </View>
        <AppText variant="caption" color="text-muted">
          Sponsored placements never change this order or Deal Scores.
        </AppText>
      </Sheet>
    </>
  );
}


