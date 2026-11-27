import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ResetPasswordRequest } from "@pricora/contracts";
import { AuthForm } from "@/components/auth";
import { AppText, Button, Field, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { param } from "@/lib/hooks";

/** /reset-password?token=… (link from the reset email; universal link → app, same as web). */
export default function ResetPasswordScreen() {
  const token = param(useLocalSearchParams<{ token?: string }>().token) ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const tokenOk = token.length >= 16;

  const submit = async () => {
    const parsed = ResetPasswordRequest.safeParse({ token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a stronger password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword(parsed.data);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthForm title="Choose a new password">
      {!tokenOk ? (
        <>
          <Notice tone="error">This reset link is invalid or incomplete.</Notice>
          <Button title="Request a new link" onPress={() => router.replace("/forgot-password")} />
        </>
      ) : done ? (
        <>
          <Notice tone="info">Your password was changed. You can log in now.</Notice>
          <Button title="Log in" size="lg" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <AppText color="text-muted">Use at least 10 characters. A passphrase works well.</AppText>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={error} onSubmitEditing={submit} />
          <Button title="Save new password" size="lg" loading={busy} onPress={submit} />
          {error && /expired|invalid/i.test(error) ? <Button title="Request a new link" variant="ghost" onPress={() => router.replace("/forgot-password")} /> : null}
        </>
      )}
    </AuthForm>
  );
}
