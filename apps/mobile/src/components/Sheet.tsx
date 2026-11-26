import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Button, IconButton, Row } from "./ui";

/**
 * Bottom sheet built on the native Modal (slide-up, scrim, swipe-dismiss via pageSheet on iOS).
 * Primary action sits at the bottom for one-hand reach.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  primary,
  secondary,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  primary?: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };
  secondary?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: c.overlay }} />
        <View
          accessibilityViewIsModal
          style={{
            maxHeight: "85%",
            backgroundColor: c.surface,
            borderTopLeftRadius: tokens.radius.lg,
            borderTopRightRadius: tokens.radius.lg,
            paddingBottom: insets.bottom + tokens.spacing[3],
            ...tokens.nativeShadow.lg,
          }}
        >
          <View style={{ alignItems: "center", paddingTop: tokens.spacing[2] }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c["border-strong"] }} />
          </View>
          <Row style={{ justifyContent: "space-between", paddingHorizontal: tokens.spacing[4], paddingVertical: tokens.spacing[2] }}>
            <AppText variant="h4" accessibilityRole="header">
              {title}
            </AppText>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </Row>
          <ScrollView contentContainerStyle={{ paddingHorizontal: tokens.spacing[4], gap: tokens.spacing[4], paddingBottom: tokens.spacing[4] }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {primary || secondary ? (
            <Row gap={3} style={{ paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[2] }}>
              {secondary ? <Button title={secondary.label} variant="secondary" onPress={secondary.onPress} style={{ flex: 1 }} /> : null}
              {primary ? (
                <Button
                  title={primary.label}
                  onPress={primary.onPress}
                  loading={primary.loading}
                  disabled={primary.disabled}
                  style={{ flex: 2 }}
                  size="lg"
                />
              ) : null}
            </Row>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
