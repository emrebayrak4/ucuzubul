import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/native-tabs";
import { GlassTabBar } from "@/components/GlassTabBar";
import { USES_SYSTEM_LIQUID_GLASS } from "@/lib/tabBar";
import { FONTS, useTheme } from "@/lib/theme";

/**
 * iOS 26+: system Liquid Glass tab bar (UITabBarController via expo-router NativeTabs). It floats, refracts,
 * minimizes on scroll and honours Reduce Transparency / Reduce Motion natively.
 * Android + iOS < 26: JS tabs with the floating glass pill (`GlassTabBar`, prominent center Scan button).
 */
export default function TabsLayout() {
  return USES_SYSTEM_LIQUID_GLASS ? <SystemGlassTabs /> : <FloatingGlassTabs />;
}

function FloatingGlassTabs() {
  const { c } = useTheme();
  return (
    <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="search" options={{ title: "Search" }} />
      <Tabs.Screen name="scan" options={{ title: "Scan" }} />
      <Tabs.Screen name="saved" options={{ title: "Saved" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}

function SystemGlassTabs() {
  const { c } = useTheme();
  return (
    <NativeTabs
      tintColor={c.primary}
      minimizeBehavior="onScrollDown"
      labelStyle={{
        default: { fontFamily: FONTS.semibold, fontSize: 11 },
        selected: { fontFamily: FONTS.semibold, fontSize: 11, color: c.primary },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="search-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scan">
        <NativeTabs.Trigger.Label>Scan</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="barcode.viewfinder" src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="barcode-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>Saved</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "heart", selected: "heart.fill" }} src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="heart-outline" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="person-circle-outline" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
