import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { StoreMark } from "@/components/common";
import { CouponCard } from "@/components/CouponCard";
import { PaymentOptionsList } from "@/components/payments";
import { AppText, Badge, Button, Card, Chip, ErrorState, OfflineBanner, Row, SectionHeader, Skeleton } from "@/components/ui";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { useFollowStore } from "@/lib/coupons";
import { money, relative } from "@/lib/format";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Store: details, shipping/membership info, coupons (+ follow), category breakdown and the store's products. */
export default function StoreScreen() {
  const { c } = useTheme();
  const slug = param(useLocalSearchParams<{ slug: string }>().slug) ?? "";
  const [category, setCategory] = useState<string | undefined>(undefined);
  const q = useQuery({ queryKey: ["store", slug], queryFn: ({ signal }) => api.catalog.retailer(slug, { signal }), enabled: !!slug });
  const coupons = useQuery({
    queryKey: ["coupons", "store", slug],
    queryFn: ({ signal }) => api.coupons.forRetailer(slug, { sort: "success_rate", pageSize: 3 }, { signal }),
    enabled: !!slug,
  });
  const stats = useQuery({ queryKey: ["coupons", "stats", slug], queryFn: ({ signal }) => api.coupons.retailerStats(slug, { signal }), enabled: !!slug });
  const follow = useFollowStore(slug);
  const scope = useMemo(() => ({ retailer: slug, category }), [slug, category]);
  const d = q.data;

  if (q.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ErrorState message={isNotFound(q.error) ? "This store doesn't exist." : errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </View>
    );
  }

  const r = d?.retailer;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: r?.name ?? "" }} />
      <OfflineBanner />
      <ProductBrowser
        key={`${slug}:${category ?? ""}`}
        scope={scope}
        initialSort="lowest_total"
        header={() =>
          r && d ? (
            <View style={{ gap: sp[3], paddingTop: sp[3] }}>
              <Row gap={3}>
                <StoreMark name={r.name} logoUrl={r.logoUrl} brandColor={r.brandColor} size={56} />
                <View style={{ flex: 1 }}>
                  <AppText variant="h2" accessibilityRole="header">
                    {r.name}
                  </AppText>
                  <AppText variant="caption" color="text-muted">
                    {r.domain} · {r.offerCount.toLocaleString("en-US")} offers
                  </AppText>
                </View>
              </Row>
              <Row gap={1} style={{ flexWrap: "wrap" }}>
                {r.integrationStatus === "live" ? <Badge label="Live store API" bg="success-soft" fg="success" /> : null}
                {r.freeShippingThresholdCents !== null ? (
                  <Badge label={`Free shipping over ${money(r.freeShippingThresholdCents, "USD", "auto")}`} bg="surface-2" fg="text" icon="car-outline" />
                ) : null}
                {r.membershipName ? <Badge label={r.membershipName} bg="surface-2" fg="text" /> : null}
              </Row>
              <Row gap={2} style={{ flexWrap: "wrap" }}>
                <Button
                  title={follow.following ? "Following coupons" : "Follow coupons"}
                  icon={follow.following ? "notifications" : "notifications-outline"}
                  variant={follow.following ? "secondary" : "primary"}
                  size="sm"
                  loading={follow.pending}
                  onPress={follow.toggle}
                />
                {r.returnPolicyUrl ? (
                  <Button title="Return policy" variant="ghost" size="sm" icon="open-outline" onPress={() => void WebBrowser.openBrowserAsync(r.returnPolicyUrl!)} />
                ) : null}
              </Row>

              {d.paymentOptions?.length ? (
                <>
                  <SectionHeader title={`Pay over time at ${r.name}`} />
                  <Card>
                    <PaymentOptionsList options={d.paymentOptions} />
                  </Card>
                </>
              ) : null}

              {coupons.data?.items.length ? (
                <>
                  <SectionHeader
                    title={`${r.name} coupons`}
                    action={{ label: "All", onPress: () => router.push({ pathname: "/coupons", params: { store: slug } }) }}
                  />
                  {stats.data && (stats.data.successRate90d !== null || stats.data.lastWorkedAt) ? (
                    <AppText variant="caption" color="text-muted">
                      {stats.data.successRate90d !== null ? `${Math.round(stats.data.successRate90d * 100)}% of reported codes worked (90 days)` : ""}
                      {stats.data.lastWorkedAt ? ` · last worked ${relative(stats.data.lastWorkedAt)}` : ""}
                      {stats.data.avgSavingsCents ? ` · avg. saving ${money(stats.data.avgSavingsCents)}` : ""}
                    </AppText>
                  ) : null}
                  <View style={{ gap: sp[3] }}>
                    {coupons.data.items.map((cp) => (
                      <CouponCard key={cp.id} coupon={cp} showStore={false} />
                    ))}
                  </View>
                </>
              ) : null}

              {d.categoryBreakdown.length > 1 ? (
                <>
                  <SectionHeader title="Shop this store" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
                    <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
                    {d.categoryBreakdown.map((cc) => (
                      <Chip key={cc.slug} label={`${cc.name} · ${cc.count}`} selected={category === cc.slug} onPress={() => setCategory(cc.slug)} />
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {r.affiliateDisclosure ? (
                <Card style={{ backgroundColor: c["surface-2"] }}>
                  <AppText variant="caption" color="text-muted">
                    {r.affiliateDisclosure}
                  </AppText>
                </Card>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: sp[2], paddingTop: sp[3] }}>
              <Skeleton height={56} width={200} />
              <Skeleton height={14} />
            </View>
          )
        }
      />
    </View>
  );
}
