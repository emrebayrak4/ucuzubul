import Ionicons from "@expo/vector-icons/Ionicons";
import { NativeTabs } from "expo-router/native-tabs";
import { FONTS, useTheme } from "@/lib/theme";

/**
 * Native bottom tabs (UITabBarController on iOS, Material BottomNavigationView on Android)
 * via expo-router/native-tabs. iOS uses SF Symbols; Android uses Ionicons rendered to images.
 */
export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <NativeTabs
      tintColor={c.primary}
      backgroundColor={c.surface}
      iconColor={{ default: c["text-muted"], selected: c.primary }}
      labelStyle={{
        default: { fontFamily: FONTS.semibold, fontSize: 12, color: c["text-muted"] },
        selected: { fontFamily: FONTS.semibold, fontSize: 12, color: c.primary },
      }}
      indicatorColor={c["primary-soft"]}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="home-outline" />}
        />
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
        <NativeTabs.Trigger.Icon
          sf={{ default: "heart", selected: "heart.fill" }}
          src={<NativeTabs.Trigger.VectorIcon family={Ionicons} name="heart-outline" />}
        />
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
