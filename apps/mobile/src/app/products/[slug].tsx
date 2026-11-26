import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, View } from "react-native";
import type { HistoryRange } from "@pricora/contracts";
import { OfferList } from "@/components/OfferList";
import { PriceChart } from "@/components/PriceChart";
import { ProductImage, ProductRail } from "@/components/product";
import { Sheet } from "@/components/Sheet";
import {
  AppText,
  Card,
  Chip,
  DealScoreBadge,
  DemoBadge,
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
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cardFromDetail, money, relative } from "@/lib/format";
import { param } from "@/lib/hooks";
import { shareProduct } from "@/lib/links";
import { addRecentlyViewed } from "@/lib/recent";
import { requireLogin, useCreateAlert, useFavoriteToggle } from "@/lib/saved";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const RANGES = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "365d", label: "1Y" },
  { value: "all", label: "All" },
] as const satisfies readonly { value: HistoryRange; label: string }[];

export default function ProductScreen() {
  const { c } = useTheme();
  const slug = param(useLocalSearchParams<{ slug: string }>().slug) ?? "";
  const { user } = useAuth();
  const zip = user?.zip ?? undefined;
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("90d");
  const [reasonsOpen, setReasonsOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const product = useQuery({
    queryKey: ["product", slug, zip ?? null],
    queryFn: ({ signal }) => api.catalog.product(slug, zip ? { zip } : undefined, { signal }),
    enabled: !!slug,
  });
  const history = useQuery({
    queryKey: ["history", slug, range],
    queryFn: ({ signal }) => api.catalog.productHistory(slug, { range }, { signal }),
    enabled: !!slug,
  });
  const d = product.data;
  const fav = useFavoriteToggle(d?.product.id);

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
          <ErrorState
            message={product.error && "status" in product.error && product.error.status === 404 ? "This product isn't available." : errorMessage(product.error)}
            onRetry={() => void product.refetch()}
          />
        ) : (
          <View style={{ padding: sp[4], gap: sp[3] }}>
            <Skeleton height={240} />
            <Skeleton height={20} />
            <Skeleton height={20} width="60%" />
            <Skeleton height={36} width={140} />
            <Skeleton height={120} />
          </View>
        )}
      </View>
    );
  }

  const p = d.product;
  const lowest = d.offers.find((o) => o.id === d.lowestOfferId) ?? [...d.offers].sort((a, b) => a.estimatedTotalCents - b.estimatedTotalCents)[0];
  const upc = p.identifiers.find((i) => i.type === "UPC" || i.type === "EAN" || i.type === "GTIN");
  const stats = history.data?.stats ?? d.priceStats;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: p.brand?.name ?? "" }} />
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ padding: tokens.layout.gutter.base, paddingBottom: sp[16] }}
        refreshControl={<RefreshControl refreshing={product.isRefetching} onRefresh={() => void product.refetch()} tintColor={c.primary} />}
      >
        <View style={{ alignItems: "center" }}>
          <ProductImage uri={p.images[0]?.url} size={240} alt={p.images[0]?.alt ?? p.title} />
        </View>

        <AppText variant="h3" style={{ marginTop: sp[4] }} accessibilityRole="header">
          {p.title}
        </AppText>
        {p.model || upc ? (
          <AppText variant="caption" color="text-muted" style={{ marginTop: sp[1], fontVariant: ["tabular-nums"] }}>
            {[p.model ? `Model ${p.model}` : null, upc ? `${upc.type} ${upc.value}` : null].filter(Boolean).join(" · ")}
          </AppText>
        ) : null}

        {d.hasDemoData ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="demo">Prices for this product include demo data, not live retailer prices.</Notice>
          </View>
        ) : null}

        {/* Lowest price block */}
        <Card style={{ marginTop: sp[4], gap: sp[2] }}>
          <AppText variant="overline" color="text-muted">
            Lowest estimated total
          </AppText>
          <Row style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <AppText variant="priceXl">{lowest ? money(lowest.estimatedTotalCents, lowest.currency) : "—"}</AppText>
              <AppText variant="caption" color="text-muted">
                {lowest ? `at ${lowest.retailer.name}` : "No offers"} · {d.storeCount} {d.storeCount === 1 ? "store" : "stores"}
              </AppText>
            </View>
            {d.dealScore ? <DealScoreBadge score={d.dealScore.score} size="lg" /> : null}
          </Row>
          {lowest?.tax.status === "unknown_set_zip" ? (
            <AppText variant="caption" color="text-muted">
              Totals exclude tax. Set your ZIP in Account for estimates.
            </AppText>
          ) : null}
          <AppText variant="caption" color="text-muted">
            Updated {relative(d.lastUpdatedAt)}
          </AppText>
          <Row gap={2} style={{ marginTop: sp[1] }}>
            <IconButton
              icon={fav.isFavorite ? "heart" : "heart-outline"}
              label={fav.isFavorite ? "Remove from favorites" : "Add to favorites"}
              active={fav.isFavorite}
              onPress={fav.toggle}
            />
            <IconButton icon="notifications-outline" label="Set price alert" onPress={() => (user ? setAlertOpen(true) : requireLogin())} />
            <IconButton icon="share-outline" label="Share" onPress={() => void shareProduct(p.slug, p.title)} />
          </Row>
        </Card>

        {/* Deal Score reasons */}
        {d.dealScore ? (
          <Card style={{ marginTop: sp[3], gap: sp[2] }}>
            <Row style={{ justifyContent: "space-between" }}>
              <AppText variant="label">Why this Deal Score</AppText>
              <Chip label={reasonsOpen ? "Hide" : "Show"} onPress={() => setReasonsOpen((v) => !v)} />
            </Row>
            {d.dealScore.confidence < 0.5 ? (
              <AppText variant="caption" color="text-muted">
                Low confidence: limited price history or few stores.
              </AppText>
            ) : null}
            {reasonsOpen
              ? d.dealScore.reasons.map((r) => (
                  <Row key={r.factor} style={{ justifyContent: "space-between", alignItems: "flex-start" }} gap={3}>
                    <AppText style={{ flex: 1 }}>{r.message}</AppText>
                    <AppText variant="priceSm" color="text-muted">
                      {Math.round(r.points)}/{r.weight}
                    </AppText>
                  </Row>
                ))
              : null}
          </Card>
        ) : null}

        {d.fakeDiscount.flag && d.fakeDiscount.message ? (
          <View style={{ marginTop: sp[3] }}>
            <Notice tone="warning">{d.fakeDiscount.message}</Notice>
          </View>
        ) : null}

        {/* Offers */}
        <SectionHeader title={`Offers (${d.offers.length})`} />
        {d.offers.length ? (
          <OfferList offers={d.offers} productId={p.id} lowestOfferId={d.lowestOfferId} />
        ) : (
          <AppText color="text-muted">No stores currently list this product.</AppText>
        )}
        <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
          We may earn a commission from store links. It never affects ranking or Deal Score.
        </AppText>

        {/* History */}
        <SectionHeader title="Price history" />
        <Segmented options={RANGES} value={range} onChange={setRange} />
        <View style={{ marginTop: sp[3] }}>
          {history.data ? (
            <>
              <PriceChart points={history.data.lowest} currency={history.data.currency} />
              {history.data.series.some((s) => s.source === "demo") ? (
                <View style={{ marginTop: sp[2] }}>
                  <DemoBadge />
                </View>
              ) : null}
            </>
          ) : history.isError ? (
            <AppText color="text-muted">Price history is unavailable right now.</AppText>
          ) : (
            <Skeleton height={140} />
          )}
        </View>
        <Row gap={3} style={{ marginTop: sp[3], flexWrap: "wrap" }}>
          <Stat label="Lowest ever" value={money(stats.allTimeLowCents)} />
          <Stat label="90-day median" value={money(stats.median90Cents)} />
          <Stat label="30-day avg" value={money(stats.avg30Cents)} />
        </Row>

        {p.attributes.length ? (
          <>
            <SectionHeader title="Specs" />
            <Card padded={false}>
              {p.attributes.slice(0, 20).map((a, i) => (
                <Row
                  key={a.name + i}
                  style={{ paddingHorizontal: sp[3], paddingVertical: sp[2], borderTopWidth: i ? 1 : 0, borderColor: c.border }}
                  gap={3}
                >
                  <AppText color="text-muted" style={{ flex: 1 }}>
                    {a.name}
                  </AppText>
                  <AppText style={{ flex: 1 }}>{a.value + (a.unit ? ` ${a.unit}` : "")}</AppText>
                </Row>
              ))}
            </Card>
          </>
        ) : null}

        {d.related.length ? (
          <>
            <SectionHeader title="Similar products" />
            <ProductRail items={d.related} />
          </>
        ) : null}
      </ScrollView>

      <AlertSheet
        visible={alertOpen}
        onClose={() => setAlertOpen(false)}
        productId={p.id}
        currentCents={lowest?.priceCents ?? null}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 96, flexGrow: 1 }}>
      <AppText variant="caption" color="text-muted">
        {label}
      </AppText>
      <AppText variant="priceSm">{value}</AppText>
    </View>
  );
}

function AlertSheet({
  visible,
  onClose,
  productId,
  currentCents,
}: {
  visible: boolean;
  onClose: () => void;
  productId: string;
  currentCents: number | null;
}) {
  const create = useCreateAlert();
  const suggested = currentCents ? Math.floor((currentCents * 0.9) / 100) : null;
  const [target, setTarget] = useState(suggested ? String(suggested) : "");
  const [push, setPush] = useState(true);
  const [kind, setKind] = useState<"below_price" | "all_time_low" | "back_in_stock">("below_price");
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
              channels: push ? ["in_app", "email", "push"] : ["in_app", "email"],
            },
            {
              onSuccess: () => {
                onClose();
                Alert.alert("Alert created", "We'll let you know when the price matches.");
              },
              onError: (e) => Alert.alert("Couldn't create alert", errorMessage(e)),
            },
          ),
      }}
    >
      <Row gap={2} style={{ flexWrap: "wrap" }}>
        <Chip label="Below a price" selected={kind === "below_price"} onPress={() => setKind("below_price")} />
        <Chip label="All-time low" selected={kind === "all_time_low"} onPress={() => setKind("all_time_low")} />
        <Chip label="Back in stock" selected={kind === "back_in_stock"} onPress={() => setKind("back_in_stock")} />
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
      <Chip label="Also send push notifications" icon={push ? "checkbox" : "square-outline"} selected={push} onPress={() => setPush((v) => !v)} />
    </Sheet>
  );
}
