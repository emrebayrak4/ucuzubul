import { useLocalSearchParams } from "expo-router";
import { param } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { SearchSort } from "@pricora/contracts";
import { api } from "@/lib/api";
import { tokens, useTheme } from "@/lib/theme";
import { AppText, Chip, OfflineBanner } from "../ui";
import { ProductBrowser } from "./ProductBrowser";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Popular / New: one fixed ranking (sort) with a top-level category switcher, like the web ranked pages. */
export function RankedList({ sort, description }: { sort: SearchSort; description: string }) {
  const { c } = useTheme();
  const initialCategory = param(useLocalSearchParams<{ category?: string }>().category);
  const [category, setCategory] = useState<string | undefined>(initialCategory || undefined);
  const cats = useQuery({ queryKey: ["home", "categories"], queryFn: ({ signal }) => api.catalog.categories({ signal }), staleTime: 60 * 60_000 });
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <ProductBrowser
        key={category ?? "all"}
        scope={{ category }}
        initialSort={sort}
        header={() => (
          <View style={{ gap: sp[3], paddingTop: sp[2] }}>
            <AppText color="text-muted">{description}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
              {cats.data?.items.map((cat) => (
                <Chip key={cat.id} label={cat.name} selected={category === cat.slug} onPress={() => setCategory(cat.slug)} />
              ))}
            </ScrollView>
          </View>
        )}
      />
    </View>
  );
}
