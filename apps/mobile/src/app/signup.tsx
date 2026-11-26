import { router } from "expo-router";
import { useState } from "react";
import { RegisterRequest } from "@pricora/contracts";
import { AuthForm, OAuthButtons, PasswordField } from "@/components/auth";
import { AppText, Button, Field, Notice } from "@/components/ui";
import { track } from "@/lib/analytics";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { openWebPath } from "@/lib/links";

export default function SignupScreen() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = RegisterRequest.safeParse({ name, email, password, acceptTerms: true });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await register(parsed.data);
      track("signup", { method: "email" });
      if (router.canGoBack()) router.back();
      else router.replace("/");
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const strength = password.length === 0 ? undefined : password.length < 10 ? "At least 10 characters" : password.length < 14 ? "OK — longer is stronger" : "Strong length";

  return (
    <AuthForm title="Create your account">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <OAuthButtons />
      <Field label="Name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
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
      <PasswordField value={password} onChangeText={setPassword} error={errors.password} hint={strength} autoComplete="new-password" onSubmitEditing={submit} />
      <AppText variant="caption" color="text-muted">
        By creating an account you agree to the Terms and Privacy Policy (drafts pending legal review).
      </AppText>
      <Button title="Read terms & privacy" variant="ghost" size="sm" onPress={() => void openWebPath("/legal/terms")} />
      <Button title="Create account" size="lg" loading={busy} onPress={submit} />
      <Button title="I already have an account" variant="secondary" onPress={() => router.replace("/login")} />
    </AuthForm>
  );
}
