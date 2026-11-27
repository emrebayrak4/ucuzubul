/**
 * Alert evaluation on price-change events → in-app Notification rows (dedupe via unique dedupeKey, cooldown via
 * PriceAlert.cooldownUntil). Email/push delivery is a later step that reads unsent notifications.
 */
import { evaluateAlerts, type AlertRule, type AlertState, type PriceChangeEvent } from "@pricora/algorithms";
import type { PrismaClient } from "@pricora/database";
import { conditionGroupOf } from "@pricora/contracts";
import { deliverPush } from "./push";

export const PRICE_EVENTS_QUEUE = "price-events";
export const SEARCH_INDEX_QUEUE = "search-index";
export const PRICE_REFRESH_QUEUE = "price-refresh";

export interface PriceEventJob {
  offerId: string;
  previousPriceCents: number | null;
  newPriceCents: number | null;
  previousInStock: boolean | null;
  newInStock: boolean | null;
  occurredAt: string;
}

const COOLDOWN_MINUTES = 360;

export async function processPriceEvent(prisma: PrismaClient, job: PriceEventJob): Promise<{ evaluated: number; created: number }> {
  const offer = await prisma.offer.findUnique({
    where: { id: job.offerId },
    include: { product: { select: { id: true, slug: true, title: true } } },
  });
  if (!offer) return { evaluated: 0, created: 0 };

  // Alerts watch one condition group (default new): a used/refurbished price change never fires a new-condition alert,
  // and best price / all-time low are computed within the same group only.
  const group = conditionGroupOf(offer.condition);
  const alerts = (await prisma.priceAlert.findMany({ where: { productId: offer.productId, active: true } })).filter((a) => conditionGroupOf(a.condition) === group);
  if (alerts.length === 0) return { evaluated: 0, created: 0 };

  const others = (
    await prisma.offer.findMany({
      where: { productId: offer.productId, isActive: true, NOT: { id: offer.id } },
      select: { priceCents: true, retailerId: true, condition: true },
    })
  ).filter((o) => conditionGroupOf(o.condition) === group);
  const groupOfferIds = (await prisma.offer.findMany({ where: { productId: offer.productId }, select: { id: true, condition: true } }))
    .filter((o) => conditionGroupOf(o.condition) === group)
    .map((o) => o.id);
  const atl = await prisma.priceHistory.aggregate({
    where: { productId: offer.productId, offerId: { in: groupOfferIds }, observedAt: { lt: new Date(job.occurredAt) } },
    _min: { priceCents: true },
  });
  const prevBest = [...others, { priceCents: job.previousPriceCents ?? offer.priceCents, retailerId: offer.retailerId }].sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];
  const newBest = [...others, { priceCents: job.newPriceCents ?? offer.priceCents, retailerId: offer.retailerId }].sort(
    (a, b) => a.priceCents - b.priceCents,
  )[0];

  const event: PriceChangeEvent = {
    productId: offer.productId,
    offerId: offer.id,
    retailerId: offer.retailerId,
    occurredAt: job.occurredAt,
    previousPriceCents: job.previousPriceCents,
    newPriceCents: job.newPriceCents,
    previousInStock: job.previousInStock,
    newInStock: job.newInStock,
    previousBestPriceCents: prevBest?.priceCents ?? null,
    previousBestRetailerId: prevBest?.retailerId ?? null,
    newBestPriceCents: newBest?.priceCents ?? null,
    newBestRetailerId: newBest?.retailerId ?? null,
    previousAllTimeLowCents: atl._min.priceCents,
  };

  const rules: AlertRule[] = [];
  const states: Record<string, AlertState> = {};
  for (const a of alerts) {
    const base = { id: a.id, productId: a.productId, retailerId: a.retailerId, active: a.active, cooldownMinutes: COOLDOWN_MINUTES };
    switch (a.type) {
      case "below_price":
        if (a.targetPriceCents === null) continue;
        rules.push({ ...base, type: "below_price", targetPriceCents: a.targetPriceCents });
        break;
      case "drop_percent":
        if (a.dropPercentBp === null) continue;
        rules.push({ ...base, type: "drop_percent", percent: a.dropPercentBp / 100 });
        break;
      default:
        rules.push({ ...base, type: a.type });
    }
    states[a.id] = { lastFiredAt: a.lastTriggeredAt };
  }

  const now = new Date();
  const results = evaluateAlerts(rules, event, states, now);
  let created = 0;
  for (const r of results) {
    if (!r.fire || !r.dedupeKey) continue;
    const alert = alerts.find((a) => a.id === r.ruleId);
    if (!alert) continue;
    if (alert.cooldownUntil && alert.cooldownUntil > now) continue;
    try {
      const note = await prisma.notification.create({
        data: {
          userId: alert.userId,
          alertId: alert.id,
          type: `price_alert.${alert.type}`,
          title: offer.product.title,
          body: r.message ?? "Price alert triggered",
          url: `/products/${offer.product.slug}`,
          channel: "in_app",
          dedupeKey: `${alert.id}:${r.dedupeKey}`,
        },
      });
      await prisma.priceAlert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: now, cooldownUntil: new Date(now.getTime() + COOLDOWN_MINUTES * 60_000) },
      });
      created++;
      if (alert.channels.includes("push")) {
        await deliverPush(prisma, note).catch((err: unknown) => {
          console.warn(`push delivery failed for notification ${note.id}: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
    } catch (err) {
      // Unique violation on dedupeKey = already notified; anything else is re-thrown.
      if (!(err instanceof Error && /Unique constraint|P2002/.test(err.message))) throw err;
    }
  }
  return { evaluated: rules.length, created };
}
