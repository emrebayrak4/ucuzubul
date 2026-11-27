import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Alert, Keyboard, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { SearchResponse, Suggestion } from "@pricora/contracts";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { CategoryCircleLink } from "@/components/common";
import { ProductRail } from "@/components/product";
import { AppText, Button, Chip, DemoBadge, Divider, EmptyState, OfflineBanner, PressableRow, Row, SectionHeader } from "@/components/ui";
import { track } from "@/lib/analytics";
import { api, errorMessage } from "@/lib/api";
import { isValidGtin } from "@/lib/barcode";
import { money } from "@/lib/format";
import { param, useDebounced } from "@/lib/hooks";
import { useTabBarSpace } from "@/lib/tabBar";
import { addRecentSearch, clearRecentSearches, removeRecentSearch, useRecentSearches } from "@/lib/recentSearches";
import { tokens, typeStyle, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

function SuggestRow({ icon, title, subtitle, right, onPress, image }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; right?: string; onPress: () => void; image?: string | null }) {
  const { c } = useTheme();
  return (
    <PressableRow onPress={onPress} accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>
      <Row gap={3} style={{ paddingVertical: sp[2] }}>
        {image ? (
          <Image source={{ uri: image }} style={{ width: 36, height: 36, borderRadius: tokens.radius.sm, backgroundColor: c["surface-2"] }} contentFit="contain" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: tokens.radius.sm, backgroundColor: c["surface-2"], alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={icon} size={18} color={c["text-muted"]} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText numberOfLines={1}>{title}</AppText>
          {subtitle ? (
            <AppText variant="caption" color="text-muted" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right ? <AppText variant="priceSm">{right}</AppText> : null}
      </Row>
    </PressableRow>
  );
}

export default function SearchScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ q?: string; category?: string; focus?: string }>();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState(param(params.q) ?? "");
  const [submitted, setSubmitted] = useState(param(params.q) ?? "");
  const [category, setCategory] = useState<string | undefined>(param(params.category));
  const [focused, setFocused] = useState(false);
  const recents = useRecentSearches();
  const tabSpace = useTabBarSpace();

  // Deep links / Home: /search?q=… or ?category=… — adopt new params during render.
  const paramSig = `${param(params.q) ?? ""}|${param(params.category) ?? ""}`;
  const [seenSig, setSeenSig] = useState(paramSig);
  if (paramSig !== seenSig) {
    setSeenSig(paramSig);
    const q = param(params.q);
    if (q !== undefined) {
      setText(q);
      setSubmitted(q);
    }
    setCategory(param(params.category));
  }
  useEffect(() => {
    if (param(params.focus) !== "1") return;
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [params.focus]);

  const trimmed = text.trim();
  const debounced = useDebounced(trimmed, 180);
  const digits = trimmed.replace(/[\s-]/g, "");
  const looksLikeBarcode = /^\d{8,14}$/.test(digits);

  const suggest = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: ({ signal }) => api.search.suggest(debounced, { signal }),
    enabled: focused && debounced.length >= 2 && !looksLikeBarcode,
    staleTime: 5 * 60_000,
  });
  const trending = useQuery({ queryKey: ["home", "trending"], queryFn: ({ signal }) => api.search.trending({ signal }), staleTime: 30 * 60_000 });
  const cats = useQuery({ queryKey: ["home", "categories"], queryFn: ({ signal }) => api.catalog.categories({ signal }), staleTime: 60 * 60_000 });

  const scan = useMutation({
    mutationFn: (code: string) => api.scan.lookup(code),
    onSuccess: (res) => {
      if (res.status === "found") router.push({ pathname: "/products/[slug]", params: { slug: res.card.slug } });
      else Alert.alert("No match for this barcode", `${res.message} (${res.code})`);
    },
    onError: (e) => Alert.alert("Couldn't look up barcode", errorMessage(e)),
  });

  const submit = (q: string, opts?: { category?: string }) => {
    const t = q.trim();
    Keyboard.dismiss();
    setFocused(false);
    setText(t);
    setSubmitted(t);
    setCategory(opts?.category);
    if (t) addRecentSearch(t);
  };

  const pick = (s: Suggestion, i: number) => {
    track("search_suggestion_clicked", { position: i, suggestionType: s.type });
    if (trimmed) addRecentSearch(trimmed);
    setFocused(false);
    Keyboard.dismiss();
    if (s.type === "product") router.push({ pathname: "/products/[slug]", params: { slug: s.slug } });
    else if (s.type === "category") router.push({ pathname: "/categories/[slug]", params: { slug: s.slug } });
    else if (s.type === "brand") router.push({ pathname: "/brands/[slug]", params: { slug: s.slug } });
    else submit(s.text);
  };

  const groups = useMemo(() => {
    const items = suggest.data?.items ?? [];
    return {
      query: items.filter((s): s is Extract<Suggestion, { type: "query" }> => s.type === "query"),
      category: items.filter((s): s is Extract<Suggestion, { type: "category" }> => s.type === "category"),
      brand: items.filter((s): s is Extract<Suggestion, { type: "brand" }> => s.type === "brand"),
      product: items.filter((s): s is Extract<Suggestion, { type: "product" }> => s.type === "product"),
    };
  }, [suggest.data]);
  const allSugg = suggest.data?.items ?? [];
  const idx = (s: Suggestion) => allSugg.indexOf(s);

  const hasResults = !!(submitted || category);
  const showOverlay = focused || !hasResults;
  const scope = useMemo(() => ({ q: submitted || undefined, category }), [submitted, category]);

  const header = (first: SearchResponse | undefined) => (
    <View style={{ gap: sp[2], paddingTop: sp[2] }}>
      {first?.didYouMean && first.total > 0 ? (
        <Pressable onPress={() => submit(first.didYouMean!)} accessibilityRole="button">
          <AppText>
            Did you mean{" "}
            <AppText variant="label" color="primary">
              {first.didYouMean}
            </AppText>
            ?
          </AppText>
        </Pressable>
      ) : null}
      {first?.parsed && (first.parsed.maxPriceCents !== null || first.parsed.category || first.parsed.brand) ? (
        <AppText variant="caption" color="text-muted">
          Understood:{" "}
          {[
            first.parsed.category?.name,
            first.parsed.brand?.name,
            first.parsed.maxPriceCents !== null ? `under ${money(first.parsed.maxPriceCents, "USD", "auto")}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </AppText>
      ) : null}
      {category ? (
        <Row>
          <Chip label={`Category: ${category}`} icon="close" selected onPress={() => setCategory(undefined)} />
        </Row>
      ) : null}
    </View>
  );

  const zeroResults = (first: SearchResponse, clear: () => void) => (
    <View style={{ paddingHorizontal: GUTTER }}>
      <EmptyState icon="search-outline" title={`No results${submitted ? ` for “${submitted}”` : ""}`} message="Check the spelling, use fewer words, or try one of these." />
      {first.didYouMean ? <Button title={`Search “${first.didYouMean}” instead`} onPress={() => submit(first.didYouMean!)} /> : null}
      <Button title="Clear filters" variant="secondary" style={{ marginTop: sp[2] }} onPress={clear} />
      {cats.data ? (
        <>
          <SectionHeader title="Browse categories" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ paddingHorizontal: GUTTER }}>
            {cats.data.items.map((cat) => (
              <CategoryCircleLink key={cat.id} slug={cat.slug} name={cat.name} size={60} />
            ))}
          </ScrollView>
        </>
      ) : null}
      {trending.data?.products.length ? (
        <>
          <SectionHeader title="Trending instead" />
          <ProductRail items={trending.data.products} />
        </>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      <OfflineBanner />
      <View style={{ paddingHorizontal: GUTTER, paddingTop: sp[2], paddingBottom: sp[2] }}>
        <Row gap={2}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: sp[2],
              minHeight: 46,
              paddingHorizontal: sp[3],
              borderRadius: tokens.radius.full,
              borderWidth: 1,
              borderColor: focused ? c.primary : c["border-strong"],
              backgroundColor: c.surface,
            }}
          >
            <Ionicons name="search" size={18} color={c["text-muted"]} />
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onSubmitEditing={() => (looksLikeBarcode && isValidGtin(digits) ? scan.mutate(digits) : submit(text))}
              placeholder="Search products, brands, UPC"
              placeholderTextColor={c["text-muted"]}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              accessibilityLabel="Search"
              style={[typeStyle("md"), { flex: 1, color: c.text, paddingVertical: sp[2] }]}
            />
            <Pressable onPress={() => router.push("/scan")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Scan a barcode">
              <Ionicons name="barcode-outline" size={22} color={c.primary} />
            </Pressable>
          </View>
          {focused ? (
            <Button
              title="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => {
                Keyboard.dismiss();
                setFocused(false);
                setText(submitted);
              }}
            />
          ) : null}
        </Row>
      </View>

      {hasResults ? (
        <View style={{ flex: 1, display: showOverlay ? "none" : "flex" }}>
          <ProductBrowser key={`${submitted}|${category ?? ""}`} scope={scope} header={header} empty={zeroResults} analyticsKind="text" bottomSpace={tabSpace} />
        </View>
      ) : null}

      {showOverlay ? (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: tabSpace }}>
          {looksLikeBarcode ? (
            <SuggestRow
              icon="barcode-outline"
              title={`Look up barcode ${digits}`}
              subtitle={isValidGtin(digits) ? "UPC / EAN / GTIN" : "Check digit doesn't match — double-check the number"}
              onPress={() => (isValidGtin(digits) ? scan.mutate(digits) : Alert.alert("Invalid barcode", "That number's check digit doesn't match a UPC/EAN code."))}
            />
          ) : null}

          {trimmed.length >= 2 && !looksLikeBarcode ? (
            <>
              <SuggestRow icon="search" title={`Search “${trimmed}”`} onPress={() => submit(trimmed)} />
              {groups.category.length ? (
                <>
                  <AppText variant="overline" color="text-muted" style={{ marginTop: sp[3] }}>
                    Categories
                  </AppText>
                  {groups.category.map((s) => (
                    <SuggestRow
                      key={`c${s.slug}`}
                      icon="grid-outline"
                      title={s.text}
                      subtitle={[s.parent, s.count !== undefined ? `${s.count} products` : null].filter(Boolean).join(" · ") || undefined}
                      onPress={() => pick(s, idx(s))}
                    />
                  ))}
                </>
              ) : null}
              {groups.brand.length ? (
                <>
                  <AppText variant="overline" color="text-muted" style={{ marginTop: sp[3] }}>
                    Brands
                  </AppText>
                  {groups.brand.map((s) => (
                    <SuggestRow key={`b${s.slug}`} icon="ribbon-outline" title={s.text} subtitle={s.count !== undefined ? `${s.count} products` : undefined} onPress={() => pick(s, idx(s))} />
                  ))}
                </>
              ) : null}
              {groups.product.length ? (
                <>
                  <AppText variant="overline" color="text-muted" style={{ marginTop: sp[3] }}>
                    Products
                  </AppText>
                  {groups.product.map((s) => (
                    <View key={`p${s.slug}`}>
                      <SuggestRow
                        icon="pricetag-outline"
                        image={s.imageUrl}
                        title={s.text}
                        subtitle={[s.category, s.storeCount ? `${s.storeCount} stores` : null].filter(Boolean).join(" · ") || undefined}
                        right={s.lowestPriceCents !== null ? money(s.lowestPriceCents) : undefined}
                        onPress={() => pick(s, idx(s))}
                      />
                      {s.hasDemoData ? (
                        <View style={{ marginLeft: 48, marginTop: -4, marginBottom: 4 }}>
                          <DemoBadge />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : null}
              {groups.query.length ? (
                <>
                  <AppText variant="overline" color="text-muted" style={{ marginTop: sp[3] }}>
                    Searches
                  </AppText>
                  {groups.query.map((s) => (
                    <SuggestRow key={`q${s.text}`} icon="trending-up-outline" title={s.text} onPress={() => pick(s, idx(s))} />
                  ))}
                </>
              ) : null}
              {suggest.data && allSugg.length === 0 ? (
                <AppText color="text-muted" style={{ marginTop: sp[3] }}>
                  No suggestions — press search to see all results.
                </AppText>
              ) : null}
            </>
          ) : (
            <>
              {recents.length ? (
                <>
                  <SectionHeader title="Recent searches" action={{ label: "Clear", onPress: clearRecentSearches }} />
                  {recents.map((r) => (
                    <View key={r}>
                      <Row>
                        <View style={{ flex: 1 }}>
                          <SuggestRow icon="time-outline" title={r} onPress={() => submit(r)} />
                        </View>
                        <Pressable onPress={() => removeRecentSearch(r)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${r} from recent searches`} style={{ padding: sp[2] }}>
                          <Ionicons name="close" size={18} color={c["text-muted"]} />
                        </Pressable>
                      </Row>
                      <Divider />
                    </View>
                  ))}
                </>
              ) : null}
              {trending.data?.queries.length ? (
                <>
                  <SectionHeader title="Trending searches" />
                  <Row gap={2} style={{ flexWrap: "wrap" }}>
                    {trending.data.queries.slice(0, 12).map((t) => (
                      <Chip key={t.text} label={t.text} icon="trending-up-outline" onPress={() => submit(t.text)} />
                    ))}
                  </Row>
                </>
              ) : null}
              {cats.data ? (
                <>
                  <SectionHeader title="Browse categories" action={{ label: "All", onPress: () => router.push("/categories") }} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ paddingHorizontal: GUTTER }}>
                    {cats.data.items.map((cat) => (
                      <CategoryCircleLink key={cat.id} slug={cat.slug} name={cat.name} size={60} />
                    ))}
                  </ScrollView>
                </>
              ) : null}
              {trending.data?.products.length ? (
                <>
                  <SectionHeader title="Trending products" />
                  <ProductRail items={trending.data.products} />
                </>
              ) : null}
              <SectionHeader title="Have a barcode?" />
              <AppText color="text-muted">Type the 8–14 digit UPC/EAN above, or scan it with the camera.</AppText>
              <Button title="Scan a barcode" icon="barcode-outline" variant="secondary" style={{ marginTop: sp[3] }} onPress={() => router.push("/scan")} />
            </>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
