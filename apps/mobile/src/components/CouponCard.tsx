import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from "react-native-reanimated";
import type { Coupon } from "@pricora/contracts";
import { absoluteApiUrl } from "@/lib/api";
import { discountLabel, useCouponVote, votedStore } from "@/lib/coupons";
import { haptic, money, relative } from "@/lib/format";
import { useLocalStore } from "@/lib/store";
import { tokens, typeStyle, useTheme } from "@/lib/theme";
import { StoreMark } from "./common";
import { AppText, Badge, Button, Card, DemoBadge, Row } from "./ui";

const sp = tokens.spacing;

function expiresText(c: Coupon): string | null {
  if (!c.expiresAt) return null;
  const ms = new Date(c.expiresAt).getTime() - Date.now();
  if (ms < 0) return "Expired";
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 14) return `Expires in ${days} days`;
  return `Expires ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function expiresSoon(c: Coupon): boolean {
  return !!c.expiresAt && new Date(c.expiresAt).getTime() - Date.now() < 3 * 86_400_000;
}

/** Opens /v1/coupons/:id/go (logs the click, 302 to the allow-listed store URL) in the in-app browser. */
async function getDeal(c: Coupon) {
  await WebBrowser.openBrowserAsync(absoluteApiUrl(c.goUrl), { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
}

export function CouponCard({ coupon: cp, showStore = true }: { coupon: Coupon; showStore?: boolean }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const voted = useLocalStore(votedStore)[cp.id];
  const vote = useCouponVote();
  const exp = expiresText(cp);
  const expSoon = expiresSoon(cp);
  const rate = cp.stats.successRate;
  const reports = cp.stats.successCount + cp.stats.failCount;

  const reveal = async () => {
    if (!cp.code) return;
    setRevealed(true);
    await Clipboard.setStringAsync(cp.code).catch(() => undefined);
    setCopied(true);
    haptic.success();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card style={{ gap: sp[3] }}>
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        {showStore ? (
          <Pressable
            onPress={() => router.push({ pathname: "/stores/[slug]", params: { slug: cp.retailer.slug } })}
            accessibilityRole="button"
            accessibilityLabel={`${cp.retailer.name} store page`}
          >
            <StoreMark name={cp.retailer.name} logoUrl={cp.retailer.logoUrl} brandColor={cp.retailer.brandColor} size={44} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={2} style={{ flexWrap: "wrap" }}>
            <AppText variant="h4" color="price-drop">
              {discountLabel(cp)}
            </AppText>
            {showStore ? (
              <AppText variant="caption" color="text-muted">
                {cp.retailer.name}
              </AppText>
            ) : null}
          </Row>
          <AppText variant="label">{cp.title}</AppText>
          {cp.description ? (
            <AppText variant="caption" color="text-muted" numberOfLines={3}>
              {cp.description}
            </AppText>
          ) : null}
          <Row gap={1} style={{ flexWrap: "wrap", marginTop: 2 }}>
            {cp.source === "demo" ? <DemoBadge /> : null}
            {cp.status === "unverified" ? <Badge label="Unverified" bg="surface-2" fg="text-muted" /> : null}
            {cp.status === "active" && cp.stats.lastVerifiedAt ? <Badge label="Verified" bg="success-soft" fg="success" icon="checkmark" /> : null}
            {cp.minSpendCents ? <Badge label={`Min. ${money(cp.minSpendCents, "USD", "auto")}`} bg="surface-2" fg="text" /> : null}
            {exp ? <Badge label={exp} bg={expSoon ? "warning-soft" : "surface-2"} fg="text" icon="time-outline" /> : null}
          </Row>
        </View>
      </Row>

      {cp.code ? (
        <Animated.View layout={reduce ? undefined : LinearTransition.duration(tokens.motion.duration.base)}>
          {revealed ? (
            <Animated.View entering={reduce ? undefined : FadeIn.duration(180)}>
              <Pressable
                onPress={() => void reveal()}
                accessibilityRole="button"
                accessibilityLabel={`Code ${cp.code}. Tap to copy again`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  minHeight: 48,
                  paddingHorizontal: sp[4],
                  borderRadius: tokens.radius.md,
                  borderWidth: 2,
                  borderStyle: "dashed",
                  borderColor: c.primary,
                  backgroundColor: c["primary-soft"],
                }}
              >
                <AppText selectable style={[typeStyle("lg", 800), { color: c["primary-soft-fg"], letterSpacing: 1.5 }]}>
                  {cp.code}
                </AppText>
                <Row gap={1}>
                  <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={18} color={c["primary-soft-fg"]} />
                  <AppText variant="label" color="primary-soft-fg">
                    {copied ? "Copied" : "Copy"}
                  </AppText>
                </Row>
              </Pressable>
            </Animated.View>
          ) : (
            <Animated.View exiting={reduce ? undefined : FadeOut.duration(120)}>
              <Button title="Show code" icon="eye-outline" onPress={() => void reveal()} size="lg" />
            </Animated.View>
          )}
        </Animated.View>
      ) : null}
      {cp.source === "demo" && revealed ? (
        <AppText variant="caption" color="text-muted">
          Demo code for development — it will not work at the store.
        </AppText>
      ) : null}

      <Row gap={2}>
        <Button
          title={cp.code ? "Go to store" : "Get deal"}
          icon="open-outline"
          variant={cp.code ? "secondary" : "primary"}
          style={{ flex: 1 }}
          onPress={() => void getDeal(cp)}
        />
      </Row>

      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }} gap={2}>
        <AppText variant="caption" color="text-muted" style={{ flexShrink: 1 }}>
          {reports > 0 && rate !== null
            ? `${Math.round(rate * 100)}% worked · ${reports} ${reports === 1 ? "report" : "reports"}`
            : "No reports yet"}
          {cp.stats.lastWorkedAt ? ` · last worked ${relative(cp.stats.lastWorkedAt)}` : ""}
        </AppText>
        <Row gap={1}>
          <AppText variant="caption" color="text-muted">
            Worked?
          </AppText>
          {([true, false] as const).map((w) => {
            const active = voted === w;
            return (
              <Pressable
                key={String(w)}
                disabled={vote.isPending || voted !== undefined}
                onPress={() => vote.mutate({ coupon: cp, worked: w })}
                accessibilityRole="button"
                accessibilityLabel={w ? "Yes, it worked" : "No, it didn't work"}
                accessibilityState={{ selected: active, disabled: voted !== undefined }}
                hitSlop={6}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? (w ? c.success : c.error) : c.border,
                  backgroundColor: active ? (w ? c["success-soft"] : c["error-soft"]) : c.surface,
                  opacity: voted !== undefined && !active ? 0.4 : 1,
                }}
              >
                <Ionicons name={w ? "thumbs-up-outline" : "thumbs-down-outline"} size={16} color={active ? (w ? c.success : c.error) : c.text} />
              </Pressable>
            );
          })}
        </Row>
      </Row>
    </Card>
  );
}

/** Compact chip for "coupons available" on the product screen. */
export function CouponChip({ coupon: cp, onPress }: { coupon: Coupon; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${discountLabel(cp)} at ${cp.retailer.name}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: sp[3],
        borderRadius: tokens.radius.full,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: c["price-drop"],
        backgroundColor: c["price-drop-soft"],
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="pricetag-outline" size={14} color={c["price-drop"]} />
      <AppText variant="label" color="price-drop">
        {discountLabel(cp)}
      </AppText>
      <AppText variant="caption" color="text-muted">
        {cp.retailer.name}
      </AppText>
    </Pressable>
  );
}
