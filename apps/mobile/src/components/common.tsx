import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { money } from "@/lib/format";
import { categoryPhoto, photoSrc, type Photo } from "@/lib/photos";
import { tokens, typeStyle, useTheme } from "@/lib/theme";
import { Sheet } from "./Sheet";
import { AppText, Button, Row } from "./ui";

const sp = tokens.spacing;

/** Store / brand logo, or a text tile in the store's brand color when no licensed logo is stored. */
export function StoreMark({
  name,
  logoUrl,
  brandColor,
  size = 32,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: number;
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const initials = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (logoUrl && !failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: tokens.radius.sm,
          backgroundColor: "#FFFFFF",
          borderWidth: 1,
          borderColor: c.border,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: size - 6, height: size - 6 }}
          contentFit="contain"
          onError={() => setFailed(true)}
          accessibilityLabel={`${name} logo`}
        />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: tokens.radius.sm,
        backgroundColor: brandColor ?? c["surface-3"],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={[typeStyle(size > 40 ? "base" : "2xs", 800), { color: brandColor ? "#FFFFFF" : c.text }]}>{initials || "?"}</Text>
    </View>
  );
}

/**
 * Current price, drop-colored with the real previous price struck through when the store actually cut its price
 * (contract `previousPriceCents`, never a list/"was" price).
 */
export function PriceWithPrevious({
  cents,
  previousCents,
  currency = "USD",
  size = "price",
}: {
  cents: number | null;
  previousCents?: number | null;
  currency?: string;
  size?: "priceSm" | "price" | "priceLg" | "priceXl";
}) {
  const dropped = previousCents != null && cents != null && previousCents > cents;
  return (
    <Row gap={2} style={{ flexWrap: "wrap", alignItems: "baseline" }}>
      <AppText variant={size} color={dropped ? "price-drop" : "text"} numberOfLines={1}>
        {money(cents, currency)}
      </AppText>
      {dropped ? (
        <AppText
          variant="caption"
          color="text-muted"
          style={{ textDecorationLine: "line-through" }}
          accessibilityLabel={`Was ${money(previousCents, currency)} at this store`}
        >
          {money(previousCents, currency)}
        </AppText>
      ) : null}
    </Row>
  );
}

/** ⓘ button on photos → sheet with Unsplash photographer credit (required by the Unsplash license). */
export function PhotoCredit({ photo, style, light = true }: { photo: Photo; style?: StyleProp<ViewStyle>; light?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Photo by ${photo.photographer} on Unsplash`}
        style={[
          {
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: light ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.8)",
          },
          style,
        ]}
      >
        <Ionicons name="information" size={14} color={light ? "#FFFFFF" : "#000000"} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Photo credit">
        <AppText>
          Photo by <AppText variant="label">{photo.photographer}</AppText> on Unsplash.
        </AppText>
        {photo.alt ? (
          <AppText variant="caption" color="text-muted">
            {photo.alt}
          </AppText>
        ) : null}
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          <Button title="Photographer" variant="secondary" size="sm" icon="person-outline" onPress={() => void Linking.openURL(photo.photographerUrl)} />
          <Button title="View on Unsplash" variant="secondary" size="sm" icon="open-outline" onPress={() => void Linking.openURL(photo.unsplashUrl)} />
          <Button
            title="All credits"
            variant="ghost"
            size="sm"
            onPress={() => {
              setOpen(false);
              router.push("/credits");
            }}
          />
        </Row>
      </Sheet>
    </>
  );
}

/** Round category image (Unsplash photo) or the category initial on a soft tone when no photo exists. */
export function CategoryCircle({ slug, name, size = 72 }: { slug: string; name: string; size?: number }) {
  const { c } = useTheme();
  const photo = categoryPhoto(slug);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: photo?.color ?? c["primary-soft"],
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      {photo ? (
        <Image
          source={{ uri: photoSrc(photo, size * 3) }}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={tokens.motion.duration.base}
          cachePolicy="memory-disk"
          accessible={false}
        />
      ) : (
        <Text style={[typeStyle("xl", 800), { color: c["primary-soft-fg"] }]}>{name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

/** Horizontal labelled category circle (for rails). Credits for these photos are on the Credits screen. */
export function CategoryCircleLink({ slug, name, size = 72 }: { slug: string; name: string; size?: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug } })}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => ({ width: size + 16, alignItems: "center", gap: sp[1.5], opacity: pressed ? 0.7 : 1 })}
    >
      <CategoryCircle slug={slug} name={name} size={size} />
      <AppText variant="caption" numberOfLines={2} style={{ textAlign: "center" }}>
        {name}
      </AppText>
    </Pressable>
  );
}
