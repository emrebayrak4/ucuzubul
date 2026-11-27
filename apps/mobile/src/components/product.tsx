import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, type ReactNode } from "react";
import { FlatList, Pressable, View, useWindowDimensions } from "react-native";
import type { ProductCard } from "@pricora/contracts";
import { isInCompare, toggleCompare, useCompare } from "@/lib/compare";
import { conditionGroupLabel, conditionLabel, money } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";
import { PriceWithPrevious } from "./common";
import { PayIn4Line } from "./payments";
import { AppText, DealScoreBadge, DemoBadge, DropBadge, PressableRow, Row, Skeleton, SponsoredBadge } from "./ui";

const sp = tokens.spacing;
const TILE_W = 156;
const GUTTER = tokens.layout.gutter.base;

/** Extra display data for a card shown in a deal / drop context. */
export interface CardExtras {
  /** Override the shown price (e.g. the dropped store's current price). */
  priceCents?: number;
  /** Real previous price at that store. */
  previousPriceCents?: number | null;
  storeName?: string;
  dropRatio?: number;
}

export function ProductImage({ uri, size, alt, height }: { uri: string | null | undefined; size: number; alt?: string; height?: number }) {
  const { c } = useTheme();
  const h = height ?? size;
  return (
    <View
      style={{
        width: size,
        height: h,
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
          style={{ width: size - 12, height: h - 12 }}
          contentFit="contain"
          accessibilityLabel={alt}
          transition={tokens.motion.duration.base}
          cachePolicy="memory-disk"
        />
      ) : (
        <Ionicons name="image-outline" size={Math.min(size, h) / 3} color={c["text-muted"]} accessibilityLabel="No image" />
      )}
    </View>
  );
}

export function openProduct(slug: string) {
  router.push({ pathname: "/products/[slug]", params: { slug } });
}

function cardPrice(p: ProductCard, x?: CardExtras): { cents: number | null; previous: number | null } {
  if (x?.priceCents !== undefined) return { cents: x.priceCents, previous: x.previousPriceCents ?? null };
  return { cents: p.lowestPriceCents ?? p.lowestTotalCents, previous: p.previousPriceCents ?? null };
}

function PriceLine({ p, x }: { p: ProductCard; x?: CardExtras }) {
  const { cents, previous } = cardPrice(p, x);
  return (
    <View style={{ gap: 2 }}>
      <PriceWithPrevious cents={cents} previousCents={previous} currency={p.currency} />
      <AppText variant="caption" color="text-muted" numberOfLines={1}>
        {x?.storeName
          ? `at ${x.storeName}`
          : p.storeCount > 0
            ? `${p.storeCount} ${p.storeCount === 1 ? "store" : "stores"}`
            : "No offers yet"}
      </AppText>
      {/* payIn4 is computed at the lowest-price store, so only next to that price. */}
      {x?.priceCents === undefined ? <PayIn4Line payIn4={p.payIn4} compact /> : null}
      <OtherConditionsLine p={p} />
    </View>
  );
}

/**
 * Muted "Used from $X" line for cheaper second-hand groups. It is never the headline price. When the headline itself
 * isn't new (no new offers), it is labeled.
 */
function OtherConditionsLine({ p }: { p: ProductCard }) {
  const cheapest = [...(p.otherConditions ?? [])].sort((a, b) => a.lowestPriceCents - b.lowestPriceCents)[0];
  const headlineNotNew = p.priceCondition && p.priceCondition !== "new";
  if (!cheapest && !headlineNotNew) return null;
  return (
    <AppText variant="caption" color="text-muted" numberOfLines={1}>
      {headlineNotNew ? `${conditionGroupLabel[p.priceCondition!]} price` : ""}
      {headlineNotNew && cheapest ? " · " : ""}
      {cheapest ? `${conditionGroupLabel[cheapest.condition]} from ${money(cheapest.lowestPriceCents, p.currency)}` : ""}
    </AppText>
  );
}

function Badges({ p, x }: { p: ProductCard; x?: CardExtras }) {
  const drop = x?.dropRatio ?? p.dropRatio;
  return (
    <Row gap={1} style={{ flexWrap: "wrap" }}>
      {p.dealScore !== null ? <DealScoreBadge score={p.dealScore} /> : null}
      {drop ? <DropBadge ratio={drop} /> : null}
      {p.hasDemoData ? <DemoBadge /> : null}
      {p.sponsored ? <SponsoredBadge /> : null}
    </Row>
  );
}

/** Small round "add to compare" toggle overlaid on tiles. */
export function CompareToggle({ p, style }: { p: ProductCard; style?: object }) {
  const { c } = useTheme();
  const list = useCompare();
  const active = isInCompare(list, p.id);
  return (
    <Pressable
      hitSlop={8}
      onPress={() => toggleCompare({ id: p.id, slug: p.slug, title: p.title, imageUrl: p.image?.url ?? null })}
      accessibilityRole="button"
      accessibilityLabel={active ? `Remove ${p.title} from compare` : `Add ${p.title} to compare`}
      accessibilityState={{ selected: active }}
      style={[
        {
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: active ? c.primary : c.surface,
          borderWidth: 1,
          borderColor: active ? c.primary : c.border,
        },
        style,
      ]}
    >
      <Ionicons name={active ? "checkmark" : "git-compare-outline"} size={16} color={active ? c["primary-fg"] : c.text} />
    </Pressable>
  );
}

/** Rail tile (vertical). */
export const ProductTile = memo(function ProductTile({ p, x, width = TILE_W }: { p: ProductCard; x?: CardExtras; width?: number }) {
  const { cents } = cardPrice(p, x);
  return (
    <PressableRow
      onPress={() => openProduct(p.slug)}
      accessibilityLabel={`${p.title}, ${money(cents, p.currency)}`}
      style={{ width, gap: sp[2] }}
    >
      <View>
        <ProductImage uri={p.image?.url} size={width} alt={p.image?.alt} />
        <CompareToggle p={p} style={{ position: "absolute", top: 6, right: 6 }} />
      </View>
      <AppText variant="label" numberOfLines={2} style={{ minHeight: 36 }}>
        {p.title}
      </AppText>
      {p.keySpecs?.length ? (
        <AppText variant="caption" color="text-muted" numberOfLines={1}>
          {p.keySpecs.slice(0, 2).join(" · ")}
        </AppText>
      ) : null}
      <PriceLine p={p} x={x} />
      <Badges p={p} x={x} />
    </PressableRow>
  );
});

/** Width of one grid column for a 2-up grid inside the screen gutter. */
export function useGridTileWidth(columns = 2): number {
  const { width } = useWindowDimensions();
  return Math.floor((width - GUTTER * 2 - sp[3] * (columns - 1)) / columns);
}

/** Full-width list row (search results, saved). */
export const ProductRow = memo(function ProductRow({ p, x, right }: { p: ProductCard; x?: CardExtras; right?: ReactNode }) {
  const { cents } = cardPrice(p, x);
  return (
    <PressableRow
      onPress={() => openProduct(p.slug)}
      accessibilityLabel={`${p.title}, ${money(cents, p.currency)}`}
      style={{ paddingVertical: sp[3] }}
    >
      <Row gap={3} style={{ alignItems: "flex-start" }}>
        <ProductImage uri={p.image?.url} size={88} alt={p.image?.alt} />
        <View style={{ flex: 1, gap: sp[1] }}>
          <AppText variant="label" numberOfLines={2}>
            {p.title}
          </AppText>
          {p.keySpecs?.length ? (
            <AppText variant="caption" color="text-muted" numberOfLines={1}>
              {p.keySpecs.join(" · ")}
            </AppText>
          ) : p.brand || p.condition !== "new" ? (
            <AppText variant="caption" color="text-muted" numberOfLines={1}>
              {[p.brand?.name, p.condition !== "new" ? conditionLabel[p.condition] : null].filter(Boolean).join(" · ")}
            </AppText>
          ) : null}
          <PriceLine p={p} x={x} />
          <Row gap={1} style={{ flexWrap: "wrap" }}>
            <Badges p={p} x={x} />
            {!p.inStock ? (
              <AppText variant="caption" color="warning">
                Out of stock
              </AppText>
            ) : null}
          </Row>
        </View>
        {right ?? <CompareToggle p={p} />}
      </Row>
    </PressableRow>
  );
});

export function ProductRail({ items, extras }: { items: ProductCard[]; extras?: (p: ProductCard, i: number) => CardExtras | undefined }) {
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(p, i) => p.id + ":" + i}
      renderItem={({ item, index }) => <ProductTile p={item} x={extras?.(item, index)} />}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: sp[3], paddingHorizontal: GUTTER }}
      style={{ marginHorizontal: -GUTTER }}
      initialNumToRender={4}
      windowSize={5}
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

export function GridSkeleton({ count = 6 }: { count?: number }) {
  const w = useGridTileWidth();
  return (
    <Row gap={3} style={{ flexWrap: "wrap" }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: w, gap: sp[2], marginBottom: sp[3] }}>
          <Skeleton height={w} />
          <Skeleton height={14} />
          <Skeleton height={14} width="60%" />
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
