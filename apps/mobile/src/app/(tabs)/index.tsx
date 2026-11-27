import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DealItem } from "@pricora/contracts";
import { BrandLogo } from "@/components/BrandLogo";
import { CategoryCircle, CategoryCircleLink, PhotoCredit, StoreMark } from "@/components/common";
import { CouponCard } from "@/components/CouponCard";
import { ProductRail, RailSkeleton } from "@/components/product";
import { AppText, Button, ErrorState, Notice, OfflineBanner, Row, SectionHeader, Segmented, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TRAVEL_ENABLED } from "@/lib/features";
import { openWebPath } from "@/lib/links";
import { photoSrc, promoPhoto } from "@/lib/photos";
import { useRecentlyViewed } from "@/lib/recent";
import { useTabBarSpace } from "@/lib/tabBar";
import { tokens, typeStyle, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

type Tone = { bg: "primary" | "accent" | "warning-soft" | "success-soft" | "primary-soft"; fg: "primary-fg" | "accent-fg" | "text" | "primary-soft-fg" };
const PROMOS: { photo: string; title: string; sub: string; cta: string; tone: Tone; go: () => void }[] = [
  { photo: "deals", title: "Today's best deals", sub: "Ranked by real price history, not hype", cta: "Shop deals", tone: { bg: "primary", fg: "primary-fg" }, go: () => router.push("/deals") },
  { photo: "price-drops", title: "Biggest price drops", sub: "Prices that actually fell this week", cta: "See drops", tone: { bg: "accent", fg: "accent-fg" }, go: () => router.push("/price-drops") },
  {
    photo: "under-25",
    title: "Under $25",
    sub: "Small prices, compared across stores",
    cta: "Browse",
    tone: { bg: "warning-soft", fg: "text" },
    go: () => router.push({ pathname: "/browse", params: { maxPrice: "2500", sort: "best_deal", title: "Under $25" } }),
  },
  { photo: "coupons", title: "Coupons", sub: "Promo codes with real success reports", cta: "Get codes", tone: { bg: "success-soft", fg: "text" }, go: () => router.push("/coupons") },
  { photo: "smart-basket", title: "Smart Basket", sub: "Cheapest way to buy several items", cta: "Try it", tone: { bg: "primary-soft", fg: "primary-soft-fg" }, go: () => void openWebPath("/basket") },
];

const DISCOUNT_TILES = [
  { big: "10%", small: "or more off", min: "0.1" },
  { big: "25%", small: "or more off", min: "0.25" },
  { big: "50%", small: "or more off", min: "0.5" },
];

/** Price + store of the deal's offer; the real previous price only when that offer is the lowest-price store. */
function dealExtras(d: DealItem | undefined) {
  if (!d) return undefined;
  return {
    storeName: d.offer.retailer.name,
    priceCents: d.offer.priceCents,
    previousPriceCents: d.offer.priceCents === d.product.lowestPriceCents ? (d.product.previousPriceCents ?? null) : null,
  };
}

/** Same rule as web: the "near the lowest price" reason scores ≥ 80% of its weight. */
function nearLow(d: DealItem): boolean {
  const r = d.dealScore.reasons.find((x) => x.factor === "near_all_time_low");
  return Boolean(r && r.weight > 0 && r.points / r.weight >= 0.8);
}

function PromoTile({ p, width, tall }: { p: (typeof PROMOS)[number]; width: number; tall?: boolean }) {
  const { c } = useTheme();
  const photo = promoPhoto(p.photo);
  const imgH = tall ? 120 : 84;
  return (
    <View style={{ width }}>
      <Pressable
        onPress={p.go}
        accessibilityRole="button"
        accessibilityLabel={`${p.title}. ${p.sub}`}
        style={({ pressed }) => ({ borderRadius: tokens.radius.lg, overflow: "hidden", backgroundColor: c[p.tone.bg], opacity: pressed ? 0.9 : 1 })}
      >
        {photo ? (
          <Image
            source={{ uri: photoSrc(photo, width * 2, imgH * 2) }}
            style={{ width, height: imgH, backgroundColor: photo.color }}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={photo.alt}
          />
        ) : null}
        <View style={{ padding: sp[3], gap: sp[2] }}>
          <View>
            <AppText style={[typeStyle(tall ? "xl" : "md", 800), { color: c[p.tone.fg] }]} numberOfLines={2}>
              {p.title}
            </AppText>
            <AppText variant="caption" style={{ color: c[p.tone.fg], opacity: 0.9 }} numberOfLines={2}>
              {p.sub}
            </AppText>
          </View>
          <Row gap={1}>
            <AppText variant="label" style={{ color: c[p.tone.fg] }}>
              {p.cta}
            </AppText>
            <Ionicons name="arrow-forward" size={14} color={c[p.tone.fg]} />
          </Row>
        </View>
      </Pressable>
      {photo ? <PhotoCredit photo={photo} style={{ position: "absolute", top: 6, right: 6 }} /> : null}
    </View>
  );
}

function Band({ tone, children }: { tone: "primary-soft" | "success-soft" | "warning-soft" | "surface-2"; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c[tone], marginHorizontal: -GUTTER, paddingHorizontal: GUTTER, paddingBottom: sp[4], marginTop: sp[6] }}>
      {children}
    </View>
  );
}

export default function HomeScreen() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const recent = useRecentlyViewed();
  const [under, setUnder] = useState<"25" | "50" | "100">("25");
  const tabSpace = useTabBarSpace();

  const home = useQuery({ queryKey: ["home", user?.id ?? null], queryFn: ({ signal }) => api.catalog.home({ signal }) });
  const cats = useQuery({ queryKey: ["home", "categories"], queryFn: ({ signal }) => api.catalog.categories({ signal }), staleTime: 60 * 60_000 });
  const coupons = useQuery({
    queryKey: ["home", "coupons"],
    queryFn: ({ signal }) => api.coupons.list({ sort: "popular", pageSize: 6 }, { signal }),
    staleTime: 10 * 60_000,
  });
  const d = home.data;

  const allDeals = d?.bestDeals ?? [];
  const lowestAll = allDeals.filter(nearLow);
  const lowestCap = Math.max(0, Math.min(16, allDeals.length - 10));
  const lowest = lowestAll.length >= 4 ? lowestAll.slice(0, Math.max(4, lowestCap)) : [];
  const lowestIds = new Set(lowest.map((x) => x.product.id));
  const bestDeals = allDeals.filter((x) => !lowestIds.has(x.product.id)).slice(0, 20);
  const recentItems = d?.recentlyViewed?.length ? d.recentlyViewed : recent.items;
  const underItems = d ? { "25": d.under25, "50": d.under50, "100": d.under100 }[under] : [];

  const half = (width - GUTTER * 2 - sp[3]) / 2;
  const refreshing = home.isRefetching || cats.isRefetching;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: tabSpace }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void home.refetch();
              void cats.refetch();
              void coupons.refetch();
            }}
            tintColor={c.primary}
          />
        }
      >
        <Row style={{ justifyContent: "space-between", marginTop: sp[2] }}>
          <BrandLogo height={26} />
          {TRAVEL_ENABLED ? <Button title="Travel" variant="ghost" size="sm" icon="airplane-outline" onPress={() => router.push("/flights")} /> : null}
        </Row>
        <Pressable
          onPress={() => router.push({ pathname: "/search", params: { focus: "1" } })}
          accessibilityRole="search"
          accessibilityLabel="Search products, brands, UPC"
          style={{
            marginTop: sp[3],
            flexDirection: "row",
            alignItems: "center",
            gap: sp[2],
            minHeight: 48,
            paddingHorizontal: sp[3],
            borderRadius: tokens.radius.full,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c["border-strong"],
          }}
        >
          <Ionicons name="search" size={20} color={c["text-muted"]} />
          <AppText color="text-muted" style={{ flex: 1 }}>
            Search products, brands, UPC
          </AppText>
          <Pressable onPress={() => router.push("/scan")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Scan a barcode">
            <Ionicons name="barcode-outline" size={22} color={c.primary} />
          </Pressable>
        </Pressable>

        {d?.hasDemoData ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="demo">Some prices shown are demo data, not live retailer prices.</Notice>
          </View>
        ) : null}

        {/* Promo tiles: first full width, then 2-up */}
        <View style={{ marginTop: sp[4], gap: sp[3] }}>
          <PromoTile p={PROMOS[0]!} width={width - GUTTER * 2} tall />
          <Row gap={3} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
            {PROMOS.slice(1).map((p) => (
              <PromoTile key={p.photo} p={p} width={half} />
            ))}
          </Row>
        </View>

        {/* Category circles */}
        <SectionHeader title="Shop by category" action={{ label: "All", onPress: () => router.push("/categories") }} />
        {cats.data ? (
          <FlatList
            horizontal
            data={cats.data.items}
            keyExtractor={(x) => x.id}
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -GUTTER }}
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: sp[1] }}
            renderItem={({ item }) => <CategoryCircleLink slug={item.slug} name={item.name} size={68} />}
          />
        ) : (
          <Row gap={3}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width={68} height={68} radius={34} />
            ))}
          </Row>
        )}

        {home.isError && !d ? <ErrorState message={errorMessage(home.error)} onRetry={() => void home.refetch()} /> : null}
        {!d && home.isPending ? (
          <View style={{ marginTop: sp[6], gap: sp[6] }}>
            <RailSkeleton />
            <RailSkeleton />
          </View>
        ) : null}

        {d ? (
          <>
            {lowest.length ? (
              <Band tone="primary-soft">
                <SectionHeader title="Near the lowest price we've tracked" action={{ label: "See all", onPress: () => router.push("/deals") }} />
                <ProductRail
                  items={lowest.map((x) => ({ ...x.product, dealScore: x.dealScore.score }))}
                  extras={(_, i) => dealExtras(lowest[i])}
                />
              </Band>
            ) : null}

            {bestDeals.length ? (
              <Band tone="success-soft">
                <SectionHeader title="Today's best deals" action={{ label: "See all", onPress: () => router.push("/deals") }} />
                <ProductRail
                  items={bestDeals.map((x) => ({ ...x.product, dealScore: x.dealScore.score }))}
                  extras={(_, i) => dealExtras(bestDeals[i])}
                />
              </Band>
            ) : null}

            {/* Discount tiles + alert CTA */}
            <SectionHeader title="Shop by discount" />
            <Row gap={2}>
              {DISCOUNT_TILES.map((t) => (
                <Pressable
                  key={t.min}
                  onPress={() => router.push({ pathname: "/browse", params: { minDiscount: t.min, sort: "biggest_drop", title: `${t.big} or more off` } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.big} ${t.small}`}
                  style={({ pressed }) => ({
                    flex: 1,
                    aspectRatio: 1.2,
                    borderRadius: tokens.radius.md,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <AppText variant="priceLg" color="accent-fg">
                    {t.big}
                  </AppText>
                  <AppText variant="caption" color="accent-fg">
                    {t.small}
                  </AppText>
                </Pressable>
              ))}
            </Row>
            <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
              Discounts are measured against each product’s own tracked price history — never an invented “was” price.
            </AppText>

            <View style={{ marginTop: sp[5], borderRadius: tokens.radius.lg, backgroundColor: c.primary, padding: sp[5], gap: sp[3] }}>
              <Ionicons name="notifications" size={24} color={c["primary-fg"]} />
              <AppText variant="h3" color="primary-fg">
                Get notified when prices drop
              </AppText>
              <AppText color="primary-fg" style={{ opacity: 0.9 }}>
                Set a target price on any product. We’ll send a push or email when a store hits it — free.
              </AppText>
              <Button
                title={user ? "My price alerts" : "Set a price alert"}
                variant="accent"
                icon="arrow-forward"
                style={{ alignSelf: "flex-start" }}
                onPress={() => router.push(user ? "/account/alerts" : "/login")}
              />
            </View>

            {d.priceDrops.length ? (
              <Band tone="warning-soft">
                <SectionHeader title="Biggest price drops" action={{ label: "See all", onPress: () => router.push("/price-drops") }} />
                <ProductRail
                  items={d.priceDrops.map((x) => x.product)}
                  extras={(_, i) => {
                    const x = d.priceDrops[i];
                    return x
                      ? { priceCents: x.currentPriceCents, previousPriceCents: x.previousPriceCents, storeName: x.retailer.name, dropRatio: x.dropRatio }
                      : undefined;
                  }}
                />
                <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
                  Previous vs. current price at the same store.
                </AppText>
              </Band>
            ) : null}

            {d.trending.length ? (
              <>
                <SectionHeader title="Trending now" action={{ label: "See all", onPress: () => router.push("/popular") }} />
                <ProductRail items={d.trending} />
              </>
            ) : null}

            <SectionHeader
              title={`Under $${under}`}
              action={{
                label: "See all",
                onPress: () => router.push({ pathname: "/browse", params: { maxPrice: String(Number(under) * 100), sort: "best_deal", title: `Under $${under}` } }),
              }}
            />
            <Segmented
              options={[
                { value: "25", label: "$25" },
                { value: "50", label: "$50" },
                { value: "100", label: "$100" },
              ]}
              value={under}
              onChange={setUnder}
            />
            <View style={{ marginTop: sp[3] }}>
              <ProductRail items={underItems} />
            </View>
          </>
        ) : null}

        {/* Coupons teaser */}
        {coupons.data?.items.length ? (
          <>
            <SectionHeader title="Coupons & promo codes" action={{ label: "All coupons", onPress: () => router.push("/coupons") }} />
            <FlatList
              horizontal
              data={coupons.data.items}
              keyExtractor={(x) => x.id}
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -GUTTER }}
              contentContainerStyle={{ paddingHorizontal: GUTTER, gap: sp[3] }}
              renderItem={({ item }) => (
                <View style={{ width: Math.min(320, width - GUTTER * 3) }}>
                  <CouponCard coupon={item} />
                </View>
              )}
            />
          </>
        ) : null}

        {recentItems.length ? (
          <>
            <SectionHeader title="Recently viewed" action={!user ? { label: "Clear", onPress: recent.clear } : undefined} />
            <ProductRail items={recentItems} />
          </>
        ) : null}

        {d?.retailers.length ? (
          <Band tone="surface-2">
            <SectionHeader title="Popular stores" />
            <FlatList
              horizontal
              data={d.retailers}
              keyExtractor={(x) => x.id}
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -GUTTER }}
              contentContainerStyle={{ paddingHorizontal: GUTTER, gap: sp[3] }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push({ pathname: "/stores/[slug]", params: { slug: item.slug } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.offerCount} offers`}
                  style={({ pressed }) => ({
                    width: 108,
                    alignItems: "center",
                    gap: sp[2],
                    padding: sp[3],
                    borderRadius: tokens.radius.md,
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderColor: c.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <StoreMark name={item.name} logoUrl={item.logoUrl} brandColor={item.brandColor} size={44} />
                  <AppText variant="label" numberOfLines={1}>
                    {item.name}
                  </AppText>
                  <AppText variant="caption" color="text-muted">
                    {item.offerCount.toLocaleString("en-US")} offers
                  </AppText>
                </Pressable>
              )}
            />
          </Band>
        ) : null}

        {d?.topCategories.length ? (
          <>
            <SectionHeader title="Popular categories" />
            <Row gap={3} style={{ flexWrap: "wrap" }}>
              {d.topCategories.slice(0, 8).map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug: cat.slug } })}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    width: half,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: sp[2],
                    padding: sp[2],
                    borderRadius: tokens.radius.md,
                    backgroundColor: c.surface,
                    borderWidth: 1,
                    borderColor: c.border,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <CategoryCircle slug={cat.slug} name={cat.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label" numberOfLines={1}>
                      {cat.name}
                    </AppText>
                    <AppText variant="caption" color="text-muted">
                      {cat.productCount.toLocaleString("en-US")} products
                    </AppText>
                  </View>
                </Pressable>
              ))}
            </Row>
          </>
        ) : null}

        <Row gap={2} style={{ marginTop: sp[6], flexWrap: "wrap" }}>
          <Button title="New products" variant="secondary" size="sm" icon="sparkles-outline" onPress={() => router.push("/new")} />
          <Button title="Popular" variant="secondary" size="sm" icon="flame-outline" onPress={() => router.push("/popular")} />
          <Button title="Photo credits" variant="ghost" size="sm" onPress={() => router.push("/credits" as Href)} />
        </Row>
      </ScrollView>
    </SafeAreaView>
  );
}
