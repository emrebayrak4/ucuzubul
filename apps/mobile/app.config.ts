import type { ConfigContext, ExpoConfig } from "expo/config";
import { darkColors, lightColors } from "@pricora/design-tokens";

/**
 * Expo app config. Brand values mirror packages/config/src/brand.ts (single source of truth for the name);
 * keep `name`/`slug`/`scheme` in sync if the placeholder brand changes.
 *
 * Universal links: `associatedDomains` / Android `intentFilters` below are placeholders. They only work after
 * the web app serves /.well-known/apple-app-site-association and /.well-known/assetlinks.json (A02 / ORCH).
 */
const WEB_HOST = "pricora.com";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Pricora",
  slug: "pricora",
  scheme: "pricora",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.afterwish.pricora",
    supportsTablet: false,
    associatedDomains: [`applinks:${WEB_HOST}`],
    infoPlist: {
      NSCameraUsageDescription: "Pricora uses the camera to scan product barcodes and compare prices.",
      NSFaceIDUsageDescription: "Use Face ID to unlock your Pricora account.",
    },
  },
  android: {
    package: "com.afterwish.pricora",
    permissions: ["android.permission.CAMERA", "android.permission.USE_BIOMETRIC", "android.permission.POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: WEB_HOST, pathPrefix: "/products/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/flights" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/hotels" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    [
      "expo-camera",
      {
        cameraPermission: "Pricora uses the camera to scan product barcodes and compare prices.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    ["expo-local-authentication", { faceIDPermission: "Use Face ID to unlock your Pricora account." }],
    "expo-notifications",
    [
      "expo-splash-screen",
      { backgroundColor: lightColors.bg, dark: { backgroundColor: darkColors.bg }, imageWidth: 120 },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL || `https://${WEB_HOST}`,
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } : undefined,
  },
});
