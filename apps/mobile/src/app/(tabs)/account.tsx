import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, Switch, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { AppText, Button, Card, Divider, ListRow, Screen, Segmented } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL, brand } from "@/lib/config";
import { openWebPath } from "@/lib/links";
import { tokens, useTheme, type ThemePreference } from "@/lib/theme";

const sp = tokens.spacing;

export default function AccountScreen() {
  const { c, preference, setPreference } = useTheme();
  const { user, logout, biometricEnabled, setBiometricEnabled } = useAuth();

  const syncTheme = useMutation({ mutationFn: (theme: ThemePreference) => api.me.updatePreferences({ theme }) });
  const changeTheme = (p: ThemePreference) => {
    setPreference(p);
    if (user) syncTheme.mutate(p);
  };

  return (
    <Screen scroll>
      <AppText variant="h2" style={{ marginTop: sp[3] }} accessibilityRole="header">
        Account
      </AppText>

      {user ? (
        <Card style={{ marginTop: sp[4], gap: sp[1] }}>
          <AppText variant="h4">{user.name ?? user.email}</AppText>
          <AppText color="text-muted">{user.email}</AppText>
          <AppText variant="caption" color="text-muted">
            {user.zip ? `ZIP ${user.zip}` : "No ZIP set — tax estimates unavailable"}
          </AppText>
        </Card>
      ) : (
        <Card style={{ marginTop: sp[4], gap: sp[3] }}>
          <AppText variant="h4">Sign in to sync favorites and alerts</AppText>
          <Button title="Log in" size="lg" onPress={() => router.push("/login")} />
          <Button title="Create account" variant="secondary" onPress={() => router.push("/signup")} />
        </Card>
      )}

      {user ? (
        <Card style={{ marginTop: sp[4] }} padded={false}>
          <View style={{ paddingHorizontal: sp[4] }}>
            <ListRow icon="person-outline" title="Profile & ZIP" subtitle="Name and ZIP for tax estimates" onPress={() => router.push("/account/profile")} />
            <Divider />
            <ListRow icon="notifications-outline" title="Notifications" subtitle="Push, email, price drops" onPress={() => router.push("/account/notifications")} />
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
            <ListRow icon="shield-checkmark-outline" title="Privacy & data" subtitle="Export or delete your account" onPress={() => router.push("/account/privacy")} />
          </View>
        </Card>
      ) : null}

      <AppText variant="label" style={{ marginTop: sp[6], marginBottom: sp[2] }}>
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

      <Card style={{ marginTop: sp[6] }} padded={false}>
        <View style={{ paddingHorizontal: sp[4] }}>
          <ListRow icon="airplane-outline" title="Flights" onPress={() => router.push("/flights")} />
          <Divider />
          <ListRow icon="bed-outline" title="Hotels" onPress={() => router.push("/hotels")} />
          <Divider />
          <ListRow icon="document-text-outline" title="Privacy policy (draft)" onPress={() => void openWebPath("/legal/privacy")} />
          <Divider />
          <ListRow icon="document-text-outline" title="Terms (draft)" onPress={() => void openWebPath("/legal/terms")} />
          <Divider />
          <ListRow icon="information-circle-outline" title="Affiliate disclosure" onPress={() => void openWebPath("/legal/affiliate-disclosure")} />
        </View>
      </Card>

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
