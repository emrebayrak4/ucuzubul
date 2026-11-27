import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, RefreshControl, Switch, View } from "react-native";
import type { PriceAlert } from "@pricora/contracts";
import { ProductRow, RowSkeleton } from "@/components/product";
import { Sheet } from "@/components/Sheet";
import { AppText, Button, Divider, EmptyState, ErrorState, Field, IconButton, ListRow, Screen, Segmented } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { useRecentlyViewed } from "@/lib/recent";
import { ALERTS_KEY, FAVORITES_KEY, LISTS_KEY, useAlerts, useFavorites, useLists } from "@/lib/saved";
import { TAB_BAR_CLEARANCE } from "@/lib/tabBar";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
/** Clears the floating tab bar (+ typical home-indicator inset). */
const TAB_SPACE = TAB_BAR_CLEARANCE + 58;
type Tab = "favorites" | "alerts" | "lists";

export default function SavedScreen() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("favorites");
  const recent = useRecentlyViewed();

  if (!user) {
    return (
      <Screen>
        <AppText variant="h2" style={{ marginTop: sp[3] }} accessibilityRole="header">
          Saved
        </AppText>
        {loading ? (
          <RowSkeleton count={3} />
        ) : (
          <FlatList
            contentContainerStyle={{ paddingBottom: TAB_SPACE }}
            data={recent.items}
            keyExtractor={(p) => p.id}
            ItemSeparatorComponent={Divider}
            ListHeaderComponent={
              <View>
                <EmptyState
                  icon="heart-outline"
                  title="Save products and get price alerts"
                  message="Log in to keep favorites, alerts and shopping lists in sync across devices."
                  action={{ label: "Log in", onPress: () => router.push("/login") }}
                />
                {recent.items.length ? (
                  <AppText variant="h4" style={{ marginTop: sp[2] }}>
                    Recently viewed on this device
                  </AppText>
                ) : null}
              </View>
            }
            renderItem={({ item }) => <ProductRow p={item} />}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="h2" style={{ marginTop: sp[3], marginBottom: sp[3] }} accessibilityRole="header">
        Saved
      </AppText>
      <Segmented
        options={[
          { value: "favorites", label: "Favorites" },
          { value: "alerts", label: "Alerts" },
          { value: "lists", label: "Lists" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ flex: 1, marginTop: sp[2] }}>
        {tab === "favorites" ? <Favorites /> : tab === "alerts" ? <Alerts /> : <Lists />}
      </View>
    </Screen>
  );
}

function Favorites() {
  const q = useFavorites();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api.me.favorites.remove(id),
    onSettled: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
    onError: (e) => Alert.alert("Couldn't remove", errorMessage(e)),
  });
  const { c } = useTheme();
  if (q.isPending) return <RowSkeleton />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <FlatList
            contentContainerStyle={{ paddingBottom: TAB_SPACE }}
      data={q.data.items}
      keyExtractor={(f) => f.id}
      ItemSeparatorComponent={Divider}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
      renderItem={({ item }) => (
        <ProductRow
          p={item.product}
          right={<IconButton icon="heart" active label="Remove from favorites" onPress={() => remove.mutate(item.id)} />}
        />
      )}
      ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on any product to save it here." />}
    />
  );
}

function alertLabel(a: PriceAlert): string {
  switch (a.type) {
    case "below_price":
      return `Below ${money(a.targetPriceCents)}`;
    case "drop_percent":
      return `Drops ${a.dropPercentBp !== null ? a.dropPercentBp / 100 : "?"}%`;
    case "back_in_stock":
      return "Back in stock";
    case "new_cheaper_store":
      return "New cheaper store";
    case "all_time_low":
      return "All-time low";
    case "coupon":
      return "Coupon available";
  }
}

function Alerts() {
  const q = useAlerts();
  const qc = useQueryClient();
  const { c } = useTheme();
  const update = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.me.alerts.update(id, { active }),
    onSettled: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: (e) => Alert.alert("Couldn't update alert", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (a: PriceAlert) => api.me.alerts.remove(a.id).then(() => a),
    onSuccess: (a) => track("alert_deleted", { alertType: a.type }),
    onSettled: () => qc.invalidateQueries({ queryKey: ALERTS_KEY }),
    onError: (e) => Alert.alert("Couldn't delete alert", errorMessage(e)),
  });
  if (q.isPending) return <RowSkeleton />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <FlatList
            contentContainerStyle={{ paddingBottom: TAB_SPACE }}
      data={q.data.items}
      keyExtractor={(a) => a.id}
      ItemSeparatorComponent={Divider}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
      renderItem={({ item }) => (
        <View>
          <ProductRow p={item.product} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: sp[3], paddingBottom: sp[3] }}>
            <AppText variant="label" style={{ flex: 1 }}>
              {alertLabel(item)}
              {item.lastTriggeredAt ? " · triggered" : ""}
            </AppText>
            <Switch
              value={item.active}
              onValueChange={(active) => update.mutate({ id: item.id, active })}
              trackColor={{ true: c.primary, false: c["surface-3"] }}
              accessibilityLabel={item.active ? "Pause alert" : "Resume alert"}
            />
            <IconButton
              icon="trash-outline"
              label="Delete alert"
              color={c.error}
              onPress={() =>
                Alert.alert("Delete alert?", alertLabel(item), [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => remove.mutate(item) },
                ])
              }
            />
          </View>
        </View>
      )}
      ListEmptyComponent={
        <EmptyState icon="notifications-outline" title="No price alerts" message="Open a product and tap the bell to get notified when the price drops." />
      }
    />
  );
}

function Lists() {
  const q = useLists();
  const qc = useQueryClient();
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: (n: string) => api.me.lists.create({ name: n, isPublic: false }),
    onSuccess: () => {
      track("list_created", { itemCount: 0 });
      setOpen(false);
      setName("");
      void qc.invalidateQueries({ queryKey: LISTS_KEY });
    },
    onError: (e) => Alert.alert("Couldn't create list", errorMessage(e)),
  });
  if (q.isPending) return <RowSkeleton />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <>
      <FlatList
            contentContainerStyle={{ paddingBottom: TAB_SPACE }}
        data={q.data.items}
        keyExtractor={(l) => l.id}
        ItemSeparatorComponent={Divider}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
        renderItem={({ item }) => (
          <ListRow
            icon="list-outline"
            title={item.name}
            subtitle={`${item.itemCount} ${item.itemCount === 1 ? "item" : "items"}${item.estimatedTotalCents !== null ? ` · est. ${money(item.estimatedTotalCents)}` : ""}`}
            onPress={() => router.push({ pathname: "/lists/[id]", params: { id: item.id } })}
          />
        )}
        ListEmptyComponent={<EmptyState icon="list-outline" title="No lists yet" message="Group products you plan to buy together." />}
        ListFooterComponent={<Button title="New list" icon="add" variant="secondary" onPress={() => setOpen(true)} style={{ marginVertical: sp[4] }} />}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="New list"
        primary={{ label: "Create", onPress: () => create.mutate(name.trim()), disabled: !name.trim(), loading: create.isPending }}
      >
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} autoFocus placeholder="e.g. Back to school" />
      </Sheet>
    </>
  );
}
