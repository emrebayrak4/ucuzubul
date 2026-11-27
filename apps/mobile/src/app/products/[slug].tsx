import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from "react-native";
import { conditionGroupOf, type ConditionGroup, type DealScoreReason, HistoryRange, ProductAttribute, ProductDetailResponse, ProductVariantLink } from "@pricora/contracts";
import { PriceWithPrevious } from "@/components/common";
import { PayIn4Line } from "@/components/payments";
import { NearbySection } from "@/components/NearbySection";
import { ZipSheet } from "@/components/ZipSheet";
import { CouponCard, CouponChip } from "@/components/CouponCard";
import { HistoryChart } from "@/components/HistoryChart";
import { OfferList } from "@/components/OfferList";
import { ProductRail } from "@/components/product";
import { Sheet } from "@/components/Sheet";
import {
  AppText,
  Button,
  Card,
  Chip,
  DealScoreBadge,
  ErrorState,
  Field,
  IconButton,
  Notice,
  OfflineBanner,
  Row,
  SectionHeader,
  Segmented,
  Skeleton,
} from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isInCompare, toggleCompare, useCompare, compareStore, COMPARE_MAX } from "@/lib/compare";
import { cardFromDetail, conditionGroupLabel, haptic, money, relative } from "@/lib/format";
import { param } from "@/lib/hooks";
import { shareProduct } from "@/lib/links";
import { addRecentlyViewed } from "@/lib/recent";
import { addToBasket } from "@/lib/basket";
import { useZip } from "@/lib/zip";
import { LISTS_KEY, requireLogin, useCreateAlert, useFavoriteToggle, useLists } from "@/lib/saved";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const RANGES = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "180d", label: "6M" },
  { value: "365d", label: "1Y" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: HistoryRange; label: string }[];

export default function ProductScreen() {
  const { c } = useTheme();
  const slug = param(useLocalSearchParams<{ slug: string }>().slug) ?? "";
  const { user } = useAuth();
  const zip = useZip().zip ?? undefined;
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("90d");
  const [alertOpen, setAlertOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [couponsOpen, setCouponsOpen] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);
  const [condPick, setCondPick] = useState<ConditionGroup | null>(null);

  const product = useQuery({
    queryKey: ["product", slug, zip ?? null],
    queryFn: ({ signal }) => api.catalog.product(slug, zip ? { zip } : undefined, { signal }),
    enabled: !!slug,
  });
  const d = product.data;
  /** Offer tab: defaults to the product's default condition (new whenever a new offer exists). Never mixed. */
  const cond: ConditionGroup = condPick ?? d?.defaultCondition ?? "new";
  const history = useQuery({
    queryKey: ["history", slug, range, cond],
    queryFn: ({ signal }) => api.catalog.productHistory(slug, { range, condition: cond }, { signal }),
    enabled: !!slug && !!d,
  });
  const fav = useFavoriteToggle(d?.product.id);
  const compare = useCompare();

  useEffect(() => {
    if (!d) return;
    void addRecentlyViewed(cardFromDetail(d));
    track("product_viewed", {
      productId: d.product.id,
      categorySlug: d.product.category?.slug ?? null,
      offerCount: d.offers.length,
      hasDealScore: !!d.dealScore,
      source: d.offers[0]?.source ?? "demo",
    });
  }, [d]);

  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <OfflineBanner />
        {product.isError ? (
          <ErrorState message={isNotFound(product.error) ? "This product isn't available." : errorMessage(product.error)} onRetry={() => void product.refetch()} />
        ) : (
          <View style={{ padding: GUTTER, gap: sp[3] }}>
            <Skeleton height={260} />
            <Skeleton height={20} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={110} />
            <Skeleton height={160} />
          </View>
        )}
      </View>
    );
  }

  const p = d.product;
  // Everything below (price, stats, Deal Score, offers) refers to ONE condition group.
  const hasGroups = !!d.conditionSummary?.length;
  const view = d.byCondition?.[cond];
  const offers = hasGroups ? d.offers.filter((o) => (o.conditionGroup ?? conditionGroupOf(o.condition)) === cond) : d.offers;
  const lowestOfferId = view ? view.lowestOfferId : d.lowestOfferId;
  const priceStats = view?.priceStats ?? d.priceStats;
  const dealScore = view ? view.dealScore : d.dealScore;
  const fakeDiscount = view?.fakeDiscount ?? d.fakeDiscount;
  const prevLowest = view ? view.previousLowestPriceCents : d.previousLowestPriceCents;
  const condTabs = (d.conditionSummary ?? []).filter((x) => x.offerCount > 0);
  const stale = isStale(d.lastUpdatedAt);
  const allOut = offers.length > 0 && offers.every((o) => o.stock === "out_of_stock");
  const lowest = offers.find((o) => o.id === lowestOfferId) ?? [...offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents)[0];
  const upc = p.identifiers.find((i) => i.type === "UPC" || i.type === "EAN" || i.type === "GTIN");
  const stats = history.data?.stats ?? priceStats;
  const inCompare = isInCompare(compare, p.id);
  const card = cardFromDetail(d);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: p.brand?.name ?? "",
          headerRight: () => <IconButton icon="share-outline" label="Share" onPress={() => void shareProduct(p.slug, p.title)} style={{ borderWidth: 0, backgroundColor: "transparent" }} />,
        }}
      />
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: sp[24] }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={product.isRefetching}
            onRefresh={() => {
              void product.refetch();
              void history.refetch();
            }}
            tintColor={c.primary}
          />
        }
      >
        <Gallery d={d} />

        {p.breadcrumbs.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: sp[3] }}>
            <AppText variant="caption" color="text-muted">
              {p.breadcrumbs.map((b, i) => (
                <AppText
                  key={b.slug}
                  variant="caption"
                  color={i === p.breadcrumbs.length - 1 ? "primary" : "text-muted"}
                  onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug: b.slug } })}
                >
                  {i ? " › " : ""}
                  {b.name}
                </AppText>
              ))}
            </AppText>
          </ScrollView>
        ) : null}

        <AppText variant="h3" style={{ marginTop: sp[2] }} accessibilityRole="header" selectable>
          {p.title}
        </AppText>
        <Row gap={2} style={{ marginTop: sp[1], flexWrap: "wrap" }}>
          {p.brand ? (
            <AppText variant="label" color="primary" onPress={() => router.push({ pathname: "/brands/[slug]", params: { slug: p.brand!.slug } })}>
              {p.brand.name}
            </AppText>
          ) : null}
          {p.model || upc ? (
            <AppText variant="caption" color="text-muted" style={{ fontVariant: ["tabular-nums"] }} selectable>
              {[p.model ? `Model ${p.model}` : null, upc ? `${upc.type} ${upc.value}` : null].filter(Boolean).join(" · ")}
            </AppText>
          ) : null}
        </Row>

        <Variants variants={p.variants} exclude={d.sizeFamily && d.sizeFamily.length > 1 ? ["size"] : []} />
        {d.sizeFamily && d.sizeFamily.length > 1 ? <SizeFamily members={d.sizeFamily} /> : null}

        {d.hasDemoData ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="demo">Prices for this product include demo data, not live retailer prices.</Notice>
          </View>
        ) : null}

        {d.conditionNote ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="info">{d.conditionNote}</Notice>
          </View>
        ) : null}
        {condTabs.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: sp[3], marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
            {condTabs.map((t) => (
              <Chip
                key={t.condition}
                label={`${conditionGroupLabel[t.condition]} · ${t.offerCount}${t.lowestPriceCents !== null ? ` · ${money(t.lowestPriceCents, "USD", "auto")}` : ""}`}
                selected={cond === t.condition}
                onPress={() => {
                  haptic.toggle();
                  setCondPick(t.condition);
                }}
              />
            ))}
          </ScrollView>
        ) : null}

        {allOut ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="warning">Out of stock at every store we track. Set a back-in-stock alert to hear when it returns.</Notice>
          </View>
        ) : null}

        {/* Lowest price block */}
        <Card style={{ marginTop: sp[4], gap: sp[2] }}>
          <AppText variant="overline" color="text-muted">
            {hasGroups && cond !== "new" ? `Lowest ${conditionGroupLabel[cond].toLowerCase()} price` : "Lowest price"}
          </AppText>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }} gap={3}>
            <View style={{ flex: 1 }}>
              <PriceWithPrevious cents={lowest?.priceCents ?? priceStats.currentLowestCents} previousCents={prevLowest} currency={lowest?.currency} size="priceXl" />
              <AppText variant="caption" color="text-muted">
                {lowest ? `at ${lowest.retailer.name}` : "No offers"} · {offers.length} {offers.length === 1 ? "offer" : "offers"}
                {lowest ? ` · est. total ${money(lowest.estimatedTotalCents, lowest.currency)}` : ""}
              </AppText>
              {prevLowest && lowest && prevLowest > lowest.priceCents ? (
                <AppText variant="caption" color="price-drop">
                  Down {money(prevLowest - lowest.priceCents, lowest.currency)} at this store in the last 7 days
                </AppText>
              ) : null}
            </View>
            {dealScore ? <DealScoreBadge score={dealScore.score} size="lg" /> : null}
          </Row>
          {lowest?.unitPrice ? (
            <AppText variant={d.unitPricing ? "label" : "caption"} color={d.unitPricing ? "text" : "text-muted"}>
              Unit price {lowest.unitPrice.label}
              {d.netQuantity ? ` · ${d.netQuantity.label ?? ""}` : ""}
            </AppText>
          ) : null}
          <PayIn4Line payIn4={lowest?.payIn4} />
          {lowest?.tax.status === "unknown_set_zip" ? (
            <AppText variant="caption" color="text-muted" onPress={() => setZipOpen(true)}>
              Totals exclude tax. <AppText variant="caption" color="primary">Set your ZIP</AppText> for estimates.
            </AppText>
          ) : zip ? (
            <AppText variant="caption" color="text-muted" onPress={() => setZipOpen(true)}>
              Est. tax for ZIP {zip} · <AppText variant="caption" color="primary">change</AppText>
            </AppText>
          ) : null}
          <AppText variant="caption" color={stale ? "warning" : "text-muted"}>
            Updated {relative(d.lastUpdatedAt)}
            {stale ? " · prices may have changed since" : ""}
          </AppText>
          <Row gap={2} style={{ marginTop: sp[1], flexWrap: "wrap" }}>
            <IconButton icon={fav.isFavorite ? "heart" : "heart-outline"} label={fav.isFavorite ? "Remove from favorites" : "Add to favorites"} active={fav.isFavorite} onPress={fav.toggle} />
            <IconButton icon="notifications-outline" label="Set price alert" onPress={() => (user ? setAlertOpen(true) : requireLogin())} />
            <IconButton
              icon={inCompare ? "checkmark" : "git-compare-outline"}
              label={inCompare ? "Remove from compare" : "Add to compare"}
              active={inCompare}
              onPress={() => toggleCompare({ id: p.id, slug: p.slug, title: p.title, imageUrl: p.images[0]?.url ?? null })}
            />
            <IconButton icon="list-outline" label="Add to list" onPress={() => (user ? setListOpen(true) : requireLogin("Log in to keep shopping lists."))} />
            <IconButton
              icon="basket-outline"
              label="Add to Smart Basket"
              onPress={() => {
                const r = addToBasket({ id: p.id, slug: p.slug, title: p.title, imageUrl: p.images[0]?.url ?? null });
                Alert.alert(r === "added" ? "Added to Smart Basket" : "Quantity increased", "Find the cheapest way to buy everything in your basket.", [
                  { text: "Keep shopping", style: "cancel" },
                  { text: "View basket", onPress: () => router.push("/basket") },
                ]);
              }}
            />
            <IconButton icon="share-social-outline" label="Share" onPress={() => void shareProduct(p.slug, p.title)} />
          </Row>
        </Card>

        {dealScore ? <DealScoreCard reasons={dealScore.reasons} confidence={dealScore.confidence} /> : null}

        {fakeDiscount.flag && fakeDiscount.message ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="warning">
              <AppText variant="label">Check that discount</AppText>
              <AppText variant="caption">{fakeDiscount.message}</AppText>
            </Notice>
          </View>
        ) : null}

        {d.coupons.length ? (
          <>
            <SectionHeader title={`Coupons available (${d.coupons.length})`} action={{ label: "View", onPress: () => setCouponsOpen(true) }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              {d.coupons.map((cp) => (
                <CouponChip key={cp.id} coupon={cp} onPress={() => setCouponsOpen(true)} />
              ))}
            </ScrollView>
          </>
        ) : null}

        <NearbySection slug={p.slug} />

        {/* Store table */}
        <SectionHeader title={`Compare ${offers.length} ${offers.length === 1 ? "offer" : "offers"}${hasGroups ? ` · ${conditionGroupLabel[cond]}` : ""}`} />
        {offers.length ? (
          <OfferList key={cond} offers={offers} productId={p.id} lowestOfferId={lowestOfferId} limit={6} />
        ) : (
          <AppText color="text-muted">No stores currently list this product.</AppText>
        )}
        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
          We may earn a commission from store links. It never affects ranking or Deal Score.
        </AppText>

        {/* History */}
        <SectionHeader title="Price history" />
        <Segmented
          options={RANGES}
          value={range}
          onChange={(r) => {
            setRange(r);
            track("price_history_viewed", { productId: p.id, range: r });
          }}
        />
        <View style={{ marginTop: sp[3] }}>
          {history.data ? (
            <HistoryChart key={range} data={history.data} />
          ) : history.isError ? (
            <AppText color="text-muted">Price history is unavailable right now.</AppText>
          ) : (
            <Skeleton height={200} />
          )}
        </View>
        <Row gap={3} style={{ marginTop: sp[3], flexWrap: "wrap" }}>
          <Stat label="Lowest ever" value={money(stats.allTimeLowCents)} sub={stats.allTimeLowAt ? relative(stats.allTimeLowAt) : undefined} />
          <Stat label="90-day median" value={money(stats.median90Cents)} />
          <Stat label="30-day avg" value={money(stats.avg30Cents)} />
          <Stat label="90-day range" value={stats.min90Cents !== null ? `${money(stats.min90Cents)}–${money(stats.max90Cents)}` : "—"} />
        </Row>
        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
          Based on {stats.sampleSize} real price observations. Gaps stay gaps — we never fill in prices.
        </AppText>

        {p.attributes.length ? <SpecTable attributes={p.attributes} /> : null}

        {p.identifiers.length ? (
          <AppText variant="caption" color="text-muted" selectable style={{ marginTop: sp[2] }}>
            Identifiers: {p.identifiers.map((i) => `${i.type} ${i.value}${i.retailerSlug ? ` (${i.retailerSlug})` : ""}`).join(" · ")}
          </AppText>
        ) : null}

        {p.description ? (
          <>
            <SectionHeader title="About this product" />
            <AppText color="text-muted">{p.description}</AppText>
          </>
        ) : null}

        {d.alternatives.length ? (
          <>
            <SectionHeader title="Compared with" />
            <AppText variant="caption" color="text-muted" style={{ marginBottom: sp[2] }}>
              Other brands in the same category and price band.
            </AppText>
            <ProductRail items={d.alternatives} />
            <Button
              title="Compare these side by side"
              icon="git-compare-outline"
              variant="secondary"
              style={{ marginTop: sp[3] }}
              onPress={() => {
                const picks = [card, ...d.alternatives].slice(0, COMPARE_MAX);
                compareStore.set(picks.map((x) => ({ id: x.id, slug: x.slug, title: x.title, imageUrl: x.image?.url ?? null })));
                haptic.toggle();
                router.push("/compare");
              }}
            />
          </>
        ) : null}

        {d.related.length ? (
          <>
            <SectionHeader title="Similar products" />
            <ProductRail items={d.related} />
          </>
        ) : null}
      </ScrollView>

      <AlertSheet visible={alertOpen} onClose={() => setAlertOpen(false)} productId={p.id} currentCents={lowest?.priceCents ?? null} condition={cond} />
      <ZipSheet visible={zipOpen} onClose={() => setZipOpen(false)} />
      <ListSheet visible={listOpen} onClose={() => setListOpen(false)} productId={p.id} />
      <Sheet visible={couponsOpen} onClose={() => setCouponsOpen(false)} title="Coupons for this product">
        {d.coupons.map((cp) => (
          <CouponCard key={cp.id} coupon={cp} />
        ))}
      </Sheet>
    </View>
  );
}

/** Older than 48 h → "prices may have changed" (outside render so the compiler's purity rule holds). */
function isStale(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 48 * 3600_000;
}

function Gallery({ d }: { d: ProductDetailResponse }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const w = width - GUTTER * 2;
  const [index, setIndex] = useState(0);
  const images = d.product.images;
  if (!images.length) {
    return (
      <View style={{ height: 220, marginTop: sp[2], borderRadius: tokens.radius.lg, backgroundColor: c["surface-2"], alignItems: "center", justifyContent: "center", gap: sp[2] }}>
        <Ionicons name="image-outline" size={56} color={c["text-muted"]} />
        <AppText variant="caption" color="text-muted">
          No licensed product image yet
        </AppText>
      </View>
    );
  }
  return (
    <View style={{ marginTop: sp[2] }}>
      <FlatList
        horizontal
        pagingEnabled
        data={images}
        keyExtractor={(img, i) => img.url + i}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))}
        renderItem={({ item }) => (
          <View style={{ width: w, height: 260, borderRadius: tokens.radius.lg, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            <Image source={{ uri: item.url }} style={{ width: w - 24, height: 240 }} contentFit="contain" accessibilityLabel={item.alt} cachePolicy="memory-disk" />
          </View>
        )}
      />
      {images.length > 1 ? (
        <Row gap={1.5} style={{ justifyContent: "center", marginTop: sp[2] }}>
          {images.map((img, i) => (
            <View key={img.url + i} style={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? c.primary : c["border-strong"] }} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Variant switcher: one chip row per differing attribute (falls back to variant labels). */
function Variants({ variants, exclude = [] }: { variants: ProductVariantLink[]; exclude?: string[] }) {
  const excludeKey = exclude.join(",");
  const groups = useMemo(() => {
    const excluded = excludeKey ? excludeKey.split(",") : [];
    if (variants.length < 2) return [];
    const keys = [...new Set(variants.flatMap((v) => Object.keys(v.attributes)))].filter(
      (k) => !excluded.includes(k.toLowerCase()) && new Set(variants.map((v) => v.attributes[k])).size > 1,
    );
    return keys;
  }, [variants, excludeKey]);
  if (variants.length < 2) return null;
  // Every differing attribute is shown elsewhere (e.g. sizes under "Compare sizes").
  if (!groups.length && exclude.length) return null;
  const current = variants.find((v) => v.current);
  const go = (v: ProductVariantLink) => {
    if (v.current) return;
    haptic.toggle();
    router.replace({ pathname: "/products/[slug]", params: { slug: v.slug } });
  };
  if (!groups.length || !current) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: sp[3], marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
        {variants.map((v) => (
          <Chip key={v.slug} label={`${v.label}${v.lowestPriceCents !== null ? ` · ${money(v.lowestPriceCents, "USD", "auto")}` : ""}`} selected={v.current} onPress={() => go(v)} />
        ))}
      </ScrollView>
    );
  }
  return (
    <View style={{ marginTop: sp[3], gap: sp[2] }}>
      {groups.map((key) => {
        const values = [...new Set(variants.map((v) => v.attributes[key]).filter((x): x is string => !!x))];
        return (
          <View key={key} style={{ gap: sp[1] }}>
            <AppText variant="label" color="text-muted">
              {key}: <AppText variant="label">{current.attributes[key]}</AppText>
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              {values.map((val) => {
                // Best match: same value for this key, as many other attributes as possible equal to current.
                const candidates = variants.filter((v) => v.attributes[key] === val);
                const best = candidates.sort(
                  (a, b) =>
                    Object.keys(current.attributes).filter((k) => b.attributes[k] === current.attributes[k]).length -
                    Object.keys(current.attributes).filter((k) => a.attributes[k] === current.attributes[k]).length,
                )[0];
                if (!best) return null;
                return (
                  <Chip
                    key={val}
                    label={`${val}${best.lowestPriceCents !== null && !best.current ? ` · ${money(best.lowestPriceCents, "USD", "auto")}` : ""}`}
                    selected={current.attributes[key] === val}
                    onPress={() => go(best)}
                  />
                );
              })}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
}

/** "Compare sizes": other sizes of the same product line (separate products), best unit price marked. */
function SizeFamily({ members }: { members: NonNullable<ProductDetailResponse["sizeFamily"]> }) {
  return (
    <View style={{ marginTop: sp[3], gap: sp[1] }}>
      <AppText variant="label" color="text-muted">
        Compare sizes
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
        {members.map((m) => (
          <Chip
            key={m.slug}
            icon={m.bestValue ? "ribbon-outline" : undefined}
            label={[m.label, m.lowestPriceCents !== null ? money(m.lowestPriceCents, "USD", "auto") : null, m.unitPrice?.label, m.bestValue ? "Best value" : null].filter(Boolean).join(" · ")}
            selected={m.current}
            onPress={() => {
              if (m.current) return;
              haptic.toggle();
              router.replace({ pathname: "/products/[slug]", params: { slug: m.slug } });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function DealScoreCard({ reasons, confidence }: { reasons: DealScoreReason[]; confidence: number }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ marginTop: sp[3], gap: sp[2] }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Row style={{ justifyContent: "space-between" }}>
          <AppText variant="label">Why this Deal Score</AppText>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={c["text-muted"]} />
        </Row>
      </Pressable>
      {confidence < 0.5 ? (
        <AppText variant="caption" color="text-muted">
          Low confidence: limited price history or few stores.
        </AppText>
      ) : null}
      {open
        ? reasons.map((r) => (
            <View key={r.factor} style={{ gap: 4 }}>
              <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} gap={3}>
                <AppText style={{ flex: 1 }}>{r.message}</AppText>
                <AppText variant="priceSm" color="text-muted">
                  {Math.round(r.points)}/{r.weight}
                </AppText>
              </Row>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: c["surface-3"] }}>
                <View style={{ width: `${r.weight > 0 ? Math.round((r.points / r.weight) * 100) : 0}%`, height: 4, borderRadius: 2, backgroundColor: c.primary }} />
              </View>
            </View>
          ))
        : null}
      <AppText variant="caption" color="text-muted">
        Deal Score compares today’s price with this product’s own history and other stores. Sponsored placement can’t change it.
      </AppText>
    </Card>
  );
}

function SpecTable({ attributes }: { attributes: ProductAttribute[] }) {
  const { c } = useTheme();
  const [all, setAll] = useState(false);
  const groups = useMemo(() => {
    const m = new Map<string, ProductAttribute[]>();
    for (const a of attributes) {
      const g = a.group ?? "Specifications";
      m.set(g, [...(m.get(g) ?? []), a]);
    }
    return [...m.entries()];
  }, [attributes]);
  let shown = 0;
  return (
    <>
      <SectionHeader title="Specifications" />
      <Card padded={false}>
        {groups.map(([g, attrs]) => {
          if (!all && shown >= 12) return null;
          const visible = all ? attrs : attrs.slice(0, Math.max(0, 12 - shown));
          shown += visible.length;
          return (
            <View key={g}>
              {groups.length > 1 ? (
                <View style={{ backgroundColor: c["surface-2"], paddingHorizontal: sp[3], paddingVertical: sp[1.5] }}>
                  <AppText variant="overline" color="text-muted">
                    {g}
                  </AppText>
                </View>
              ) : null}
              {visible.map((a, i) => (
                <Row key={a.name + i} style={{ paddingHorizontal: sp[3], paddingVertical: sp[2], borderTopWidth: i ? 1 : 0, borderColor: c.border, alignItems: "flex-start" }} gap={3}>
                  <AppText color="text-muted" style={{ flex: 1 }}>
                    {a.name}
                  </AppText>
                  <AppText style={{ flex: 1.2 }} selectable>
                    {a.value + (a.unit ? ` ${a.unit}` : "")}
                  </AppText>
                </Row>
              ))}
            </View>
          );
        })}
      </Card>
      {attributes.length > 12 ? <Button title={all ? "Show fewer specs" : `Show all ${attributes.length} specs`} variant="ghost" onPress={() => setAll((v) => !v)} /> : null}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ minWidth: 130, flexGrow: 1 }}>
      <AppText variant="caption" color="text-muted">
        {label}
      </AppText>
      <AppText variant="priceSm">{value}</AppText>
      {sub ? (
        <AppText variant="caption" color="text-muted">
          {sub}
        </AppText>
      ) : null}
    </View>
  );
}

function ListSheet({ visible, onClose, productId }: { visible: boolean; onClose: () => void; productId: string }) {
  const lists = useLists();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: async (listId: string | null) => {
      const id = listId ?? (await api.me.lists.create({ name: name.trim(), isPublic: false })).id;
      return api.me.lists.addItem(id, { productId, quantity: 1 });
    },
    onSuccess: (l) => {
      haptic.success();
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
      onClose();
      Alert.alert("Added", `Added to “${l.name}”.`);
    },
    onError: (e) => Alert.alert("Couldn't add", errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Add to a list">
      {lists.data?.items.map((l) => (
        <Button key={l.id} title={`${l.name} (${l.itemCount})`} variant="secondary" icon="list-outline" onPress={() => add.mutate(l.id)} disabled={add.isPending} />
      ))}
      <Field label="New list" placeholder="e.g. Holiday gifts" value={name} onChangeText={setName} maxLength={80} />
      <Button title="Create list and add" disabled={!name.trim()} loading={add.isPending} onPress={() => add.mutate(null)} />
    </Sheet>
  );
}

function AlertSheet({
  visible,
  onClose,
  productId,
  currentCents,
  condition,
}: {
  visible: boolean;
  onClose: () => void;
  productId: string;
  currentCents: number | null;
  condition: ConditionGroup;
}) {
  const create = useCreateAlert();
  const suggested = currentCents ? Math.floor((currentCents * 0.9) / 100) : null;
  const [target, setTarget] = useState(suggested ? String(suggested) : "");
  const [push, setPush] = useState(true);
  const [kind, setKind] = useState<"below_price" | "drop_percent" | "all_time_low" | "back_in_stock" | "new_cheaper_store">("below_price");
  const [pct, setPct] = useState(10);
  const cents = Math.round(Number.parseFloat(target.replace(/[^0-9.]/g, "")) * 100);
  const valid = kind !== "below_price" || (Number.isFinite(cents) && cents > 0);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Price alert"
      primary={{
        label: "Create alert",
        loading: create.isPending,
        disabled: !valid,
        onPress: () =>
          create.mutate(
            {
              productId,
              type: kind,
              targetPriceCents: kind === "below_price" ? cents : undefined,
              dropPercentBp: kind === "drop_percent" ? pct * 100 : undefined,
              condition,
              channels: push ? ["in_app", "email", "push"] : ["in_app", "email"],
            },
            {
              onSuccess: () => {
                haptic.success();
                onClose();
                Alert.alert("Alert created", "We'll let you know when it happens. Manage alerts in Account → Price alerts.");
              },
              onError: (e) => Alert.alert("Couldn't create alert", errorMessage(e)),
            },
          ),
      }}
    >
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        <Chip label="Below a price" selected={kind === "below_price"} onPress={() => setKind("below_price")} />
        <Chip label="Drops by %" selected={kind === "drop_percent"} onPress={() => setKind("drop_percent")} />
        <Chip label="All-time low" selected={kind === "all_time_low"} onPress={() => setKind("all_time_low")} />
        <Chip label="Back in stock" selected={kind === "back_in_stock"} onPress={() => setKind("back_in_stock")} />
        <Chip label="New cheaper store" selected={kind === "new_cheaper_store"} onPress={() => setKind("new_cheaper_store")} />
      </Row>
      {kind === "below_price" ? (
        <Field
          label="Notify me when the price is at or below (USD)"
          keyboardType="decimal-pad"
          value={target}
          onChangeText={setTarget}
          hint={currentCents ? `Current lowest price: ${money(currentCents)}` : undefined}
        />
      ) : null}
      {kind === "below_price" && currentCents ? (
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {[5, 10, 20].map((pct) => (
            <Chip key={pct} label={`−${pct}%`} onPress={() => setTarget(String(Math.floor((currentCents * (100 - pct)) / 100) / 100))} />
          ))}
        </Row>
      ) : null}
      {kind === "drop_percent" ? (
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {[5, 10, 15, 20, 30].map((v) => (
            <Chip key={v} label={`${v}%`} selected={pct === v} onPress={() => setPct(v)} />
          ))}
        </Row>
      ) : null}
      <Chip label="Also send push notifications" icon={push ? "checkbox" : "square-outline"} selected={push} onPress={() => setPush((v) => !v)} />
    </Sheet>
  );
}
