import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { BrandLogo } from "./BrandLogo";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Button, Field, IconButton } from "./ui";

export function AuthForm({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: tokens.layout.gutter.base, gap: tokens.spacing[4], paddingBottom: tokens.spacing[12] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: tokens.spacing[1] }}>
          <BrandLogo height={32} />
          <AppText variant="h2" accessibilityRole="header">
            {title}
          </AppText>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** OAuth is `pending_configuration` until provider keys exist → shown disabled, never faked. */
export function OAuthButtons() {
  return (
    <View style={{ gap: tokens.spacing[2] }}>
      <Button title="Continue with Apple · Not available yet" icon="logo-apple" variant="secondary" disabled />
      <Button title="Continue with Google · Not available yet" icon="logo-google" variant="secondary" disabled />
      <AppText variant="caption" color="text-muted" style={{ textAlign: "center" }}>
        or use your email
      </AppText>
    </View>
  );
}

export function PasswordField({
  value,
  onChangeText,
  error,
  hint,
  autoComplete,
  onSubmitEditing,
  label = "Password",
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  hint?: string;
  autoComplete: "current-password" | "new-password";
  onSubmitEditing?: () => void;
  label?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoComplete={autoComplete}
      textContentType={autoComplete === "new-password" ? "newPassword" : "password"}
      error={error}
      hint={hint}
      returnKeyType="go"
      onSubmitEditing={onSubmitEditing}
      right={
        <IconButton
          icon={show ? "eye-off-outline" : "eye-outline"}
          label={show ? "Hide password" : "Show password"}
          onPress={() => setShow((s) => !s)}
          style={{ borderWidth: 0, backgroundColor: "transparent" }}
        />
      }
    />
  );
}
