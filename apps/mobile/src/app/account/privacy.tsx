import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share, Switch, View } from "react-native";
import { AppText, Button, Card, Divider, Field, ListRow, Notice, Screen } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { brand } from "@/lib/config";
import { openWebPath } from "@/lib/links";
import { setPrivacy, usePrivacy } from "@/lib/privacy";
import { clearRecentSearches } from "@/lib/recentSearches";
import { clearRecentlyViewed } from "@/lib/recent";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;

/** Privacy choices (work without an account) + data export / account deletion (signed in). */
export default function PrivacyScreen() {
  const { c } = useTheme();
  const { user, signOutLocally } = useAuth();
  const choices = usePrivacy();

  /** Signed in: mirror the device choices to the account (PUT /v1/me/consent) so web honours them too. */
  const syncConsent = (next: { doNotSellShare: boolean; analytics: boolean }) => {
    if (!user) return;
    api.me
      .updateConsent({ functional: true, analytics: next.analytics, advertising: !next.doNotSellShare, gpc: next.doNotSellShare })
      .catch((e: unknown) => Alert.alert("Saved on this device only", `Couldn't sync to your account: ${errorMessage(e)}`));
  };
  const change = (patch: Partial<{ doNotSellShare: boolean; analytics: boolean }>) => {
    const next = { ...choices, ...patch };
    setPrivacy(patch);
    syncConsent(next);
  };
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.me.exportData();
      track("data_exported", {});
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, `whichless-export-${data.exportedAt.slice(0, 10)}.json`);
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: `Your ${brand.name} data` });
      } else {
        await Share.share({ message: json });
      }
    } catch (e) {
      Alert.alert("Export failed", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = () => {
    Alert.alert("Delete account permanently?", "Your favorites, alerts, lists and history will be deleted. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          setError(null);
          try {
            await api.me.deleteAccount({ confirm: "DELETE", password: password || undefined });
            track("account_deleted", {});
            await clearRecentlyViewed();
            clearRecentSearches();
            await signOutLocally();
            router.replace("/");
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen scroll edges={[]}>
      <Card style={{ marginTop: sp[4] }} padded={false}>
        <View style={{ paddingHorizontal: sp[4] }}>
          <ListRow
            title="Do Not Sell or Share my personal information"
            subtitle="Sends the Global Privacy Control signal with every request from this device. We then don't sell or share your data for cross-context advertising."
            right={
              <Switch
                value={choices.doNotSellShare}
                onValueChange={(v) => change({ doNotSellShare: v })}
                trackColor={{ true: c.primary, false: c["surface-3"] }}
                accessibilityLabel="Do Not Sell or Share my personal information"
              />
            }
          />
          <Divider />
          <ListRow
            title="Product analytics"
            subtitle="Anonymous usage events (never search text or prices you type) that help us improve the app."
            right={
              <Switch
                value={choices.analytics}
                onValueChange={(v) => change({ analytics: v })}
                trackColor={{ true: c.primary, false: c["surface-3"] }}
                accessibilityLabel="Product analytics"
              />
            }
          />
        </View>
      </Card>
      <AppText variant="caption" color="text-muted" style={{ marginTop: sp[2] }}>
        {user
          ? "Saved on this device and to your account. Location is only used when you tap “Use my location”, and is never stored."
          : "Saved on this device. Log in to apply them to your account too. Location is only used when you tap “Use my location”, and is never stored."}
      </AppText>

      <Card style={{ marginTop: sp[4], gap: sp[3] }}>
        <AppText variant="h4">Data on this device</AppText>
        <AppText color="text-muted">Recently viewed products and recent searches are kept only on this phone.</AppText>
        <Button
          title="Clear recently viewed & searches"
          variant="secondary"
          icon="trash-outline"
          onPress={() => {
            void clearRecentlyViewed();
            clearRecentSearches();
            Alert.alert("Cleared", "Recently viewed products and searches were removed from this device.");
          }}
        />
      </Card>

      {user ? (
        <>
          <Card style={{ marginTop: sp[4], gap: sp[3] }}>
            <AppText variant="h4">Export your data</AppText>
            <AppText color="text-muted">Download a JSON copy of your profile, preferences, favorites, alerts, lists and history.</AppText>
            <Button title="Export data" icon="download-outline" variant="secondary" loading={exporting} onPress={exportData} />
          </Card>

          <Card style={{ marginTop: sp[4], gap: sp[3] }}>
            <AppText variant="h4" color="error">
              Delete account
            </AppText>
            <AppText color="text-muted">Type DELETE to confirm. Enter your password if your account has one.</AppText>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field label="Confirmation" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" placeholder="DELETE" />
            <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
            <Button title="Delete my account" variant="danger" disabled={confirm !== "DELETE"} loading={deleting} onPress={deleteAccount} />
          </Card>
        </>
      ) : (
        <Notice tone="info">Log in to export or delete account data.</Notice>
      )}

      <Button title="Privacy policy" variant="ghost" icon="document-text-outline" style={{ marginTop: sp[4] }} onPress={() => void openWebPath("/legal/privacy")} />
    </Screen>
  );
}
