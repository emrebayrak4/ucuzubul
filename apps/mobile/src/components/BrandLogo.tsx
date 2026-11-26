import { Image } from "expo-image";
import { brand } from "@/lib/config";
import { useTheme } from "@/lib/theme";

// Copies of packages/config/assets (1947×583). White variant for dark mode.
const LOGO = require("../../assets/brand/whichless-logo.png");
const LOGO_WHITE = require("../../assets/brand/whichless-logo-white.png");
const RATIO = 1947 / 583;

export function BrandLogo({ height = 28 }: { height?: number }) {
  const { scheme } = useTheme();
  return (
    <Image
      source={scheme === "dark" ? LOGO_WHITE : LOGO}
      style={{ height, width: height * RATIO }}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel={brand.name}
    />
  );
}
