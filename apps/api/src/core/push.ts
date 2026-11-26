/**
 * Expo push delivery for alert notifications. Payload `data.url` is an app path the mobile app routes to.
 * Expo's push endpoint needs no credentials for basic sends (EXPO_ACCESS_TOKEN optional for enhanced security).
 */
import type { PushPayloadData } from "@pricora/contracts";
import type { PrismaClient } from "@pricora/database";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function deliverPush(
  prisma: PrismaClient,
  notification: { id: string; userId: string; title: string; body: string; url: string | null; type: string },
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const devices = await prisma.pushDevice.findMany({ where: { userId: notification.userId } });
  if (devices.length === 0) return 0;
  const data: PushPayloadData = { url: notification.url ?? "/account/alerts", notificationId: notification.id, type: notification.type };
  const messages = devices.map((d) => ({ to: d.token, title: notification.title, body: notification.body, data, sound: "default" }));
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  if (process.env["EXPO_ACCESS_TOKEN"]) headers["authorization"] = `Bearer ${process.env["EXPO_ACCESS_TOKEN"]}`;
  const res = await fetchImpl(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`Expo push failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  // Drop tokens Expo reports as no longer registered.
  const dead = (body.data ?? []).flatMap((t, i) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? [devices[i]?.token] : []));
  const deadTokens = dead.filter((t): t is string => Boolean(t));
  if (deadTokens.length) await prisma.pushDevice.deleteMany({ where: { token: { in: deadTokens } } });
  await prisma.notification.update({ where: { id: notification.id }, data: { sentAt: new Date() } });
  return devices.length - deadTokens.length;
}
