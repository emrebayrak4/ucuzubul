import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import type { PreferencesResponse } from "@pricora/contracts";
import { isValidZip } from "@pricora/utils";
import { Button, ErrorState, Field, Screen, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { ME_KEY, useAuth } from "@/lib/auth";
import { tokens } from "@/lib/theme";

const PREFS_KEY = ["me", "preferences"] as const;

export default function ProfileScreen() {
  const { user } = useAuth();
  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: ({ signal }) => api.me.preferences({ signal }), enabled: !!user });

  if (!user) return <ErrorState message="Log in to edit your profile." />;

  return (
    <Screen scroll edges={[]}>
      {prefs.isPending ? (
        <Skeleton height={120} style={{ marginTop: tokens.spacing[4] }} />
      ) : prefs.isError ? (
        <ErrorState message={errorMessage(prefs.error)} onRetry={() => void prefs.refetch()} />
      ) : (
        <ProfileForm initial={prefs.data} />
      )}
    </Screen>
  );
}

function ProfileForm({ initial }: { initial: PreferencesResponse }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial.user.name ?? "");
  const [zip, setZip] = useState(initial.preferences.zip ?? "");
  const [zipError, setZipError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.me.updatePreferences({ name: name.trim() || undefined, zip: zip.trim() || null }),
    onSuccess: (res) => {
      qc.setQueryData(PREFS_KEY, res);
      void qc.invalidateQueries({ queryKey: ME_KEY });
      void qc.invalidateQueries({ queryKey: ["product"] }); // tax estimates depend on ZIP
      router.back();
    },
    onError: (e) => Alert.alert("Couldn't save", errorMessage(e)),
  });

  return (
    <>
      <Field label="Name" value={name} onChangeText={setName} maxLength={100} style={{ marginTop: tokens.spacing[4] }} />
      <Field
        label="ZIP code"
        value={zip}
        onChangeText={(v) => setZip(v.replace(/[^\d-]/g, ""))}
        keyboardType="number-pad"
        maxLength={10}
        error={zipError}
        hint="Used only to estimate sales tax and shipping."
        style={{ marginTop: tokens.spacing[4] }}
      />
      <Button
        title="Save"
        size="lg"
        loading={save.isPending}
        style={{ marginTop: tokens.spacing[6] }}
        onPress={() => {
          if (zip && !isValidZip(zip)) return setZipError("Enter a 5-digit US ZIP code");
          setZipError(null);
          save.mutate();
        }}
      />
    </>
  );
}
