import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import { Pressable, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_BAR_CLEARANCE } from "@/lib/tabBar";
import { clearCompare, COMPARE_MAX, removeFromCompare, useCompare } from "@/lib/compare";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Button, Row } from "./ui";

const sp = tokens.spacing;
const TAB_ROUTES = new Set(["/", "/search", "/scan", "/saved", "/account"]);

/**
 * Floating compare tray shown on every screen while 1–5 products are picked (hidden on the compare screen itself
 * and on full-screen modals). Thumbnails can be removed; "Compare" needs at least 2.
 */
export function CompareTray() {
  const { c } = useTheme();
  const items = useCompare();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const hidden = items.length === 0 || pathname === "/compare" || pathname === "/login" || pathname === "/signup" || pathname === "/scan";
  if (hidden) return null;
  const bottom = (TAB_ROUTES.has(pathname) ? TAB_BAR_CLEARANCE : 0) + insets.bottom + sp[2];

  return (
    <Animated.View
      entering={reduce ? undefined : SlideInDown.duration(tokens.motion.duration.base)}
      exiting={reduce ? undefined : SlideOutDown.duration(tokens.motion.duration.fast)}
      pointerEvents="box-none"
      style={{ position: "absolute", left: sp[3], right: sp[3], bottom }}
    >
      <View
        accessibilityRole="toolbar"
        accessibilityLabel={`Compare tray, ${items.length} of ${COMPARE_MAX} products`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: sp[2],
          padding: sp[2],
          paddingLeft: sp[3],
          borderRadius: tokens.radius.lg,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          ...tokens.nativeShadow.lg,
        }}
      >
        <Row gap={1.5} style={{ flex: 1 }}>
          {items.map((i) => (
            <Pressable
              key={i.id}
              onPress={() => removeFromCompare(i.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${i.title} from compare`}
              style={{
                width: 40,
                height: 40,
                borderRadius: tokens.radius.sm,
                backgroundColor: c["surface-2"],
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {i.imageUrl ? (
                <Image source={{ uri: i.imageUrl }} style={{ width: 34, height: 34 }} contentFit="contain" />
              ) : (
                <AppText variant="caption" numberOfLines={2} style={{ fontSize: 9, lineHeight: 10, textAlign: "center", paddingHorizontal: 2 }}>
                  {i.title}
                </AppText>
              )}
              <View style={{ position: "absolute", top: 1, right: 1, backgroundColor: c.surface, borderRadius: 7 }}>
                <Ionicons name="close-circle" size={14} color={c["text-muted"]} />
              </View>
            </Pressable>
          ))}
          {items.length < 2 ? (
            <AppText variant="caption" color="text-muted" style={{ flexShrink: 1 }}>
              Add one more to compare
            </AppText>
          ) : null}
        </Row>
        <Pressable onPress={clearCompare} accessibilityRole="button" accessibilityLabel="Clear compare" hitSlop={6} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={18} color={c["text-muted"]} />
        </Pressable>
        <Button title={`Compare ${items.length}`} size="sm" disabled={items.length < 2} onPress={() => router.push("/compare")} />
      </View>
    </Animated.View>
  );
}
