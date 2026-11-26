import { router } from "expo-router";
import { useState } from "react";
import { LoginRequest } from "@pricora/contracts";
import { AuthForm, OAuthButtons, PasswordField } from "@/components/auth";
import { AppText, Button, Field, Notice } from "@/components/ui";
import { track } from "@/lib/analytics";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { tokens } from "@/lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = LoginRequest.safeParse({ email, password, remember: true });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await login(parsed.data);
      track("login", { method: "email", success: true });
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      track("login", { method: "email", success: false });
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthForm title="Log in">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <OAuthButtons />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={errors.email}
      />
      <PasswordField value={password} onChangeText={setPassword} error={errors.password} autoComplete="current-password" onSubmitEditing={submit} />
      <Button title="Log in" size="lg" loading={busy} onPress={submit} />
      <Button title="Forgot password?" variant="ghost" onPress={() => router.push("/forgot-password")} />
      <AppText color="text-muted" style={{ textAlign: "center", marginTop: tokens.spacing[2] }}>
        New here?
      </AppText>
      <Button title="Create an account" variant="secondary" onPress={() => router.replace("/signup")} />
    </AuthForm>
  );
}
