import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { StoreMark } from "@/components/common";
import { AppText, Button, Chip, ErrorState, OfflineBanner, Row, Skeleton } from "@/components/ui";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Brand: logo + description, category breakdown chips (scope the listing), filterable products. */
export default function BrandScreen() {
  const { c } = useTheme();
  const slug = param(useLocalSearchParams<{ slug: string }>().slug) ?? "";
  const [category, setCategory] = useState<string | undefined>(undefined);
  const q = useQuery({ queryKey: ["brand", slug], queryFn: ({ signal }) => api.catalog.brand(slug, { signal }), enabled: !!slug });
  const scope = useMemo(() => ({ brand: slug, category }), [slug, category]);
  const d = q.data;

  if (q.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ErrorState message={isNotFound(q.error) ? "This brand doesn't exist." : errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d?.brand.name ?? "" }} />
      <OfflineBanner />
      <ProductBrowser
        key={`${slug}:${category ?? ""}`}
        scope={scope}
        header={() =>
          d ? (
            <View style={{ gap: sp[3], paddingTop: sp[3] }}>
              <Row gap={3}>
                <StoreMark name={d.brand.name} logoUrl={d.brand.logoUrl} size={56} />
                <View style={{ flex: 1 }}>
                  <AppText variant="h2" accessibilityRole="header">
                    {d.brand.name}
                  </AppText>
                  <AppText variant="caption" color="text-muted">
                    {d.brand.productCount.toLocaleString("en-US")} products compared
                  </AppText>
                </View>
              </Row>
              {d.brand.description ? <AppText color="text-muted">{d.brand.description}</AppText> : null}
              {d.brand.website ? (
                <Button title="Official website" variant="ghost" size="sm" icon="open-outline" style={{ alignSelf: "flex-start" }} onPress={() => void Linking.openURL(d.brand.website!)} />
              ) : null}
              {d.categoryBreakdown.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
                  <Chip label="All" selected={!category} onPress={() => setCategory(undefined)} />
                  {d.categoryBreakdown.map((cc) => (
                    <Chip key={cc.slug} label={`${cc.name} · ${cc.count}`} selected={category === cc.slug} onPress={() => setCategory(cc.slug)} />
                  ))}
                </ScrollView>
              ) : null}
              <AppText variant="caption" color="text-muted">
                Logos are trademarks of their owners. {d.brand.name} does not endorse this comparison.
              </AppText>
            </View>
          ) : (
            <View style={{ gap: sp[2], paddingTop: sp[3] }}>
              <Skeleton height={56} width={200} />
              <Skeleton height={14} />
            </View>
          )
        }
      />
    </View>
  );
}
