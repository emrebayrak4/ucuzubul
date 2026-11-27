import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, FlatList, Pressable, RefreshControl, View } from "react-native";
import { StoreMark } from "@/components/common";
import { RowSkeleton } from "@/components/product";
import { AppText, Button, Divider, EmptyState, ErrorState, OfflineBanner, Row } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FOLLOWS_KEY, useCouponFollows } from "@/lib/coupons";
import { haptic, relative } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Stores whose coupons the user follows (push/email when a new code appears). */
export default function FollowedStoresScreen() {
  const { c } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const follows = useCouponFollows();
  const unfollow = useMutation({
    mutationFn: (slug: string) => api.me.couponFollows.unfollow(slug),
    onMutate: () => haptic.toggle(),
    onSettled: () => qc.invalidateQueries({ queryKey: FOLLOWS_KEY }),
    onError: (e) => Alert.alert("Couldn't unfollow", errorMessage(e)),
  });

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState icon="storefront-outline" title="Log in to follow stores" action={{ label: "Log in", onPress: () => router.push("/login") }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={follows.data?.items ?? []}
        keyExtractor={(f) => f.retailer.slug}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: sp[16] }}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={Divider}
        refreshControl={<RefreshControl refreshing={follows.isRefetching} onRefresh={() => void follows.refetch()} tintColor={c.primary} />}
        ListHeaderComponent={
          <AppText color="text-muted" style={{ marginVertical: sp[3] }}>
            We’ll notify you when these stores get a new coupon (turn on push in Notifications).
          </AppText>
        }
        renderItem={({ item: f }) => (
          <Row gap={3} style={{ paddingVertical: sp[3] }}>
            <Pressable
              onPress={() => router.push({ pathname: "/coupons", params: { store: f.retailer.slug } })}
              accessibilityRole="button"
              accessibilityLabel={`${f.retailer.name} coupons`}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: sp[3] }}
            >
              <StoreMark name={f.retailer.name} logoUrl={f.retailer.logoUrl} brandColor={f.retailer.brandColor} size={40} />
              <View style={{ flex: 1 }}>
                <AppText variant="label">{f.retailer.name}</AppText>
                <AppText variant="caption" color="text-muted">
                  {f.activeCoupons} active {f.activeCoupons === 1 ? "coupon" : "coupons"} · following since {relative(f.createdAt)}
                </AppText>
              </View>
            </Pressable>
            <Button title="Unfollow" variant="secondary" size="sm" onPress={() => unfollow.mutate(f.retailer.slug)} />
          </Row>
        )}
        ListEmptyComponent={
          follows.isPending ? (
            <RowSkeleton count={3} />
          ) : follows.isError ? (
            <ErrorState message={errorMessage(follows.error)} onRetry={() => void follows.refetch()} />
          ) : (
            <EmptyState
              icon="storefront-outline"
              title="Not following any stores"
              message="Open Coupons, pick a store and tap Follow."
              action={{ label: "Browse coupons", onPress: () => router.push("/coupons") }}
            />
          )
        }
      />
    </View>
  );
}
