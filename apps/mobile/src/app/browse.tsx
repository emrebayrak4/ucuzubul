import { Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { ProductBrowser } from "@/components/browse/ProductBrowser";
import { AppText, OfflineBanner } from "@/components/ui";
import { filtersFromParams, parseSort } from "@/lib/browse";
import { param } from "@/lib/hooks";
import { tokens, useTheme } from "@/lib/theme";

/**
 * Generic listing for Home tiles and deep links: /browse?title=Under%20%2425&maxPrice=2500&sort=best_deal,
 * /browse?minDiscount=0.25, /browse?q=…&category=… — every filter stays editable.
 */
export default function BrowseScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const sig = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputed when the params change
  const scope = useMemo(() => ({ q: param(params.q), category: param(params.category) }), [sig]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => filtersFromParams(params), [sig]);
  const title = param(params.title) ?? "Products";
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title }} />
      <OfflineBanner />
      <ProductBrowser
        key={sig}
        scope={scope}
        initialFilters={initial}
        initialSort={parseSort(param(params.sort))}
        header={() =>
          param(params.subtitle) ? (
            <AppText color="text-muted" style={{ marginTop: tokens.spacing[2] }}>
              {param(params.subtitle)}
            </AppText>
          ) : null
        }
      />
    </View>
  );
}
