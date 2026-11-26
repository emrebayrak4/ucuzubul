import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BrandLogo } from "@/components/BrandLogo";
import { ProductRail, RailSkeleton } from "@/components/product";
import {
  AppText,
  Chip,
  ErrorState,
  Notice,
  OfflineBanner,
  PressableRow,
  Row,
  SectionHeader,
  Segmented,
  type IconName,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { brand } from "@/lib/config";
import { useRecentlyViewed } from "@/lib/recent";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
type Under = "under25" | "under50" | "under100";

export default function HomeScreen() {
  const { c } = useTheme();
  const home = useQuery({ queryKey: ["home"], queryFn: ({ signal }) => api.catalog.home({ signal }) });
  const [under, setUnder] = useState<Under>("under25");
  const recent = useRecentlyViewed();
  const d = home.data;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: tokens.layout.gutter.base, paddingBottom: sp[12] }}
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} tintColor={c.primary} />}
      >
        <Row style={{ justifyContent: "space-between", paddingTop: sp[3] }}>
          <View accessibilityRole="header">
            <BrandLogo height={30} />
          </View>
        </Row>
        <AppText color="text-muted" style={{ marginTop: sp[1] }}>
          {brand.tagline}
        </AppText>

        {/* Search entry — one-hand: big target, jumps to Search tab with keyboard open */}
        <PressableRow
          onPress={() => router.push({ pathname: "/search", params: { focus: "1" } })}
          accessibilityLabel="Search products"
          style={{
            marginTop: sp[4],
            minHeight: 48,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: c["border-strong"],
            backgroundColor: c.surface,
            paddingHorizontal: sp[3],
            justifyContent: "center",
          }}
        >
          <Row gap={2}>
            <Ionicons name="search" size={18} color={c["text-muted"]} />
            <AppText variant="bodyLg" color="text-muted">
              Search products, brands, or UPC
            </AppText>
          </Row>
        </PressableRow>

        <Row gap={3} style={{ marginTop: sp[4] }}>
          <TravelCard icon="airplane-outline" title="Flights" subtitle="Compare fares" onPress={() => router.push("/flights")} />
          <TravelCard icon="bed-outline" title="Hotels" subtitle="Compare stays" onPress={() => router.push("/hotels")} />
        </Row>

        {d?.hasDemoData ? (
          <View style={{ marginTop: sp[4] }}>
            <Notice tone="demo">Some prices on this page are demo data, not live retailer prices.</Notice>
          </View>
        ) : null}

        {home.isError && !d ? (
          <ErrorState message={errorMessage(home.error)} onRetry={() => void home.refetch()} />
        ) : (
          <>
            {d && d.topCategories.length > 0 ? (
              <>
                <SectionHeader title="Categories" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: sp[2] }}>
                  {d.topCategories.map((cat) => (
                    <Chip
                      key={cat.id}
                      label={cat.name}
                      onPress={() => router.push({ pathname: "/search", params: { category: cat.slug, label: cat.name } })}
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <SectionHeader title="Today's best deals" />
            {d ? (
              d.bestDeals.length ? <ProductRail items={d.bestDeals.map((x) => x.product)} /> : <EmptyRail />
            ) : (
              <RailSkeleton />
            )}

            <SectionHeader title="Biggest price drops" />
            {d ? (
              d.priceDrops.length ? <ProductRail items={d.priceDrops.map((x) => x.product)} /> : <EmptyRail />
            ) : (
              <RailSkeleton />
            )}

            <SectionHeader title="Under budget" />
            <Segmented
              options={[
                { value: "under25", label: "Under $25" },
                { value: "under50", label: "Under $50" },
                { value: "under100", label: "Under $100" },
              ]}
              value={under}
              onChange={setUnder}
            />
            <View style={{ marginTop: sp[3] }}>
              {d ? d[under].length ? <ProductRail items={d[under]} /> : <EmptyRail /> : <RailSkeleton />}
            </View>

            {d && d.trending.length > 0 ? (
              <>
                <SectionHeader title="Trending" />
                <ProductRail items={d.trending} />
              </>
            ) : null}

            {(d?.recentlyViewed?.length ?? 0) > 0 || recent.items.length > 0 ? (
              <>
                <SectionHeader title="Recently viewed" />
                <ProductRail items={d?.recentlyViewed?.length ? d.recentlyViewed : recent.items} />
              </>
            ) : null}
          </>
        )}

        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[8] }}>
          {brand.name} may earn a commission when you buy through store links. This never changes ranking or Deal Score.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function EmptyRail() {
  return (
    <AppText color="text-muted" style={{ paddingVertical: sp[3] }}>
      Nothing here yet.
    </AppText>
  );
}

function TravelCard({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <PressableRow
      onPress={onPress}
      accessibilityLabel={`${title}: ${subtitle}`}
      style={{
        flex: 1,
        padding: sp[3],
        borderRadius: tokens.radius.lg,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        gap: sp[1],
      }}
    >
      <Ionicons name={icon} size={22} color={c.primary} />
      <AppText variant="h4">{title}</AppText>
      <AppText variant="caption" color="text-muted">
        {subtitle}
      </AppText>
    </PressableRow>
  );
}
