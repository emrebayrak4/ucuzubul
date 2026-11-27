import { useState } from "react";
import { Alert, View } from "react-native";
import { isValidZip } from "@pricora/utils";
import { errorMessage } from "@/lib/api";
import { haptic } from "@/lib/format";
import { zipFromCurrentLocation } from "@/lib/location";
import { tokens } from "@/lib/theme";
import { useSaveZip, useZip } from "@/lib/zip";
import { Sheet } from "./Sheet";
import { AppText, Button, Field } from "./ui";

/**
 * ZIP for tax-inclusive totals — works signed out (device) and signed in (account). "Use my location" runs only
 * on tap: one coarse fix → GET /v1/geo/zip (3-decimal coordinates); the result shows city + confidence for review.
 */
export function ZipSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const current = useZip();
  const save = useSaveZip();
  const [zip, setZip] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const value = zip ?? current.zip ?? "";
  const valid = value === "" || isValidZip(value);

  /** Save (or clear) then close; awaited so the sheet always closes after the write. */
  const finish = async (next: string | null) => {
    try {
      await save.mutateAsync(next);
      setZip(null);
      setNote(null);
      onClose();
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e));
    }
  };

  const locate = async () => {
    setLocating(true);
    setNote(null);
    const r = await zipFromCurrentLocation();
    setLocating(false);
    if (r.status === "ok") {
      haptic.success();
      setZip(r.zip);
      setNote(`${r.zip}${r.city ? ` · ${r.city}` : ""}${r.confidence ? ` · ${r.confidence} confidence` : ""}. ${r.confidence === "high" ? "Tap Save." : "Please check it before saving."}`);
    } else if (r.status === "denied") setNote("Location permission was not granted. Type your ZIP instead.");
    else if (r.status === "no_match") setNote("No US ZIP found for your location. Please type it.");
    else if (r.status === "unsupported") setNote("Location lookup isn't available. Please type your ZIP.");
    else setNote(r.message);
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setZip(null);
        setNote(null);
        onClose();
      }}
      title="Your ZIP code"
      secondary={current.zip ? { label: "Clear", onPress: () => void finish(null) } : undefined}
      primary={{
        label: "Save",
        loading: save.isPending,
        disabled: !value || !valid,
        onPress: () => void finish(value.slice(0, 5)),
      }}
    >
      <AppText color="text-muted">Used only to estimate sales tax and shipping, so totals include tax for your area.</AppText>
      <Field
        label="ZIP code"
        value={value}
        onChangeText={(v) => setZip(v.replace(/\D/g, "").slice(0, 5))}
        keyboardType="number-pad"
        maxLength={5}
        error={valid ? null : "Enter a 5-digit US ZIP code"}
        hint={current.source === "account" ? "Saved to your account" : current.source === "device" ? "Saved on this device" : undefined}
      />
      <View style={{ gap: tokens.spacing[1] }}>
        <Button title="Use my location" icon="locate-outline" variant="secondary" size="sm" loading={locating} onPress={() => void locate()} style={{ alignSelf: "flex-start" }} />
        <AppText variant="caption" color="text-muted">
          {note ?? "Asks for your location once, looks up the ZIP, and doesn't store your coordinates."}
        </AppText>
      </View>
    </Sheet>
  );
}
