import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import type { CouponListQuery } from "@pricora/contracts";
import { ToolbarButton } from "@/components/browse/ProductBrowser";
import { StoreMark } from "@/components/common";
import { CouponCard } from "@/components/CouponCard";
import { Sheet } from "@/components/Sheet";
import { AppText, Button, Chip, EmptyState, ErrorState, Field, Notice, OfflineBanner, Row, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useFollowStore } from "@/lib/coupons";
import { haptic } from "@/lib/format";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
type Sort = CouponListQuery["sort"];
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
  { value: "success_rate", label: "Works best" },
  { value: "expiring", label: "Expiring soon" },
];

/** Coupons across stores: store filter, sort, show/copy code, get deal, worked? votes, follow a store's coupons. */
export default function CouponsScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ store?: string }>();
  const [store, setStore] = useState<string | undefined>(param(params.store));
  const [sort, setSort] = useState<Sort>("newest");
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeQ, setStoreQ] = useState("");
  const follow = useFollowStore(store);

  const retailers = useQuery({ queryKey: ["retailers"], queryFn: ({ signal }) => api.catalog.retailers({ signal }), staleTime: 60 * 60_000 });
  const q = useInfiniteQuery({
    queryKey: ["coupons", "list", store ?? null, sort],
    queryFn: ({ pageParam, signal }) => api.coupons.list({ retailer: store, sort, page: pageParam, pageSize: 20 }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const storeName = retailers.data?.items.find((r) => r.slug === store)?.name ?? store;
  const storeList = (retailers.data?.items ?? []).filter((r) => !storeQ || r.name.toLowerCase().includes(storeQ.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: GUTTER, marginBottom: sp[3] }}>
            <CouponCard coupon={item} />
          </View>
        )}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: GUTTER, paddingTop: sp[2], gap: sp[3], marginBottom: sp[3] }}>
            <AppText color="text-muted">
              Success rates come only from real “worked / didn’t work” reports. Codes marked Demo are placeholders for development.
            </AppText>
            <Row gap={2} style={{ flexWrap: "wrap" }}>
              <ToolbarButton icon="storefront-outline" label={store ? (storeName ?? "Store") : "All stores"} badge={store ? 1 : undefined} onPress={() => setStoreOpen(true)} />
              {store ? (
                <Button
                  title={follow.following ? "Following" : "Follow store"}
                  icon={follow.following ? "notifications" : "notifications-outline"}
                  variant={follow.following ? "secondary" : "primary"}
                  size="sm"
                  loading={follow.pending}
                  onPress={follow.toggle}
                />
              ) : null}
              {store ? <Button title="Store page" variant="ghost" size="sm" onPress={() => router.push({ pathname: "/stores/[slug]", params: { slug: store } })} /> : null}
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              {SORTS.map((s) => (
                <Chip
                  key={s.value}
                  label={s.label}
                  selected={sort === s.value}
                  onPress={() => {
                    haptic.toggle();
                    setSort(s.value);
                  }}
                />
              ))}
            </ScrollView>
            {items.some((x) => x.source === "demo") ? <Notice tone="demo">Some coupons are demo data and won’t work at the store.</Notice> : null}
          </View>
        }
        ListEmptyComponent={
          q.isPending ? (
            <View style={{ paddingHorizontal: GUTTER, gap: sp[3] }}>
              <Skeleton height={180} />
              <Skeleton height={180} />
            </View>
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <EmptyState
              icon="pricetag-outline"
              title="No coupons right now"
              message={store ? "Follow this store and we'll notify you when a new code appears." : "Check back soon."}
            />
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
      <Sheet visible={storeOpen} onClose={() => setStoreOpen(false)} title="Filter by store">
        <Field placeholder="Search stores" value={storeQ} onChangeText={setStoreQ} autoCorrect={false} />
        <Pressable
          onPress={() => {
            setStore(undefined);
            setStoreOpen(false);
          }}
          accessibilityRole="radio"
          accessibilityState={{ checked: !store }}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <AppText variant={!store ? "label" : "body"} color={!store ? "primary" : "text"}>
            All stores
          </AppText>
        </Pressable>
        {storeList.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => {
              haptic.toggle();
              setStore(r.slug);
              setStoreOpen(false);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: store === r.slug }}
            style={{ flexDirection: "row", alignItems: "center", gap: sp[3], minHeight: 48 }}
          >
            <StoreMark name={r.name} logoUrl={r.logoUrl} brandColor={r.brandColor} size={28} />
            <AppText variant={store === r.slug ? "label" : "body"} color={store === r.slug ? "primary" : "text"} style={{ flex: 1 }}>
              {r.name}
            </AppText>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
