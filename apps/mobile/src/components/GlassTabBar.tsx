/**
 * Floating "liquid glass" tab bar for Android and iOS < 26 (iOS 26+ uses the system Liquid Glass tab bar via
 * NativeTabs, see app/(tabs)/_layout.tsx).
 *
 * The look follows clayharmon/webgl-liquid-glass (MIT, © 2026 Clay Harmon,
 * https://github.com/clayharmon/webgl-liquid-glass): a pill with a heavy backdrop blur, a faint white fill,
 * a hairline inner border and soft drop shadow, plus a spring-animated selection bubble that squashes while it
 * travels. The spring constants (stiffness 340, damping 26) and the glass/bubble color values are taken from that
 * project. No WebGL is embedded: the specular highlight is a static SVG gradient and the blur is native
 * (expo-blur on iOS; a translucent material on Android, where a true backdrop blur needs a BlurTargetView
 * around every screen).
 *
 * Accessibility: Reduce Transparency → solid surface, Reduce Motion → no spring/morph (instant move).
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useState, type ComponentProps } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { typeStyle, useTheme } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Height of the pill itself; screens add `GLASS_TAB_BAR_CLEARANCE` + bottom inset as scroll padding. */
export const GLASS_TAB_BAR_HEIGHT = 64;
const SIDE_INSET = 16;
const BOTTOM_GAP = 8;
/** Space the floating bar covers above the bottom safe-area inset. */
export const GLASS_TAB_BAR_CLEARANCE = GLASS_TAB_BAR_HEIGHT + BOTTOM_GAP;
const BUBBLE_INSET = 6;
const SCAN_SIZE = 58;
/** Spring from webgl-liquid-glass/src/spring.ts (STIFFNESS 340, DAMPING 26, unit mass). */
const SPRING = { stiffness: 340, damping: 26, mass: 1 } as const;

const ICONS: Record<string, { icon: IconName; active: IconName; label: string }> = {
  index: { icon: "home-outline", active: "home", label: "Home" },
  search: { icon: "search-outline", active: "search", label: "Search" },
  scan: { icon: "barcode-outline", active: "barcode", label: "Scan" },
  saved: { icon: "heart-outline", active: "heart", label: "Saved" },
  account: { icon: "person-circle-outline", active: "person-circle", label: "Account" },
};

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((v) => alive && setOn(v));
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function GlassTabBar({ state, emitter, navigateToTab, descriptors }: BottomTabBarProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const reduceTransparency = useReduceTransparency();
  const dark = scheme === "dark";
  const solid = reduceTransparency;

  const [barWidth, setBarWidth] = useState(0);
  const routes = state.routes;
  const slotW = barWidth > 0 ? (barWidth - 16) / routes.length : 0;
  const activeName = routes[state.index]?.name;
  const centerActive = activeName === "scan";

  const bubbleX = useSharedValue(0);
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const bubbleOpacity = useSharedValue(1);

  useEffect(() => {
    if (!slotW) return;
    const x = 8 + state.index * slotW + BUBBLE_INSET;
    bubbleOpacity.value = reduceMotion ? (centerActive ? 0 : 1) : withTiming(centerActive ? 0 : 1, { duration: 140 });
    if (reduceMotion) {
      bubbleX.value = x;
      return;
    }
    bubbleX.value = withSpring(x, SPRING);
    // Squash-and-stretch while travelling, like the web bubble morph.
    scaleX.value = withSequence(withTiming(1.18, { duration: 90 }), withSpring(1, SPRING));
    scaleY.value = withSequence(withTiming(0.86, { duration: 90 }), withSpring(1, SPRING));
  }, [state.index, slotW, centerActive, reduceMotion, bubbleX, scaleX, scaleY, bubbleOpacity]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ translateX: bubbleX.value }, { scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);
  const fg = dark ? "rgba(255,255,255,0.95)" : c.text;
  const muted = dark ? "rgba(255,255,255,0.6)" : c["text-muted"];

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: SIDE_INSET, right: SIDE_INSET, bottom: insets.bottom + BOTTOM_GAP }}
    >
      <View
        onLayout={onLayout}
        accessibilityRole="tablist"
        style={{
          height: GLASS_TAB_BAR_HEIGHT,
          borderRadius: GLASS_TAB_BAR_HEIGHT / 2,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          // Shadow lives on the outer view; the glass layers are clipped inside.
          shadowColor: "#000",
          shadowOpacity: dark ? 0.45 : 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
          backgroundColor: solid ? c.surface : Platform.OS === "android" ? (dark ? "rgba(28,30,38,0.9)" : "rgba(255,255,255,0.88)") : "transparent",
        }}
      >
        {/* Glass layers (clipped to the pill) */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: GLASS_TAB_BAR_HEIGHT / 2, overflow: "hidden" }]} pointerEvents="none">
          {!solid && Platform.OS === "ios" ? (
            <BlurView intensity={80} tint={dark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} style={StyleSheet.absoluteFill} />
          ) : null}
          {!solid ? (
            <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                {/* Specular sheen: bright top edge fading out, a faint lift at the bottom (refraction rim). */}
                <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.16 : 0.5} />
                  <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={dark ? 0.03 : 0.12} />
                  <Stop offset="0.85" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={dark ? 0.08 : 0.2} />
                </LinearGradient>
                <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={dark ? 0.35 : 0.9} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={dark ? 0.08 : 0.25} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={dark ? 0.25 : 0.6} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheen)" />
              <Rect
                x="0.5"
                y="0.5"
                width={Math.max(0, barWidth - 1)}
                height={GLASS_TAB_BAR_HEIGHT - 1}
                rx={(GLASS_TAB_BAR_HEIGHT - 1) / 2}
                fill="none"
                stroke="url(#rim)"
                strokeWidth={1}
              />
            </Svg>
          ) : (
            <View style={[StyleSheet.absoluteFill, { borderRadius: GLASS_TAB_BAR_HEIGHT / 2, borderWidth: 1, borderColor: c.border }]} />
          )}
        </View>

        {/* Selection bubble */}
        {slotW ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                top: BUBBLE_INSET,
                width: slotW - BUBBLE_INSET * 2,
                height: GLASS_TAB_BAR_HEIGHT - BUBBLE_INSET * 2,
                borderRadius: (GLASS_TAB_BAR_HEIGHT - BUBBLE_INSET * 2) / 2,
                backgroundColor: solid ? c["primary-soft"] : dark ? "rgba(255,255,255,0.12)" : "rgba(0,41,248,0.09)",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: dark ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.9)",
              },
              bubbleStyle,
            ]}
          />
        ) : null}

        {routes.map((route, i) => {
          const focused = state.index === i;
          const meta = ICONS[route.name] ?? { icon: "ellipse-outline" as IconName, active: "ellipse" as IconName, label: route.name };
          const options = descriptors[route.key]?.options;
          const label = typeof options?.title === "string" ? options.title : meta.label;
          const onPress = () => {
            const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync().catch(() => undefined);
              navigateToTab(route.key);
            }
          };
          const onLongPress = () => emitter.emit({ type: "tabLongPress", target: route.key });

          if (route.name === "scan") {
            return (
              <View key={route.key} style={{ flex: 1, alignItems: "center" }}>
                <Pressable
                  onPress={() => {
                    const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                    if (focused || event.defaultPrevented) return;
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
                    navigateToTab(route.key);
                  }}
                  onLongPress={onLongPress}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel="Scan a barcode"
                  hitSlop={6}
                  style={({ pressed }) => ({
                    width: SCAN_SIZE,
                    height: SCAN_SIZE,
                    borderRadius: SCAN_SIZE / 2,
                    marginTop: -22,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: c.primary,
                    borderWidth: 3,
                    borderColor: focused ? c.accent : dark ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.95)",
                    transform: [{ scale: pressed && !reduceMotion ? 0.94 : 1 }],
                    shadowColor: c.primary,
                    shadowOpacity: 0.45,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 10,
                  })}
                >
                  <Ionicons name="barcode-outline" size={26} color={c["primary-fg"]} />
                </Pressable>
                <Text style={[typeStyle("2xs", 600), { color: focused ? c.primary : muted, marginTop: 2 }]} maxFontSizeMultiplier={1.2}>
                  {label}
                </Text>
              </View>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{ flex: 1, height: GLASS_TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 2 }}
            >
              <Ionicons name={focused ? meta.active : meta.icon} size={22} color={focused ? (dark ? fg : c.primary) : muted} />
              <Text
                numberOfLines={1}
                style={[typeStyle("2xs", focused ? 700 : 600), { color: focused ? (dark ? fg : c.primary) : muted }]}
                maxFontSizeMultiplier={1.2}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

