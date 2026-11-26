import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Switch, View } from "react-native";
import type { UserPreferences } from "@pricora/contracts";
import { Card, Divider, ErrorState, ListRow, Notice, Screen, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { registerForPush } from "@/lib/notifications";
import { tokens, useTheme } from "@/lib/theme";

type NotifKey = keyof UserPreferences["notifications"];
const ROWS: { key: NotifKey; title: string; subtitle: string }[] = [
  { key: "push", title: "Push notifications", subtitle: "Price alerts on this device" },
  { key: "email", title: "Email", subtitle: "Price alerts by email" },
  { key: "priceDrops", title: "Price drops", subtitle: "Drops on favorites" },
  { key: "weeklyDigest", title: "Weekly digest", subtitle: "A summary of your saved items" },
  { key: "marketing", title: "Product news", subtitle: "Occasional updates from Pricora" },
];

export default function NotificationsScreen() {
  const { c } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pushNote, setPushNote] = useState<string | null>(null);
  const prefs = useQuery({ queryKey: ["me", "preferences"], queryFn: ({ signal }) => api.me.preferences({ signal }), enabled: !!user });

  const save = useMutation({
    mutationFn: (notifications: UserPreferences["notifications"]) => api.me.updatePreferences({ notifications }),
    onSuccess: (res) => qc.setQueryData(["me", "preferences"], res),
    onError: (e) => Alert.alert("Couldn't save", errorMessage(e)),
  });

  if (!user) return <ErrorState message="Log in to manage notifications." />;

  const n = save.variables ?? prefs.data?.preferences.notifications;

  const onToggle = async (key: NotifKey, value: boolean) => {
    if (!n) return;
    if (key === "push" && value) {
      const reg = await registerForPush();
      if (reg.status === "denied") {
        Alert.alert("Notifications are off", "Enable notifications for Pricora in system Settings.");
        return;
      }
      setPushNote(
        reg.status === "registered"
          ? reg.sentToApi
            ? null
            : "Push is enabled on this device. Server delivery activates once device registration ships."
          : reg.reason,
      );
    }
    save.mutate({ ...n, [key]: value });
  };

  return (
    <Screen scroll edges={[]}>
      <View style={{ height: tokens.spacing[4] }} />
      {pushNote ? <Notice tone="info">{pushNote}</Notice> : null}
      {prefs.isPending ? (
        <Skeleton height={240} style={{ marginTop: tokens.spacing[4] }} />
      ) : prefs.isError || !n ? (
        <ErrorState message={errorMessage(prefs.error)} onRetry={() => void prefs.refetch()} />
      ) : (
        <Card padded={false} style={{ marginTop: tokens.spacing[4] }}>
          <View style={{ paddingHorizontal: tokens.spacing[4] }}>
            {ROWS.map((r, i) => (
              <View key={r.key}>
                {i ? <Divider /> : null}
                <ListRow
                  title={r.title}
                  subtitle={r.subtitle}
                  right={
                    <Switch
                      value={n[r.key]}
                      onValueChange={(v) => void onToggle(r.key, v)}
                      trackColor={{ true: c.primary, false: c["surface-3"] }}
                      accessibilityLabel={r.title}
                    />
                  }
                />
              </View>
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}
