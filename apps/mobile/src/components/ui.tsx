import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { dealTierFromScore, dealTierLabel, type ColorTokenName, type FontSizeName } from "@pricora/design-tokens";
import { tokens, typeStyle, useTheme, type FontWeight } from "@/lib/theme";
import { useIsOnline } from "@/lib/query";

export type IconName = ComponentProps<typeof Ionicons>["name"];
const sp = tokens.spacing;
const MIN_TOUCH = tokens.layout.minTouchTarget;

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  scroll = false,
  edges = ["top"],
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const inner = padded ? { paddingHorizontal: tokens.layout.gutter.base } : null;
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, { paddingBottom: sp[12] }]}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({ children, gap = 2, style }: { children: ReactNode; gap?: keyof typeof sp; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: sp[gap] }, style]}>{children}</View>;
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: tokens.radius.lg,
          padding: padded ? sp[4] : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }, style]} />;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

type Variant = "h1" | "h2" | "h3" | "h4" | "body" | "bodyLg" | "label" | "caption" | "overline" | "price" | "priceLg" | "priceXl" | "priceSm";
const variantMap: Record<Variant, { step: FontSizeName; weight: FontWeight }> = {
  h1: { step: "3xl", weight: 800 },
  h2: { step: "2xl", weight: 800 },
  h3: { step: "xl", weight: 700 },
  h4: { step: "lg", weight: 700 },
  bodyLg: { step: "md", weight: 400 },
  body: { step: "base", weight: 400 },
  label: { step: "sm", weight: 600 },
  caption: { step: "xs", weight: 400 },
  overline: { step: "2xs", weight: 700 },
  priceXl: { step: "3xl", weight: 800 },
  priceLg: { step: "xl", weight: 800 },
  price: { step: "md", weight: 700 },
  priceSm: { step: "base", weight: 700 },
};

export function AppText({
  variant = "body",
  color = "text",
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: ColorTokenName }) {
  const { c } = useTheme();
  const v = variantMap[variant];
  const isPrice = variant.startsWith("price");
  const base: TextStyle = {
    ...typeStyle(v.step, v.weight),
    color: c[color],
    ...(isPrice ? { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] } : null),
    ...(variant === "overline" ? { textTransform: "uppercase" as const } : null),
  };
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[base, style]} />;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "accent" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
  size = "md",
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  size?: "sm" | "md" | "lg";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c["primary-fg"], border: c.primary },
    secondary: { bg: c.surface, fg: c.text, border: c["border-strong"] },
    ghost: { bg: "transparent", fg: c.primary, border: "transparent" },
    accent: { bg: c.accent, fg: c["accent-fg"], border: c.accent },
    danger: { bg: c.error, fg: c["error-fg"], border: c.error },
  };
  const p = palette[variant];
  const height = size === "lg" ? 52 : size === "sm" ? 36 : MIN_TOUCH;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={size === "sm" ? 4 : 0}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: size === "sm" ? sp[3] : sp[4],
          borderRadius: tokens.radius.md,
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: variant === "secondary" ? 1 : 0,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: sp[2],
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={p.fg} /> : null}
          <Text style={[typeStyle(size === "sm" ? "sm" : "base", 600), { color: p.fg }]} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  active = false,
  color,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  active?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        {
          width: MIN_TOUCH,
          height: MIN_TOUCH,
          borderRadius: tokens.radius.md,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: active ? c.primary : c.border,
          backgroundColor: active ? c["primary-soft"] : c.surface,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={color ?? (active ? c["primary-soft-fg"] : c.text)} />
    </Pressable>
  );
}

export function PressableRow({
  children,
  onPress,
  style,
  ...rest
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [{ minHeight: MIN_TOUCH, opacity: pressed ? 0.7 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  destructive = false,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
}) {
  const { c } = useTheme();
  const content = (
    <Row gap={3} style={{ paddingVertical: sp[3] }}>
      {icon ? <Ionicons name={icon} size={20} color={destructive ? c.error : c["text-muted"]} /> : null}
      <View style={{ flex: 1 }}>
        <AppText variant="bodyLg" color={destructive ? "error" : "text"}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="text-muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c["text-muted"]} /> : null)}
    </Row>
  );
  return onPress ? (
    <PressableRow onPress={onPress} accessibilityLabel={title}>
      {content}
    </PressableRow>
  ) : (
    content
  );
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export function Badge({
  label,
  bg,
  fg,
  border,
  icon,
}: {
  label: string;
  bg: ColorTokenName;
  fg: ColorTokenName;
  border?: ColorTokenName;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        paddingHorizontal: sp[1.5],
        paddingVertical: 2,
        borderRadius: tokens.radius.sm,
        backgroundColor: c[bg],
        borderWidth: border ? 1 : 0,
        borderColor: border ? c[border] : undefined,
      }}
    >
      {icon ? <Ionicons name={icon} size={12} color={c[fg]} /> : null}
      <Text style={[typeStyle("2xs", 600), { color: c[fg] }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}

/** Required on every demo-source offer/fare/rate (CLAUDE.md hard rule). */
export function DemoBadge() {
  return <Badge label="Demo data" bg="demo" fg="demo-fg" border="demo-border" icon="flask-outline" />;
}

export function SponsoredBadge() {
  return <Badge label="Sponsored" bg="sponsored" fg="sponsored-fg" />;
}

export function DealScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const { c } = useTheme();
  const tier = dealTierFromScore(score);
  const bg = c[`deal-${tier}` as ColorTokenName];
  const fg = c[`deal-${tier}-fg` as ColorTokenName];
  const big = size === "lg";
  return (
    <View
      accessibilityLabel={`Deal Score ${score} of 100, ${dealTierLabel[tier]}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 6,
        backgroundColor: bg,
        borderRadius: tokens.radius.sm,
        paddingHorizontal: big ? sp[2] : sp[1.5],
        paddingVertical: big ? sp[1] : 2,
      }}
    >
      <Text style={[typeStyle(big ? "lg" : "xs", 800), { color: fg, fontVariant: ["tabular-nums"] }]}>{score}</Text>
      <Text style={[typeStyle(big ? "sm" : "2xs", 600), { color: fg }]}>{dealTierLabel[tier]}</Text>
    </View>
  );
}

export function DropBadge({ ratio }: { ratio: number }) {
  if (!(ratio > 0)) return null;
  return <Badge label={`↓ ${Math.round(ratio * 100)}%`} bg="price-drop-soft" fg="price-drop" />;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  error,
  hint,
  style,
  right,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[{ gap: sp[1] }, style]}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: MIN_TOUCH + 4,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: error ? c.error : c["border-strong"],
          backgroundColor: c.surface,
          paddingHorizontal: sp[3],
        }}
      >
        <TextInput
          placeholderTextColor={c["text-muted"]}
          accessibilityLabel={label}
          {...props}
          style={[typeStyle("md"), { flex: 1, color: c.text, paddingVertical: sp[2] }]}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="text-muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({
        minHeight: 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: sp[3],
        borderRadius: tokens.radius.full,
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c["primary-soft"] : c.surface,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? c["primary-soft-fg"] : c.text} /> : null}
      <Text style={[typeStyle("sm", 500), { color: selected ? c["primary-soft-fg"] : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", backgroundColor: c["surface-2"], borderRadius: tokens.radius.md, padding: 2 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 36,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: tokens.radius.sm,
              backgroundColor: active ? c.surface : "transparent",
              ...(active ? tokens.nativeShadow.sm : null),
            }}
          >
            <Text style={[typeStyle("sm", active ? 600 : 500), { color: active ? c.text : c["text-muted"] }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Skeleton({ width, height, radius = tokens.radius.md, style }: { width?: ViewStyle["width"]; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [o, reduce]);
  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      accessible={false}
      style={[{ width: width ?? "100%", height, borderRadius: radius, backgroundColor: c["surface-3"] }, animated, style]}
    />
  );
}

export function EmptyState({
  icon = "file-tray-outline",
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: sp[10], paddingHorizontal: sp[6], gap: sp[2] }}>
      <Ionicons name={icon} size={36} color={c["text-muted"]} />
      <AppText variant="h4" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      {message ? (
        <AppText color="text-muted" style={{ textAlign: "center" }}>
          {message}
        </AppText>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} style={{ marginTop: sp[3] }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title="Couldn't load this"
      message={message}
      action={onRetry ? { label: "Try again", onPress: onRetry } : undefined}
    />
  );
}

export function OfflineBanner() {
  const online = useIsOnline();
  const { c } = useTheme();
  if (online) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: c["warning-soft"], paddingVertical: sp[1.5], paddingHorizontal: sp[4], flexDirection: "row", gap: sp[2], alignItems: "center" }}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={c.warning} />
      <AppText variant="caption" color="text">
        You’re offline. Showing saved data where available.
      </AppText>
    </View>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "demo" | "error"; children: ReactNode }) {
  const { c } = useTheme();
  const map = {
    info: { bg: c["info-soft"], fg: c.info, icon: "information-circle-outline" as IconName },
    warning: { bg: c["warning-soft"], fg: c.warning, icon: "alert-circle-outline" as IconName },
    error: { bg: c["error-soft"], fg: c.error, icon: "alert-circle-outline" as IconName },
    demo: { bg: c.demo, fg: c["demo-fg"], icon: "flask-outline" as IconName },
  }[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        gap: sp[2],
        backgroundColor: map.bg,
        borderRadius: tokens.radius.md,
        padding: sp[3],
        borderWidth: tone === "demo" ? 1 : 0,
        borderColor: c["demo-border"],
      }}
    >
      <Ionicons name={map.icon} size={18} color={map.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <AppText variant="label">{children}</AppText> : children}</View>
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Row style={{ justifyContent: "space-between", marginTop: sp[6], marginBottom: sp[2] }}>
      <AppText variant="h4" accessibilityRole="header">
        {title}
      </AppText>
      {action ? <Button title={action.label} variant="ghost" size="sm" onPress={action.onPress} /> : null}
    </Row>
  );
}
