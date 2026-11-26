import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Share } from "react-native";
import { AppText, Button, Card, ErrorState, Field, Notice, Screen } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { clearRecentlyViewed } from "@/lib/recent";
import { tokens } from "@/lib/theme";

const sp = tokens.spacing;

export default function PrivacyScreen() {
  const { user, signOutLocally } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <ErrorState message="Log in to manage your data." />;

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.me.exportData();
      track("data_exported", {});
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, `pricora-export-${data.exportedAt.slice(0, 10)}.json`);
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your Pricora data" });
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
    </Screen>
  );
}
