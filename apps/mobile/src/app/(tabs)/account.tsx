import { TRAVEL_ENABLED } from "@/lib/features";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, Switch, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { AppText, Button, Card, Divider, ListRow, Screen, Segmented } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCompare } from "@/lib/compare";
import { API_URL, brand } from "@/lib/config";
import { useCouponFollows } from "@/lib/coupons";
import { openWebPath } from "@/lib/links";
import { usePrivacy } from "@/lib/privacy";
import { useTabBarSpace } from "@/lib/tabBar";
import { useAlerts, useFavorites, useLists } from "@/lib/saved";
import { tokens, useTheme, type ThemePreference } from "@/lib/theme";

const sp = tokens.spacing;

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <>
      {title ? (
        <AppText variant="overline" color="text-muted" style={{ marginTop: sp[6], marginBottom: sp[2] }}>
          {title}
        </AppText>
      ) : null}
      <Card padded={false} style={title ? undefined : { marginTop: sp[4] }}>
        <View style={{ paddingHorizontal: sp[4] }}>{children}</View>
      </Card>
    </>
  );
}

export default function AccountScreen() {
  const { c, preference, setPreference } = useTheme();
  const { user, logout, biometricEnabled, setBiometricEnabled } = useAuth();
  const alerts = useAlerts();
  const favorites = useFavorites();
  const lists = useLists();
  const follows = useCouponFollows();
  const compare = useCompare();
  const privacy = usePrivacy();
  const tabSpace = useTabBarSpace();

  const syncTheme = useMutation({ mutationFn: (theme: ThemePreference) => api.me.updatePreferences({ theme }) });
  const changeTheme = (p: ThemePreference) => {
    setPreference(p);
    if (user) syncTheme.mutate(p);
  };
  const count = (n: number | undefined) => (n !== undefined ? String(n) : undefined);

  return (
    <Screen scroll bottomSpace={tabSpace}>
      <AppText variant="h2" style={{ marginTop: sp[3] }} accessibilityRole="header">
        Account
      </AppText>

      {user ? (
        <Card style={{ marginTop: sp[4], gap: sp[1] }}>
          <AppText variant="h4">{user.name ?? user.email}</AppText>
          <AppText color="text-muted">{user.email}</AppText>
          <AppText variant="caption" color="text-muted">
            {user.zip ? `ZIP ${user.zip} · used for tax estimates` : "No ZIP set — tax estimates unavailable"}
          </AppText>
        </Card>
      ) : (
        <Card style={{ marginTop: sp[4], gap: sp[3] }}>
          <AppText variant="h4">Sign in to sync favorites, alerts and followed stores</AppText>
          <Button title="Log in" size="lg" onPress={() => router.push("/login")} />
          <Button title="Create account" variant="secondary" onPress={() => router.push("/signup")} />
        </Card>
      )}

      {user ? (
        <Group title="Shopping">
          <ListRow icon="notifications-outline" title="Price alerts" subtitle={count(alerts.data?.total) ? `${alerts.data?.total} active or paused` : "Get told when prices drop"} onPress={() => router.push("/account/alerts")} />
          <Divider />
          <ListRow icon="heart-outline" title="Favorites" subtitle={count(favorites.data?.total)} onPress={() => router.push("/saved")} />
          <Divider />
          <ListRow icon="list-outline" title="Shopping lists" subtitle={count(lists.data?.items.length)} onPress={() => router.push("/saved")} />
          <Divider />
          <ListRow
            icon="storefront-outline"
            title="Followed stores"
            subtitle={follows.data ? `${follows.data.items.length} stores · new coupon alerts` : "New coupon alerts"}
            onPress={() => router.push("/account/followed-stores")}
          />
        </Group>
      ) : null}

      <Group title="Browse">
        <ListRow icon="pricetag-outline" title="Coupons" onPress={() => router.push("/coupons")} />
        <Divider />
        <ListRow icon="flash-outline" title="Deals" onPress={() => router.push("/deals")} />
        <Divider />
        <ListRow icon="trending-down-outline" title="Price drops" onPress={() => router.push("/price-drops")} />
        <Divider />
        <ListRow icon="grid-outline" title="All categories" onPress={() => router.push("/categories")} />
        <Divider />
        <ListRow icon="git-compare-outline" title="Compare" subtitle={compare.length ? `${compare.length} selected` : "Pick up to 5 products"} onPress={() => router.push("/compare")} />
        {TRAVEL_ENABLED ? (
          <>
            <Divider />
            <ListRow icon="airplane-outline" title="Flights" onPress={() => router.push("/flights")} />
            <Divider />
            <ListRow icon="bed-outline" title="Hotels" onPress={() => router.push("/hotels")} />
          </>
        ) : null}
      </Group>

      <Group title="Settings">
        {user ? (
          <>
            <ListRow icon="person-outline" title="Profile & ZIP" subtitle="Name and ZIP for tax estimates" onPress={() => router.push("/account/profile")} />
            <Divider />
            <ListRow icon="notifications-circle-outline" title="Notifications" subtitle="Push, email, price drops" onPress={() => router.push("/account/notifications")} />
            <Divider />
            <ListRow
              icon="finger-print-outline"
              title="Biometric unlock"
              subtitle="Require Face ID / fingerprint to open the app"
              right={
                <Switch
                  value={biometricEnabled}
                  trackColor={{ true: c.primary, false: c["surface-3"] }}
                  accessibilityLabel="Biometric unlock"
                  onValueChange={async (v) => {
                    const ok = await setBiometricEnabled(v);
                    if (!ok && v) Alert.alert("Biometrics unavailable", "Set up Face ID, Touch ID or a fingerprint on this device first.");
                  }}
                />
              }
            />
            <Divider />
          </>
        ) : null}
        <ListRow
          icon="shield-checkmark-outline"
          title="Privacy choices"
          subtitle={privacy.doNotSellShare ? "Do Not Sell/Share is on" : "Do Not Sell/Share, data export & deletion"}
          onPress={() => router.push("/account/privacy")}
        />
      </Group>

      <AppText variant="overline" color="text-muted" style={{ marginTop: sp[6], marginBottom: sp[2] }}>
        Appearance
      </AppText>
      <Segmented
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        value={preference}
        onChange={changeTheme}
      />

      <Group title="About">
        <ListRow icon="images-outline" title="Photo credits" onPress={() => router.push("/credits")} />
        <Divider />
        <ListRow icon="document-text-outline" title="Privacy policy" onPress={() => void openWebPath("/legal/privacy")} />
        <Divider />
        <ListRow icon="document-text-outline" title="Terms" onPress={() => void openWebPath("/legal/terms")} />
        <Divider />
        <ListRow icon="information-circle-outline" title="Affiliate disclosure" onPress={() => void openWebPath("/legal/affiliate-disclosure")} />
      </Group>

      {user ? (
        <Button
          title="Log out"
          variant="secondary"
          style={{ marginTop: sp[6] }}
          onPress={async () => {
            await logout();
            track("logout", {});
          }}
        />
      ) : null}

      <AppText variant="caption" color="text-muted" style={{ marginTop: sp[6], textAlign: "center" }}>
        {brand.name} {Constants.expoConfig?.version ?? ""} · {brand.legalEntity}
        {__DEV__ ? `\nAPI ${API_URL}` : ""}
      </AppText>
    </Screen>
  );
}
