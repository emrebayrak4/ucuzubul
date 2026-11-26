import Ionicons from "@expo/vector-icons/Ionicons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import type { HotelSearchQueryInput, HotelSummary } from "@pricora/contracts";
import { formatTravelDate } from "@pricora/utils";
import { RowSkeleton } from "@/components/product";
import { ProviderStrip } from "@/components/travel";
import { AppText, Chip, DemoBadge, EmptyState, ErrorState, Notice, OfflineBanner, PressableRow, Row } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { isDemo, money } from "@/lib/format";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
type Sort = NonNullable<HotelSearchQueryInput["sort"]>;
const SORTS: { value: Sort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price: low" },
  { value: "price_desc", label: "Price: high" },
  { value: "stars_desc", label: "Stars" },
];

export default function HotelResults() {
  const { c } = useTheme();
  const p = useLocalSearchParams<{ city: string; checkin: string; checkout: string; guests?: string; rooms?: string }>();
  const [sort, setSort] = useState<Sort>("recommended");
  const query = useMemo(
    () => ({
      city: param(p.city) ?? "",
      checkin: param(p.checkin) ?? "",
      checkout: param(p.checkout) ?? "",
      guests: Number(param(p.guests) ?? 2),
      rooms: Number(param(p.rooms) ?? 1),
      sort,
    }),
    [p.city, p.checkin, p.checkout, p.guests, p.rooms, sort],
  );
  const res = useInfiniteQuery({
    queryKey: ["hotels", query],
    queryFn: ({ pageParam, signal }) => api.travel.hotels({ ...query, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, pg) => n + pg.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? last.page + 1 : undefined;
    },
    staleTime: 5 * 60_000,
  });
  const first = res.data?.pages[0];
  const items = useMemo(() => res.data?.pages.flatMap((pg) => pg.items) ?? [], [res.data]);

  useEffect(() => {
    if (first && res.data?.pages.length === 1) {
      track("hotel_search", { destinationType: "city", nights: first.nights, guests: query.guests, rooms: query.rooms, resultCount: first.total, providerCount: first.providers.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={items}
        keyExtractor={(h) => h.id}
        contentContainerStyle={{ padding: tokens.layout.gutter.base, gap: sp[3], paddingBottom: sp[12] }}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (res.hasNextPage && !res.isFetchingNextPage) void res.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: sp[3] }}>
            <AppText variant="h3">{query.city}</AppText>
            <AppText color="text-muted">
              {formatTravelDate(query.checkin)} – {formatTravelDate(query.checkout)} · {query.guests} guests · {query.rooms} {query.rooms === 1 ? "room" : "rooms"}
            </AppText>
            {first ? <ProviderStrip providers={first.providers} /> : null}
            {first && isDemo(first.source) ? <Notice tone="demo">These rates are demo data, not bookable live prices.</Notice> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp[2] }}>
              {SORTS.map((s) => (
                <Chip key={s.value} label={s.label} selected={sort === s.value} onPress={() => setSort(s.value)} />
              ))}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => <HotelCard h={item} nights={first?.nights ?? 1} query={query} />}
        ListEmptyComponent={
          res.isPending ? (
            <RowSkeleton count={4} />
          ) : res.isError ? (
            <ErrorState message={errorMessage(res.error)} onRetry={() => void res.refetch()} />
          ) : first?.source === "none" && first.providers.every((pr) => pr.status !== "live") ? (
            <EmptyState icon="bed-outline" title="No hotel providers connected yet" message="Hotel search goes live once a provider is configured. We don't show made-up rates." />
          ) : (
            <EmptyState icon="bed-outline" title="No hotels found" message="Try different dates or a nearby city." />
          )
        }
        ListFooterComponent={res.isFetchingNextPage ? <RowSkeleton count={1} /> : undefined}
      />
    </View>
  );
}

function HotelCard({ h, nights, query }: { h: HotelSummary; nights: number; query: { checkin: string; checkout: string; guests: number; rooms: number } }) {
  const { c } = useTheme();
  return (
    <PressableRow
      accessibilityLabel={`${h.name}, ${h.stars ? `${h.stars}-star hotel, ` : ""}from ${money(h.lowestNightlyCents, h.currency)} per night`}
      onPress={() =>
        router.push({
          pathname: "/hotels/[id]",
          params: { id: h.id, checkin: query.checkin, checkout: query.checkout, guests: String(query.guests), rooms: String(query.rooms) },
        })
      }
      style={{ borderWidth: 1, borderColor: c.border, borderRadius: tokens.radius.lg, backgroundColor: c.surface, overflow: "hidden" }}
    >
      <View style={{ aspectRatio: 16 / 9, backgroundColor: c["surface-2"], alignItems: "center", justifyContent: "center" }}>
        {h.imageUrl ? (
          <Image source={{ uri: h.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" accessibilityLabel={h.name} />
        ) : (
          <Ionicons name="bed-outline" size={36} color={c["text-muted"]} />
        )}
      </View>
      <View style={{ padding: sp[3], gap: sp[1] }}>
        <AppText variant="h4" numberOfLines={2}>
          {h.name}
        </AppText>
        <Row gap={2}>
          {h.stars ? (
            <Row gap={0.5}>
              {Array.from({ length: Math.round(h.stars) }, (_, i) => (
                <Ionicons key={i} name="star" size={12} color={c["text-muted"]} />
              ))}
            </Row>
          ) : null}
          <AppText variant="caption" color="text-muted" numberOfLines={1} style={{ flex: 1 }}>
            {[h.address, h.city].filter(Boolean).join(", ")}
          </AppText>
        </Row>
        {h.amenities.length ? (
          <AppText variant="caption" color="text-muted" numberOfLines={1}>
            {h.amenities.slice(0, 4).join(" · ")}
          </AppText>
        ) : null}
        <Row style={{ justifyContent: "space-between", alignItems: "flex-end", marginTop: sp[1] }}>
          <View>
            <AppText variant="price">
              {h.lowestNightlyCents !== null ? `from ${money(h.lowestNightlyCents, h.currency)}/night` : "No rates"}
            </AppText>
            {h.lowestTotalCents !== null ? (
              <AppText variant="caption" color="text-muted">
                {money(h.lowestTotalCents, h.currency)} total · {nights} {nights === 1 ? "night" : "nights"}
              </AppText>
            ) : null}
          </View>
          {h.source === "demo" ? <DemoBadge /> : null}
        </Row>
      </View>
    </PressableRow>
  );
}
