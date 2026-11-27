import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { PhotoCredit } from "@/components/common";
import { AppText, Chip, ErrorState, OfflineBanner, Row, Skeleton } from "@/components/ui";
import { api, errorMessage, isNotFound } from "@/lib/api";
import { filtersFromParams, parseSort } from "@/lib/browse";
import { param } from "@/lib/hooks";
import { categoryPhoto, photoSrc } from "@/lib/photos";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Category: photo header, breadcrumbs, subcategory chips, top brands, then the filterable product listing. */
/** Category buying guide (plain paragraphs), collapsed to 3 lines. */
function GuideText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      <AppText color="text-muted" numberOfLines={open ? undefined : 3}>
        {text.trim()}
      </AppText>
      <AppText variant="caption" color="primary" onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        {open ? "Show less" : "Read the buying guide"}
      </AppText>
    </View>
  );
}

export default function CategoryScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const slug = param(params.slug) ?? "";
  const cat = useQuery({ queryKey: ["category", slug], queryFn: ({ signal }) => api.catalog.category(slug, { signal }), enabled: !!slug });
  const scope = useMemo(() => ({ category: slug }), [slug]);
  const initial = useMemo(() => filtersFromParams(params), [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = cat.data;
  const photo = categoryPhoto(slug);
  const chips = d ? (d.children.length ? d.children : d.siblings.filter((s) => s.slug !== slug)) : [];

  if (cat.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ErrorState message={isNotFound(cat.error) ? "This category doesn't exist." : errorMessage(cat.error)} onRetry={() => void cat.refetch()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d?.category.name ?? "" }} />
      <OfflineBanner />
      <ProductBrowser
        key={slug}
        scope={scope}
        initialFilters={initial}
        initialSort={parseSort(param(params.sort))}
        header={() => (
          <View style={{ gap: sp[3], paddingTop: sp[2] }}>
            {photo ? (
              <View style={{ marginHorizontal: -GUTTER }}>
                <Image source={{ uri: photoSrc(photo, 900, 300) }} style={{ height: 120, backgroundColor: photo.color }} contentFit="cover" accessibilityLabel={photo.alt} />
                <View style={{ position: "absolute", left: GUTTER, bottom: sp[2], right: 40 }}>
                  <AppText variant="h2" style={{ color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }} numberOfLines={1}>
                    {d?.category.name ?? ""}
                  </AppText>
                </View>
                <PhotoCredit photo={photo} style={{ position: "absolute", right: GUTTER, bottom: sp[2] }} />
              </View>
            ) : d ? (
              <AppText variant="h2" accessibilityRole="header">
                {d.category.name}
              </AppText>
            ) : null}
            {d && d.breadcrumbs.length > 1 ? (
              <Row gap={1} style={{ flexWrap: "wrap" }}>
                {d.breadcrumbs.slice(0, -1).map((b) => (
                  <Chip key={b.slug} label={`‹ ${b.name}`} onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug: b.slug } })} />
                ))}
              </Row>
            ) : null}
            {!d ? <Skeleton height={36} /> : null}
            {chips.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
                {chips.map((ch) => (
                  <Chip key={ch.id} label={`${ch.name} · ${ch.productCount}`} onPress={() => router.push({ pathname: "/categories/[slug]", params: { slug: ch.slug } })} />
                ))}
              </ScrollView>
            ) : null}
            {d ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
                <Chip label={`Best ${d.category.name} deals`} icon="trophy-outline" onPress={() => router.push({ pathname: "/best/[slug]", params: { slug } })} />
                <Chip label={`Popular in ${d.category.name}`} icon="flame-outline" onPress={() => router.push({ pathname: "/popular", params: { category: slug } })} />
                <Chip label="Price drops" icon="trending-down-outline" onPress={() => router.push({ pathname: "/price-drops", params: { category: slug } })} />
              </ScrollView>
            ) : null}
            {d?.seoText ? <GuideText text={d.seoText} /> : null}
            {d?.topBrands.length ? (
              <View style={{ gap: sp[1.5] }}>
                <AppText variant="label" color="text-muted">
                  Top brands
                </AppText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: sp[2], paddingHorizontal: GUTTER }}>
                  {d.topBrands.map((b) => (
                    <Chip key={b.slug} label={b.name} onPress={() => router.push({ pathname: "/brands/[slug]", params: { slug: b.slug } })} />
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
