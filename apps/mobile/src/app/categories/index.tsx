import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import type { CategoryNode } from "@pricora/contracts";
import { CategoryCircle } from "@/components/common";
import { AppText, Chip, Divider, ErrorState, OfflineBanner, Row, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { haptic } from "@/lib/format";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

const open = (slug: string) => router.push({ pathname: "/categories/[slug]", params: { slug } });

/** Browse the full 3-level category tree: top level → subcategories → their children as chips. */
export default function CategoriesScreen() {
  const { c } = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["home", "categories"], queryFn: ({ signal }) => api.catalog.categories({ signal }), staleTime: 60 * 60_000 });

  const renderTop = ({ item }: { item: CategoryNode }) => {
    const isOpen = expanded === item.id;
    return (
      <View>
        <Pressable
          onPress={() => {
            haptic.toggle();
            setExpanded(isOpen ? null : item.id);
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={`${item.name}, ${item.productCount} products`}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: sp[3], paddingVertical: sp[2.5], opacity: pressed ? 0.8 : 1 })}
        >
          <CategoryCircle slug={item.slug} name={item.name} size={52} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyLg">{item.name}</AppText>
            <AppText variant="caption" color="text-muted">
              {item.productCount.toLocaleString("en-US")} products · {item.children.length} subcategories
            </AppText>
          </View>
          <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={20} color={c["text-muted"]} />
        </Pressable>
        {isOpen ? (
          <View style={{ paddingLeft: sp[4], paddingBottom: sp[3], gap: sp[1] }}>
            <Pressable onPress={() => open(item.slug)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: "center" }}>
              <AppText variant="label" color="primary">
                All {item.name} →
              </AppText>
            </Pressable>
            {item.children.map((child) => (
              <View key={child.id} style={{ gap: sp[1.5], paddingVertical: sp[1.5] }}>
                <Pressable onPress={() => open(child.slug)} accessibilityRole="link" style={{ flexDirection: "row", alignItems: "center", gap: sp[2], minHeight: 40 }}>
                  <CategoryCircle slug={child.slug} name={child.name} size={32} />
                  <AppText variant="label" style={{ flex: 1 }}>
                    {child.name}
                  </AppText>
                  <AppText variant="caption" color="text-muted">
                    {child.productCount}
                  </AppText>
                  <Ionicons name="chevron-forward" size={16} color={c["text-muted"]} />
                </Pressable>
                {child.children.length ? (
                  <Row gap={2} style={{ flexWrap: "wrap", paddingLeft: 40 }}>
                    {child.children.map((leaf) => (
                      <Chip key={leaf.id} label={`${leaf.name} · ${leaf.productCount}`} onPress={() => open(leaf.slug)} />
                    ))}
                  </Row>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <FlatList
        data={q.data?.items ?? []}
        keyExtractor={(x) => x.id}
        renderItem={renderTop}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: sp[24] }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.primary} />}
        ListEmptyComponent={
          q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
          ) : (
            <View style={{ gap: sp[3], paddingTop: sp[3] }}>
              {Array.from({ length: 8 }, (_, i) => (
                <Row key={i} gap={3}>
                  <Skeleton width={52} height={52} radius={26} />
                  <Skeleton height={16} width="50%" />
                </Row>
              ))}
            </View>
          )
        }
      />
    </View>
  );
}
