import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { AppText, Chip, OfflineBanner } from "@/components/ui";
import { api } from "@/lib/api";
import { EMPTY_FILTERS } from "@/lib/browse";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;
const CAPS = [100, 250, 500, 1000, 2000];

/**
 * "Best <category> deals (under $N)" — web /best/<cat> and /best/<cat>-under-<N>. Ranked by Deal Score among
 * new offers; built from live data, never curated or paid.
 */
export default function BestScreen() {
  const { c } = useTheme();
  const raw = param(useLocalSearchParams<{ slug: string }>().slug) ?? "";
  const m = /^(.+)-under-(\d+)$/.exec(raw);
  const category = m ? m[1]! : raw;
  const [cap, setCap] = useState<number | undefined>(m ? Number(m[2]) : undefined);
  const cat = useQuery({ queryKey: ["category", category], queryFn: ({ signal }) => api.catalog.category(category, { signal }), enabled: !!category });
  const name = cat.data?.category.name ?? category.replace(/-/g, " ");
  const title = `Best ${name} deals${cap ? ` under $${cap}` : ""}`;
  const scope = useMemo(() => ({ category }), [category]);
  const initial = useMemo(() => ({ ...EMPTY_FILTERS, maxPrice: cap ? cap * 100 : undefined }), [cap]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title }} />
      <OfflineBanner />
      <ProductBrowser
        key={`${category}:${cap ?? ""}`}
        scope={scope}
        initialFilters={initial}
        initialSort="best_deal"
        header={(first) => (
          <View style={{ gap: sp[2], paddingTop: sp[2] }}>
            <AppText variant="h3" accessibilityRole="header">
              {title}
            </AppText>
            <AppText color="text-muted">
              Ranked by Deal Score — today’s price against each product’s own history and other stores.
              {first ? ` ${first.total} products compared.` : ""} Placement can’t be bought.
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
              <Chip label="Any budget" selected={!cap} onPress={() => setCap(undefined)} />
              {CAPS.map((v) => (
                <Chip key={v} label={`Under $${v}`} selected={cap === v} onPress={() => setCap(v)} />
              ))}
            </ScrollView>
            <AppText variant="caption" color="primary" onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug: category } })}>
              Browse all {name} →
            </AppText>
          </View>
        )}
      />
    </View>
  );
}
