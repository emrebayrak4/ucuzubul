import { router } from "expo-router";
import { useState } from "react";
import { ForgotPasswordRequest } from "@pricora/contracts";
import { AuthForm } from "@/components/auth";
import { AppText, Button, Field, Notice } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = ForgotPasswordRequest.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.auth.forgotPassword(parsed.data);
      track("password_reset_requested", {});
      setDone(res.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthForm title="Reset your password">
      {done ? (
        <>
          <Notice tone="info">{done}</Notice>
          <AppText color="text-muted">Open the link in the email to choose a new password. It opens in the app when installed, otherwise on the web.</AppText>
          <Button title="Back to log in" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <AppText color="text-muted">Enter your account email and we’ll send you a reset link.</AppText>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            error={error}
            onSubmitEditing={submit}
          />
          <Button title="Send reset link" size="lg" loading={busy} onPress={submit} />
        </>
      )}
    </AuthForm>
  );
}
