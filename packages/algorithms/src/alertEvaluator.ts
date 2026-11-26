/**
 * Price alert evaluation: given a rule and a price-change event, decide whether to fire.
 * Includes a deterministic dedupe key (same state never notifies twice) and a cooldown.
 */
import { formatUsd } from "./money";

interface AlertRuleBase {
  id: string;
  productId: string;
  /** Restrict to one retailer; undefined = any retailer. */
  retailerId?: string | null;
  active?: boolean;
  /** Minimum minutes between two notifications of this rule. Default 360 (6h). */
  cooldownMinutes?: number;
}

export type AlertRule =
  | (AlertRuleBase & { type: "below_price"; targetPriceCents: number })
  | (AlertRuleBase & { type: "drop_percent"; percent: number; /** Price when the alert was created; else event.previousPriceCents. */ referencePriceCents?: number | null })
  | (AlertRuleBase & { type: "back_in_stock" })
  | (AlertRuleBase & { type: "new_cheaper_store" })
  | (AlertRuleBase & { type: "all_time_low" })
  | (AlertRuleBase & { type: "coupon" });

export type AlertType = AlertRule["type"];

export interface PriceChangeEvent {
  productId: string;
  offerId: string;
  retailerId: string;
  occurredAt: Date | string;
  previousPriceCents?: number | null;
  newPriceCents?: number | null;
  previousInStock?: boolean | null;
  newInStock?: boolean | null;
  /** Lowest price across all stores before/after this event (for new_cheaper_store). */
  previousBestPriceCents?: number | null;
  previousBestRetailerId?: string | null;
  newBestPriceCents?: number | null;
  newBestRetailerId?: string | null;
  /** All-time low BEFORE this event. */
  previousAllTimeLowCents?: number | null;
  coupon?: { id: string; code?: string | null; description?: string | null } | null;
}

export interface AlertState {
  lastFiredAt?: Date | string | null;
  /** Dedupe keys already notified for this rule (most recent ones are enough). */
  firedKeys?: Iterable<string> | null;
}

export type AlertSkipReason = "inactive" | "product_mismatch" | "retailer_mismatch" | "not_matched" | "duplicate" | "cooldown" | "invalid_event";

export interface AlertEvaluation {
  fire: boolean;
  ruleId: string;
  type: AlertType;
  dedupeKey: string | null;
  skipReason: AlertSkipReason | null;
  /** Neutral notification text (only when fire = true). */
  message: string | null;
}

const DEFAULT_COOLDOWN_MIN = 360;
const toMs = (d: Date | string) => (d instanceof Date ? d.getTime() : Date.parse(d));
const validPrice = (n: number | null | undefined): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

function match(rule: AlertRule, e: PriceChangeEvent): { key: string; message: string } | null {
  const p = e.newPriceCents;
  switch (rule.type) {
    case "below_price": {
      if (!validPrice(p) || p > rule.targetPriceCents || e.newInStock === false) return null;
      const prev = e.previousPriceCents;
      // Fire on crossing the target, or on a further drop while already below it.
      if (validPrice(prev) && prev <= rule.targetPriceCents && p >= prev) return null;
      return { key: `below:${p}`, message: `Price is now ${formatUsd(p)}, at or below your target of ${formatUsd(rule.targetPriceCents)}.` };
    }
    case "drop_percent": {
      const ref = validPrice(rule.referencePriceCents) ? rule.referencePriceCents : e.previousPriceCents;
      if (!validPrice(p) || !validPrice(ref) || p >= ref) return null;
      const drop = ((ref - p) / ref) * 100;
      if (drop + 1e-9 < rule.percent) return null;
      return { key: `drop:${rule.percent}:${p}`, message: `Price dropped ${Math.round(drop)}% to ${formatUsd(p)} (from ${formatUsd(ref)}).` };
    }
    case "back_in_stock": {
      if (e.newInStock !== true || e.previousInStock !== false) return null;
      return { key: `stock:${e.offerId}:${new Date(toMs(e.occurredAt)).toISOString().slice(0, 10)}`, message: `Back in stock${validPrice(p) ? ` at ${formatUsd(p)}` : ""}.` };
    }
    case "new_cheaper_store": {
      const nb = e.newBestPriceCents;
      const pb = e.previousBestPriceCents;
      if (!validPrice(nb) || !e.newBestRetailerId) return null;
      if (e.newBestRetailerId === e.previousBestRetailerId) return null;
      if (validPrice(pb) && nb >= pb) return null;
      return { key: `cheaper:${e.newBestRetailerId}:${nb}`, message: `A different store now has the lowest price: ${formatUsd(nb)}.` };
    }
    case "all_time_low": {
      const atl = e.previousAllTimeLowCents;
      if (!validPrice(p) || !validPrice(atl) || p >= atl || e.newInStock === false) return null;
      return { key: `atl:${p}`, message: `New all-time low: ${formatUsd(p)} (previous low ${formatUsd(atl)}).` };
    }
    case "coupon": {
      if (!e.coupon?.id) return null;
      return { key: `coupon:${e.coupon.id}`, message: `New coupon available${e.coupon.description ? `: ${e.coupon.description}` : ""}.` };
    }
  }
}

export function evaluateAlert(rule: AlertRule, event: PriceChangeEvent, state: AlertState = {}, now: Date = new Date()): AlertEvaluation {
  const base = { ruleId: rule.id, type: rule.type, message: null };
  if (rule.active === false) return { ...base, fire: false, dedupeKey: null, skipReason: "inactive" };
  if (rule.productId !== event.productId) return { ...base, fire: false, dedupeKey: null, skipReason: "product_mismatch" };
  if (rule.retailerId && rule.type !== "new_cheaper_store" && rule.retailerId !== event.retailerId) {
    return { ...base, fire: false, dedupeKey: null, skipReason: "retailer_mismatch" };
  }
  if (!Number.isFinite(toMs(event.occurredAt))) return { ...base, fire: false, dedupeKey: null, skipReason: "invalid_event" };

  const m = match(rule, event);
  if (!m) return { ...base, fire: false, dedupeKey: null, skipReason: "not_matched" };
  const dedupeKey = `${rule.id}:${m.key}`;

  const fired = new Set(state.firedKeys ?? []);
  if (fired.has(dedupeKey)) return { ...base, fire: false, dedupeKey, skipReason: "duplicate" };

  if (state.lastFiredAt) {
    const last = toMs(state.lastFiredAt);
    const cooldownMs = (rule.cooldownMinutes ?? DEFAULT_COOLDOWN_MIN) * 60_000;
    if (Number.isFinite(last) && now.getTime() - last < cooldownMs) return { ...base, fire: false, dedupeKey, skipReason: "cooldown" };
  }
  return { ...base, fire: true, dedupeKey, skipReason: null, message: m.message };
}

/** Evaluate many rules against one event. `states` is keyed by rule id. */
export function evaluateAlerts(
  rules: readonly AlertRule[],
  event: PriceChangeEvent,
  states: Readonly<Record<string, AlertState>> = {},
  now: Date = new Date(),
): AlertEvaluation[] {
  return rules.map((r) => evaluateAlert(r, event, states[r.id] ?? {}, now));
}
