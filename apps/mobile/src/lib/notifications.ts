import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { EAS_PROJECT_ID } from "./config";

/**
 * Push notifications.
 * - The Expo push token needs an EAS projectId (EXPO_PUBLIC_EAS_PROJECT_ID) and a physical device.
 * - The API has no device-registration endpoint yet: the token is kept locally and a
 *   `POST /v1/me/devices` endpoint is requested from A04 in docs/TASKS.md. `sendTokenToApi` is the
 *   single place to wire it once it exists.
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

async function sendTokenToApi(_token: string): Promise<boolean> {
  // Pending A04: POST /v1/me/devices { token, platform }. Until then the token stays on the device.
  return false;
}

export async function registerForPush(): Promise<PushRegistration> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("price-alerts", {
      name: "Price alerts",
      // eslint-disable-next-line import/namespace -- enum is re-exported via a nested `export *` the resolver cannot follow (tsc verifies it)
      importance: Notifications.AndroidImportance.DEFAULT,
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
