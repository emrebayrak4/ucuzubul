import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, type ReactNode } from "react";
import { FlatList, View } from "react-native";
import type { ProductCard } from "@pricora/contracts";
import { conditionLabel, money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, DealScoreBadge, DemoBadge, DropBadge, PressableRow, Row, Skeleton, SponsoredBadge } from "./ui";

const sp = tokens.spacing;
const TILE_W = 156;

export function ProductImage({ uri, size, alt }: { uri: string | null | undefined; size: number; alt?: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: tokens.radius.md,
        backgroundColor: c["surface-2"],
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size - 12, height: size - 12 }}
          contentFit="contain"
          accessibilityLabel={alt}
          transition={tokens.motion.duration.base}
          cachePolicy="memory-disk"
        />
      ) : (
        <Ionicons name="pricetag-outline" size={size / 3} color={c["text-muted"]} accessibilityLabel="No image" />
      )}
    </View>
  );
}

function openProduct(slug: string) {
  router.push({ pathname: "/products/[slug]", params: { slug } });
}

function PriceLine({ p }: { p: ProductCard }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="price" numberOfLines={1}>
        {money(p.lowestTotalCents ?? p.lowestPriceCents, p.currency)}
      </AppText>
      <AppText variant="caption" color="text-muted" numberOfLines={1}>
        {p.storeCount > 0 ? `at ${p.storeCount} ${p.storeCount === 1 ? "store" : "stores"}` : "No offers yet"}
        {p.lowestTotalCents !== null ? " · incl. shipping" : ""}
      </AppText>
    </View>
  );
}

/** Rail tile (vertical). */
export const ProductTile = memo(function ProductTile({ p }: { p: ProductCard }) {
  return (
    <PressableRow
      onPress={() => openProduct(p.slug)}
      accessibilityLabel={`${p.title}, ${money(p.lowestTotalCents ?? p.lowestPriceCents, p.currency)}`}
      style={{ width: TILE_W, gap: sp[2] }}
    >
      <ProductImage uri={p.image?.url} size={TILE_W} alt={p.image?.alt} />
      <AppText variant="label" numberOfLines={2} style={{ minHeight: 36 }}>
        {p.title}
      </AppText>
      <PriceLine p={p} />
      <Row gap={1} style={{ flexWrap: "wrap" }}>
        {p.dealScore !== null ? <DealScoreBadge score={p.dealScore} /> : null}
        {p.dropRatio ? <DropBadge ratio={p.dropRatio} /> : null}
        {p.hasDemoData ? <DemoBadge /> : null}
        {p.sponsored ? <SponsoredBadge /> : null}
      </Row>
    </PressableRow>
  );
});

/** Full-width list row (search results, saved). */
export const ProductRow = memo(function ProductRow({ p, right }: { p: ProductCard; right?: ReactNode }) {
  return (
    <PressableRow
      onPress={() => openProduct(p.slug)}
      accessibilityLabel={`${p.title}, ${money(p.lowestTotalCents ?? p.lowestPriceCents, p.currency)}`}
      style={{ paddingVertical: sp[3] }}
    >
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <ProductImage uri={p.image?.url} size={88} alt={p.image?.alt} />
        <View style={{ flex: 1, gap: sp[1] }}>
          <AppText variant="label" numberOfLines={2}>
            {p.title}
          </AppText>
          {p.brand || p.condition !== "new" ? (
            <AppText variant="caption" color="text-muted" numberOfLines={1}>
              {[p.brand?.name, p.condition !== "new" ? conditionLabel[p.condition] : null].filter(Boolean).join(" · ")}
            </AppText>
          ) : null}
          <PriceLine p={p} />
          <Row gap={1} style={{ flexWrap: "wrap" }}>
            {p.dealScore !== null ? <DealScoreBadge score={p.dealScore} /> : null}
            {p.dropRatio ? <DropBadge ratio={p.dropRatio} /> : null}
            {p.hasDemoData ? <DemoBadge /> : null}
            {p.sponsored ? <SponsoredBadge /> : null}
            {!p.inStock ? (
              <AppText variant="caption" color="warning">
                Out of stock
              </AppText>
            ) : null}
          </Row>
        </View>
        {right}
      </Row>
    </PressableRow>
  );
});

export function ProductRail({ items }: { items: ProductCard[] }) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductTile p={item} />}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: sp[3], paddingHorizontal: tokens.layout.gutter.base }}
      style={{ marginHorizontal: -tokens.layout.gutter.base }}
    />
  );
}

export function RailSkeleton() {
  return (
    <Row gap={3} style={{ overflow: "hidden" }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: TILE_W, gap: sp[2] }}>
          <Skeleton height={TILE_W} />
          <Skeleton height={14} />
          <Skeleton height={14} width={90} />
        </View>
      ))}
    </Row>
  );
}

export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <Row key={i} gap={3} style={{ paddingVertical: sp[3], alignItems: "flex-start" }}>
          <Skeleton height={88} width={88} />
          <View style={{ flex: 1, gap: sp[2] }}>
            <Skeleton height={14} />
            <Skeleton height={14} width="60%" />
            <Skeleton height={18} width={80} />
          </View>
        </Row>
      ))}
    </View>
  );
}
