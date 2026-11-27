import { Image } from "expo-image";
import { Linking, SectionList, View } from "react-native";
import { AppText, Divider, PressableRow, Row } from "@/components/ui";
import { allCredits, photoSrc } from "@/lib/photos";
import { tokens, useTheme } from "@/lib/theme";

const sp = tokens.spacing;
const GUTTER = tokens.layout.gutter.base;

/** Unsplash attributions for every photo used in the app (promo tiles, category circles). */
export default function CreditsScreen() {
  const { c } = useTheme();
  const credits = allCredits();
  const sections = (["Promo", "Category"] as const).map((g) => ({ title: g === "Promo" ? "Promo tiles" : "Category photos", data: credits.filter((x) => x.group === g) }));
  return (
    <SectionList
      style={{ backgroundColor: c.bg }}
      sections={sections}
      keyExtractor={(x) => x.group + x.key}
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: sp[16] }}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={
        <AppText color="text-muted" style={{ marginVertical: sp[3] }}>
          Photos from Unsplash, used under the Unsplash License. Tap a row to see the photo on Unsplash. Product images and store logos belong to their owners.
        </AppText>
      }
      renderSectionHeader={({ section }) => (
        <View style={{ backgroundColor: c.bg, paddingVertical: sp[2] }}>
          <AppText variant="overline" color="text-muted">
            {section.title}
          </AppText>
        </View>
      )}
      ItemSeparatorComponent={Divider}
      renderItem={({ item }) => (
        <PressableRow onPress={() => void Linking.openURL(item.unsplashUrl)} accessibilityLabel={`${item.key}: photo by ${item.photographer} on Unsplash`}>
          <Row gap={3} style={{ paddingVertical: sp[2] }}>
            <Image source={{ uri: photoSrc(item, 96) }} style={{ width: 48, height: 48, borderRadius: tokens.radius.sm, backgroundColor: item.color }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{item.key.replace(/-/g, " ")}</AppText>
              <AppText variant="caption" color="text-muted" numberOfLines={1}>
                Photo by{" "}
                <AppText variant="caption" color="primary" onPress={() => void Linking.openURL(item.photographerUrl)}>
                  {item.photographer}
                </AppText>{" "}
                on Unsplash
              </AppText>
            </View>
          </Row>
        </PressableRow>
      )}
    />
  );
}
