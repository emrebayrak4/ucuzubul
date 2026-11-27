/**
 * Fare alerts ("Track prices"): TravelAlert(kind=flight) rows evaluated against the same fare source as search.
 * Creates in-app Notifications with dedupe (one per alert+price) and a 24 h cooldown per alert.
 */
import type { PrismaClient } from "@pricora/database";
import { todayUtc } from "./geo";
import type { FlightFareService } from "./service";

export const TRAVEL_ALERTS_QUEUE = "travel-alerts";
export const FLIGHT_ALERT_COOLDOWN_MS = 24 * 3_600_000;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export interface FlightAlertRunStats {
  evaluated: number;
  notified: number;
  expired: number;
  skippedCooldown: number;
}

export async function evaluateFlightAlerts(prisma: PrismaClient, fares: FlightFareService, now = new Date()): Promise<FlightAlertRunStats> {
  const stats: FlightAlertRunStats = { evaluated: 0, notified: 0, expired: 0, skippedCooldown: 0 };
  const today = todayUtc();
  const alerts = await prisma.travelAlert.findMany({
    where: { kind: "flight", active: true, fromIata: { not: null }, toIata: { not: null }, departDate: { not: null } },
    take: 5000,
  });
  for (const a of alerts) {
    const depart = iso(a.departDate!);
    if (depart < today) {
      await prisma.travelAlert.update({ where: { id: a.id }, data: { active: false } });
      stats.expired++;
      continue;
    }
    if (a.lastTriggeredAt && now.getTime() - a.lastTriggeredAt.getTime() < FLIGHT_ALERT_COOLDOWN_MS) {
      stats.skippedCooldown++;
      continue;
    }
    const from = a.fromIata!.trim();
    const to = a.toIata!.trim();
    const ret = a.returnDate ? iso(a.returnDate) : null;
    stats.evaluated++;
    const current = await fares.cheapestForAlert(from, to, depart, ret);
    if (!current || a.targetPriceCents === null || current.priceCents >= a.targetPriceCents) continue;
    const sp = new URLSearchParams({ from, to, depart });
    if (ret) sp.set("return", ret);
    try {
      await prisma.notification.create({
        data: {
          userId: a.userId,
          type: "travel_alert.flight",
          title: `Price drop: ${from} → ${to}`,
          body: `Now from ${dollars(current.priceCents)} per adult${ret ? " round trip" : ""} (you're tracking below ${dollars(a.targetPriceCents)}).${current.source === "demo" ? " Demo fare — not bookable." : ""}`,
          url: `/travel/flights/search?${sp.toString()}`,
          channel: "in_app",
          dedupeKey: `travel-flight:${a.id}:${current.priceCents}`,
        },
      });
      await prisma.travelAlert.update({ where: { id: a.id }, data: { lastTriggeredAt: now } });
      stats.notified++;
    } catch (err) {
      // Unique violation on dedupeKey = this price was already notified.
      if (!(err instanceof Error && /Unique constraint|P2002/.test(err.message))) throw err;
    }
  }
  return stats;
}
