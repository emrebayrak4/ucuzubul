import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** iOS 26+ built with the iOS 26 SDK → system Liquid Glass tab bar (NativeTabs). Otherwise the floating GlassTabBar. */
export const USES_SYSTEM_LIQUID_GLASS = Platform.OS === "ios" && isLiquidGlassAvailable();

/**
 * Space a floating tab bar covers above the bottom safe-area inset, for scroll padding and overlays (compare tray).
 * System tab bar ≈ 49 pt; GlassTabBar = 64 pt pill + 8 pt gap.
 */
export const TAB_BAR_CLEARANCE = USES_SYSTEM_LIQUID_GLASS ? 56 : 72;

/** Bottom scroll padding for tab screens so the last row clears the floating bar. */
export function useTabBarSpace(): number {
  const insets = useSafeAreaInsets();
  return USES_SYSTEM_LIQUID_GLASS ? 24 : TAB_BAR_CLEARANCE + insets.bottom + 24;
}
