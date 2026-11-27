import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { api } from "./api";
import { EAS_PROJECT_ID } from "./config";

/**
 * Push notifications.
 * - The Expo push token needs an EAS projectId (EXPO_PUBLIC_EAS_PROJECT_ID) and a physical device.
 * - The token is registered with `POST /v1/me/devices` (signed-in users) so price alerts and followed-store
 *   coupons can be pushed, and unregistered with `DELETE /v1/me/devices/:token` on logout.
 * - Payloads carry `data.url` (an app path, PushPayloadData in @pricora/contracts) which we route to on tap.
 */
const TOKEN_KEY = "pricora.push.token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushRegistration =
  | { status: "registered"; token: string; sentToApi: boolean }
  | { status: "denied" }
  | { status: "unavailable"; reason: string };

async function sendTokenToApi(token: string): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
  try {
    await api.me.devices.register({ token, platform: Platform.OS });
    return true;
  } catch {
    return false;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
}

/** Called on logout: removes this device's token from the account (best effort). */
export async function unregisterPush(): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) return;
  await api.me.devices.remove(token).catch(() => undefined);
}

/**
 * Silent refresh after login / app start: only when the user already granted permission (never prompts).
 * Keeps the server's lastSeenAt fresh and re-registers rotated tokens.
 */
export async function refreshPushRegistration(): Promise<void> {
  if (!Device.isDevice || !EAS_PROJECT_ID) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    await sendTokenToApi(token);
  } catch {
    // ignore: push stays off until the user enables it in Notifications settings
  }
}

export async function registerForPush(): Promise<PushRegistration> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("price-alerts", {
      name: "Price alerts",
      // eslint-disable-next-line import/namespace -- enum is re-exported via a nested `export *` the resolver cannot follow (tsc verifies it)
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync("coupons", {
      name: "Coupons from followed stores",
      // eslint-disable-next-line import/namespace -- see above
      importance: Notifications.AndroidImportance.LOW,
    });
  }
  if (!Device.isDevice) return { status: "unavailable", reason: "Push notifications need a physical device." };

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return { status: "denied" };

  if (!EAS_PROJECT_ID) {
    return { status: "unavailable", reason: "Push is not configured for this build yet (missing EAS project id)." };
  }
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
    const sentToApi = await sendTokenToApi(token);
    return { status: "registered", token, sentToApi };
  } catch (e) {
    return { status: "unavailable", reason: e instanceof Error ? e.message : "Could not get a push token." };
  }
}

export async function getPushPermissionGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Notification payloads carry `data.url` as an app path (e.g. "/products/slug"). */
export function listenForNotificationTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === "string" && url.startsWith("/")) {
      router.push(url as Parameters<typeof router.push>[0]);
    }
  };
  open(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
