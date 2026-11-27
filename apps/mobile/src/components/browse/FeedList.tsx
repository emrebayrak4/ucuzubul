import { useQuery, useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";
import { api, errorMessage } from "@/lib/api";
import { tokens, useTheme } from "@/lib/theme";
import { GridSkeleton, ProductTile, useGridTileWidth, type CardExtras } from "../product";
import { Chip, EmptyState, ErrorState, Notice, OfflineBanner } from "../ui";
import type { ProductCard } from "@pricora/contracts";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

export interface FeedPage<T> {
  items: T[];
  page: number;
  totalPages: number;
}

/**
 * Paginated 2-up grid for endpoint-backed feeds (deals, price drops). `toCard` maps a row to a ProductCard plus
 * display extras (store, real previous price).
 */
export function FeedList<T>({
  queryKey,
  fetchPage,
  toCard,
  header,
  category,
  onCategory,
  emptyText,
}: {
  queryKey: QueryKey;
  fetchPage: (page: number, signal: AbortSignal) => Promise<FeedPage<T>>;
  toCard: (row: T) => { card: ProductCard; extras?: CardExtras; demo: boolean };
  header?: ReactNode;
  category: string | undefined;
  onCategory: (slug: string | undefined) => void;
  emptyText: string;
}) {
  const { c } = useTheme();
  const tileW = useGridTileWidth();
  const cats = useQuery({ queryKey: ["home", "categories"], queryFn: ({ signal }) => api.catalog.categories({ signal }), staleTime: 60 * 60_000 });
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const rows = useMemo(() => (q.data?.pages.flatMap((p) => p.items) ?? []).map(toCard), [q.data, toCard]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={rows}
        keyExtractor={(r, i) => r.card.id + ":" + i}
        numColumns={2}
        columnWrapperStyle={{ gap: sp[3], paddingHorizontal: GUTTER }}
        renderItem={({ item }) => (
          <View style={{ width: tileW, marginBottom: sp[4] }}>
            <ProductTile p={item.card} x={item.extras} width={tileW} />
          </View>
        )}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: GUTTER, paddingTop: sp[2], gap: sp[3], marginBottom: sp[3] }}>
            {header}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              <Chip label="All categories" selected={!category} onPress={() => onCategory(undefined)} />
              {cats.data?.items.map((cat) => (
                <Chip key={cat.id} label={cat.name} selected={category === cat.slug} onPress={() => onCategory(cat.slug)} />
              ))}
            </ScrollView>
            {rows.some((r) => r.demo) ? <Notice tone="demo">Some prices here are demo data, not live retailer prices.</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          q.isPending ? (
            <View style={{ paddingHorizontal: GUTTER }}>
              <GridSkeleton />
            </View>
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState icon="pricetags-outline" title="Nothing here yet" message={emptyText} />
          )
        }
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
        }}
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: sp[6] }} color={c.primary} /> : <View style={{ height: sp[16] }} />}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
        contentInsetAdjustmentBehavior="automatic"
      />
    </View>
  );
}
