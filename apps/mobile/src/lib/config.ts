import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import { brand } from "@pricora/config/brand";

type Extra = { apiUrl?: string | null; webUrl?: string; eas?: { projectId?: string } };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * API origin resolution (no trailing /v1):
 * 1. EXPO_PUBLIC_API_URL (inlined at build time) / app.config `extra.apiUrl`
 * 2. In development on a physical device: the Metro host's LAN IP + :4400 (from Expo's hostUri)
 * 3. Android emulator default http://10.0.2.2:4400 (host loopback), iOS simulator http://localhost:4400
 */
function resolveApiUrl(): string {
  const raw: unknown = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl;
  const fromEnv = typeof raw === "string" ? raw.trim() : "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.20:8081"
  const host = hostUri?.split(":")[0];
  if (__DEV__ && host && Constants.isDevice && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:4400`;
  }
  return Platform.OS === "android" ? "http://10.0.2.2:4400" : "http://localhost:4400";
}

export const API_URL = resolveApiUrl();
const rawWeb: unknown = process.env.EXPO_PUBLIC_WEB_URL || extra.webUrl;
export const WEB_URL = (typeof rawWeb === "string" && rawWeb ? rawWeb : brand.url).replace(/\/+$/, "");
export const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || extra.eas?.projectId || null;
export { brand };

/**
 * Running inside Expo Go (dev only; production builds are standalone). Uses the native ExpoGo module check:
 * in SDK 58 Expo Go reports `executionEnvironment: "bare"` and `appOwnership: null`, so those can't be used.
 */
export const IN_EXPO_GO = isRunningInExpoGo();
// Expo Go's floating developer "Tools button" is a dev-only overlay; turn it off in Expo Go's dev menu
// (Tools button switch) instead of reserving layout space. Dev and production builds don't have it.
