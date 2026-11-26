import type { ConfigContext, ExpoConfig } from "expo/config";
import { brand } from "@pricora/config/brand";
import { darkColors, lightColors } from "@pricora/design-tokens";

/**
 * Expo app config. Name, domain and copy come from packages/config/src/brand.ts (single source of truth).
 * Brand images in ./assets/brand are copies of packages/config/assets (re-copy if the brand art changes).
 *
 * Universal links: `associatedDomains` / Android `intentFilters` below are placeholders. They only work after
 * the web app serves /.well-known/apple-app-site-association and /.well-known/assetlinks.json (A02 / ORCH).
 */
const WEB_HOST = brand.domain;
const cameraCopy = `${brand.name} uses the camera to scan product barcodes and compare prices.`;
const faceIdCopy = `Use Face ID to unlock your ${brand.name} account.`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: brand.name,
  slug: "whichless",
  // `pricora://` kept temporarily so links created before the rebrand still open the app.
  scheme: ["whichless", "pricora"],
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/brand/whichless-app-icon.png",
  ios: {
    bundleIdentifier: "com.afterwish.whichless",
    supportsTablet: false,
    associatedDomains: [`applinks:${WEB_HOST}`],
    infoPlist: {
      NSCameraUsageDescription: cameraCopy,
      NSFaceIDUsageDescription: faceIdCopy,
    },
  },
  android: {
    package: "com.afterwish.whichless",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/whichless-mark.png",
      backgroundColor: "#FFFFFF",
    },
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
    ["expo-camera", { cameraPermission: cameraCopy, microphonePermission: false, recordAudioAndroid: false }],
    ["expo-local-authentication", { faceIDPermission: faceIdCopy }],
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/brand/whichless-mark.png",
        imageWidth: 120,
        resizeMode: "contain",
        backgroundColor: lightColors.bg,
        dark: { image: "./assets/brand/whichless-mark.png", backgroundColor: darkColors.bg },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL || brand.url,
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } : undefined,
  },
});
