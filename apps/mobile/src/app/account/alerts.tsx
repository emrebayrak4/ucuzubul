import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, FlatList, RefreshControl, Switch, View } from "react-native";
import type { PriceAlert } from "@pricora/contracts";
import { ProductRow, RowSkeleton } from "@/components/product";
import { AppText, Button, Divider, EmptyState, ErrorState, IconButton, OfflineBanner, Row } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money, relative } from "@/lib/format";
import { ALERTS_KEY, useAlerts } from "@/lib/saved";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

function alertDescription(a: PriceAlert): string {
  switch (a.type) {
    case "below_price":
      return `At or below ${money(a.targetPriceCents)}`;
    case "drop_percent":
      return `Drops ${a.dropPercentBp !== null ? Math.round(a.dropPercentBp / 100) : "?"}% or more`;
    case "back_in_stock":
      return "Back in stock";
    case "new_cheaper_store":
      return "A new store is cheaper";
    case "all_time_low":
      return "New all-time low";
    case "coupon":
      return "New coupon";
  }
}

/** Price alerts: pause/resume, delete, open product. */
export default function AlertsScreen() {
  const { c } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const alerts = useAlerts();
  const update = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.me.alerts.update(id, { active }),
    onSettled: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: (e) => Alert.alert("Couldn't update", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (a: PriceAlert) => api.me.alerts.remove(a.id),
    onSuccess: (_, a) => track("alert_deleted", { alertType: a.type }),
    onSettled: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: (e) => Alert.alert("Couldn't delete", errorMessage(e)),
  });

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <EmptyState icon="notifications-outline" title="Log in to set price alerts" action={{ label: "Log in", onPress: () => router.push("/login") }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={alerts.data?.items ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: sp[16] }}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={Divider}
        refreshControl={<RefreshControl refreshing={alerts.isRefetching} onRefresh={() => void alerts.refetch()} tintColor={c.primary} />}
        renderItem={({ item: a }) => (
          <View>
            <ProductRow p={a.product} right={<View />} />
            <Row style={{ justifyContent: "space-between", paddingBottom: sp[3] }} gap={2}>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{alertDescription(a)}</AppText>
                <AppText variant="caption" color="text-muted">
                  {a.channels.join(", ")}
                  {a.lastTriggeredAt ? ` · last sent ${relative(a.lastTriggeredAt)}` : ""}
                </AppText>
              </View>
              <Switch
                value={a.active}
                onValueChange={(v) => update.mutate({ id: a.id, active: v })}
                trackColor={{ true: c.primary, false: c["surface-3"] }}
                accessibilityLabel={a.active ? "Pause alert" : "Resume alert"}
              />
              <IconButton
                icon="trash-outline"
                label="Delete alert"
                onPress={() =>
                  Alert.alert("Delete this alert?", undefined, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => remove.mutate(a) },
                  ])
                }
              />
            </Row>
          </View>
        )}
        ListEmptyComponent={
          alerts.isPending ? (
            <RowSkeleton count={4} />
          ) : alerts.isError ? (
            <ErrorState message={errorMessage(alerts.error)} onRetry={() => void alerts.refetch()} />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title="No price alerts yet"
              message="Open any product and tap the bell to get notified when the price drops."
              action={{ label: "Find deals", onPress: () => router.push("/deals") }}
            />
          )
        }
        ListFooterComponent={
          alerts.data?.items.length ? (
            <Button title="Notification settings" variant="ghost" icon="settings-outline" style={{ marginTop: sp[4] }} onPress={() => router.push("/account/notifications")} />
          ) : undefined
        }
      />
    </View>
  );
}
