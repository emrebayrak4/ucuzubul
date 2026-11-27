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
      // White "w" only, inside the 66% safe zone; the launcher mask supplies the shape on the logo blue.
      foregroundImage: "./assets/brand/whichless-adaptive-foreground.png",
      backgroundColor: "#0029F8",
    },
    permissions: ["android.permission.CAMERA", "android.permission.USE_BIOMETRIC", "android.permission.POST_NOTIFICATIONS", "android.permission.ACCESS_COARSE_LOCATION"],
    blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: WEB_HOST, pathPrefix: "/products/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/categories/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/brands/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/stores/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/coupons" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/deals" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/compare" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/best/" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/basket" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/price-drops" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/popular" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/new" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/search" },
          { scheme: "https", host: WEB_HOST, pathPrefix: "/reset-password" },
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
      "expo-location",
      {
        locationWhenInUsePermission: `${brand.name} uses your location only when you tap “Use my location” to fill in your ZIP code for tax estimates.`,
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
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
    // Omit when unset: a `null` here reaches the app as `{}` through the dev manifest (crashed `.replace` in config.ts).
    apiUrl: process.env.EXPO_PUBLIC_API_URL || undefined,
    webUrl: process.env.EXPO_PUBLIC_WEB_URL || brand.url,
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } : undefined,
  },
});
