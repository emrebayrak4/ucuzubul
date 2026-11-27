import { PlusJakartaSans_400Regular } from "@expo-google-fonts/plus-jakarta-sans/400Regular";
import { PlusJakartaSans_600SemiBold } from "@expo-google-fonts/plus-jakarta-sans/600SemiBold";
import { PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans/700Bold";
import { PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans/800ExtraBold";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider as NavThemeProvider, type Theme as NavTheme } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { tokens } from "@pricora/design-tokens";
import { CompareTray } from "@/components/CompareTray";
import { AppText, Button } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { brand } from "@/lib/config";
import { listenForNotificationTaps } from "@/lib/notifications";
import { QueryProvider } from "@/lib/query";
import { FONTS, ThemeProvider, useTheme } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [FONTS.regular]: PlusJakartaSans_400Regular,
    [FONTS.semibold]: PlusJakartaSans_600SemiBold,
    [FONTS.bold]: PlusJakartaSans_700Bold,
    [FONTS.extrabold]: PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AppNavigator />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator() {
  const { c, scheme } = useTheme();
  const { locked } = useAuth();

  useEffect(() => listenForNotificationTaps(), []);

  const navTheme = useMemo<NavTheme>(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: c.primary, background: c.bg, card: c.surface, text: c.text, border: c.border, notification: c.error },
    };
  }, [c, scheme]);

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerTintColor: c.primary,
          headerTitleStyle: { fontFamily: FONTS.bold, color: c.text },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
        <Stack.Screen name="products/[slug]" options={{ title: "" }} />
        <Stack.Screen name="categories/index" options={{ title: "Categories" }} />
        <Stack.Screen name="categories/[slug]" options={{ title: "" }} />
        <Stack.Screen name="brands/[slug]" options={{ title: "" }} />
        <Stack.Screen name="stores/[slug]" options={{ title: "" }} />
        <Stack.Screen name="browse" options={{ title: "Products" }} />
        <Stack.Screen name="compare" options={{ title: "Compare" }} />
        <Stack.Screen name="deals" options={{ title: "Deals" }} />
        <Stack.Screen name="price-drops" options={{ title: "Price drops" }} />
        <Stack.Screen name="popular" options={{ title: "Popular" }} />
        <Stack.Screen name="new" options={{ title: "New products" }} />
        <Stack.Screen name="coupons" options={{ title: "Coupons" }} />
        <Stack.Screen name="credits" options={{ title: "Photo credits" }} />
        <Stack.Screen name="account/alerts" options={{ title: "Price alerts" }} />
        <Stack.Screen name="account/followed-stores" options={{ title: "Followed stores" }} />
        <Stack.Screen name="login" options={{ title: "Log in", presentation: "modal" }} />
        <Stack.Screen name="signup" options={{ title: "Create account", presentation: "modal" }} />
        <Stack.Screen name="forgot-password" options={{ title: "Reset password", presentation: "modal" }} />
        <Stack.Screen name="flights/index" options={{ title: "Flights" }} />
        <Stack.Screen name="flights/search" options={{ title: "Flight results" }} />
        <Stack.Screen name="hotels/index" options={{ title: "Hotels" }} />
        <Stack.Screen name="hotels/search" options={{ title: "Hotel results" }} />
        <Stack.Screen name="hotels/[id]" options={{ title: "Hotel" }} />
        <Stack.Screen name="lists/[id]" options={{ title: "List" }} />
        <Stack.Screen name="account/profile" options={{ title: "Profile & ZIP" }} />
        <Stack.Screen name="account/notifications" options={{ title: "Notifications" }} />
        <Stack.Screen name="account/privacy" options={{ title: "Privacy choices" }} />
      </Stack>
      <CompareTray />
      {locked ? <LockScreen /> : null}
    </NavThemeProvider>
  );
}

function LockScreen() {
  const { c } = useTheme();
  const { unlock, logout } = useAuth();
  useEffect(() => {
    void unlock();
  }, [unlock]);
  return (
    <View
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: tokens.spacing[6],
        gap: tokens.spacing[4],
      }}
    >
      <AppText variant="h2">{brand.name} is locked</AppText>
      <AppText color="text-muted" style={{ textAlign: "center" }}>
        Unlock with Face ID, Touch ID, or your device biometrics.
      </AppText>
      <Button title="Unlock" icon="lock-open-outline" onPress={() => void unlock()} size="lg" style={{ alignSelf: "stretch" }} />
      <Button title="Log out instead" variant="ghost" onPress={() => void logout()} />
    </View>
  );
}
