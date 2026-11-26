/**
 * Smart basket optimizer.
 *
 * Given basket items and per-retailer offers, find:
 *   - cheapest single store (every item from one retailer),
 *   - cheapest overall split (any number of stores),
 *   - best with at most N stores (default 2).
 * Shipping is per store order: free when the store subtotal reaches the retailer's
 * free-shipping threshold, when the user holds a membership with free shipping, or when
 * pickup is allowed and every item in that store order is pickup-eligible.
 *
 * Exact branch & bound is used for small instances (<= exactItemLimit items, or
 * few stores); larger ones use greedy + local search. Tax is NOT included.
 */
import { formatUsd } from "./money";

export interface BasketItem {
  itemId: string;
  quantity: number;
}

export interface BasketOffer {
  itemId: string;
  retailerId: string;
  /** Unit price in cents. */
  priceCents: number;
  inStock?: boolean;
  pickupAvailable?: boolean;
}

export interface RetailerPolicy {
  retailerId: string;
  /** Flat shipping per order in cents when below threshold; undefined = unknown. */
  shippingCents?: number | null;
  freeShippingThresholdCents?: number | null;
  /** Membership ids granting free shipping at this retailer (e.g. "amazon_prime", "walmart_plus"). */
  freeShippingMemberships?: readonly string[];
  pickupAvailable?: boolean;
}

export interface BasketOptions {
  memberships?: readonly string[];
  allowPickup?: boolean;
  /** Store cap for the "best within N stores" scenario. Default 2. */
  maxStores?: number;
  /** Exact search when items <= this. Default 8. */
  exactItemLimit?: number;
  /** Exact search also when distinct stores <= this (regardless of item count, up to 16 items). Default 3. */
  exactStoreLimit?: number;
  /** Safety cap on branch & bound nodes before falling back to the best found + heuristic. Default 500k. */
  maxNodes?: number;
}

export type Fulfillment = "ship" | "pickup";

export interface StoreOrder {
  retailerId: string;
  lines: { itemId: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  subtotalCents: number;
  shippingCents: number;
  fulfillment: Fulfillment;
  freeShippingReason: "threshold" | "membership" | "pickup" | null;
  totalCents: number;
}

export interface BasketScenario {
  kind: "single_store" | "split_cheapest" | "max_stores";
  maxStores: number | null;
  stores: StoreOrder[];
  itemsCents: number;
  shippingCents: number;
  totalCents: number;
  storeCount: number;
  /** Positive = cheaper than the naive plan. */
  savingsVsNaiveCents: number;
  method: "exact" | "heuristic";
}

export interface BasketResult {
  cheapestSingleStore: BasketScenario | null;
  cheapestOverall: BasketScenario | null;
  bestWithinMaxStores: BasketScenario | null;
  naiveTotalCents: number | null;
  unfulfilledItemIds: string[];
  assumptions: string[];
}

// ---------------------------------------------------------------------------

interface Ctx {
  items: BasketItem[];
  /** offers[i] = candidate offers for item i (in stock, valid), sorted by price. */
  offers: BasketOffer[][];
  policies: Map<string, RetailerPolicy>;
  memberships: Set<string>;
  allowPickup: boolean;
  unknownShipping: Set<string>;
}

function storeShipping(ctx: Ctx, retailerId: string, subtotal: number, lines: { pickup: boolean }[], track = false): { cents: number; fulfillment: Fulfillment; reason: StoreOrder["freeShippingReason"] } {
  const p = ctx.policies.get(retailerId);
  if (p?.freeShippingMemberships?.some((m) => ctx.memberships.has(m))) return { cents: 0, fulfillment: "ship", reason: "membership" };
  if (p?.freeShippingThresholdCents != null && subtotal >= p.freeShippingThresholdCents) return { cents: 0, fulfillment: "ship", reason: "threshold" };
  const base = p?.shippingCents ?? null;
  if (base === null && track) ctx.unknownShipping.add(retailerId);
  const shipCost = base ?? 0;
  if (ctx.allowPickup && p?.pickupAvailable && lines.length > 0 && lines.every((l) => l.pickup) && shipCost > 0) {
    return { cents: 0, fulfillment: "pickup", reason: "pickup" };
  }
  return { cents: shipCost, fulfillment: "ship", reason: null };
}

/** assignment[i] = index into ctx.offers[i] */
function evaluate(ctx: Ctx, assignment: readonly number[]): number {
  const subtotals = new Map<string, number>();
  const pickups = new Map<string, { pickup: boolean }[]>();
  let items = 0;
  for (let i = 0; i < assignment.length; i++) {
    const o = ctx.offers[i]?.[assignment[i] as number];
    if (!o) continue;
    const line = o.priceCents * (ctx.items[i] as BasketItem).quantity;
    items += line;
    subtotals.set(o.retailerId, (subtotals.get(o.retailerId) ?? 0) + line);
    const pl = pickups.get(o.retailerId) ?? [];
    pl.push({ pickup: !!o.pickupAvailable });
    pickups.set(o.retailerId, pl);
  }
  let ship = 0;
  for (const [r, sub] of subtotals) ship += storeShipping(ctx, r, sub, pickups.get(r) ?? []).cents;
  return items + ship;
}

function buildScenario(ctx: Ctx, assignment: readonly number[], kind: BasketScenario["kind"], maxStores: number | null, method: BasketScenario["method"], naive: number | null): BasketScenario {
  const byStore = new Map<string, StoreOrder & { pick: { pickup: boolean }[] }>();
  for (let i = 0; i < assignment.length; i++) {
    const o = ctx.offers[i]?.[assignment[i] as number];
    if (!o) continue;
    const item = ctx.items[i] as BasketItem;
    const s = byStore.get(o.retailerId) ?? {
      retailerId: o.retailerId, lines: [], subtotalCents: 0, shippingCents: 0, fulfillment: "ship" as Fulfillment,
      freeShippingReason: null, totalCents: 0, pick: [],
    };
    const lineTotal = o.priceCents * item.quantity;
    s.lines.push({ itemId: item.itemId, quantity: item.quantity, unitPriceCents: o.priceCents, lineTotalCents: lineTotal });
    s.subtotalCents += lineTotal;
    s.pick.push({ pickup: !!o.pickupAvailable });
    byStore.set(o.retailerId, s);
  }
  const stores: StoreOrder[] = [];
  for (const s of byStore.values()) {
    const sh = storeShipping(ctx, s.retailerId, s.subtotalCents, s.pick, true);
    stores.push({
      retailerId: s.retailerId, lines: s.lines, subtotalCents: s.subtotalCents, shippingCents: sh.cents,
      fulfillment: sh.fulfillment, freeShippingReason: sh.reason, totalCents: s.subtotalCents + sh.cents,
    });
  }
  stores.sort((a, b) => b.totalCents - a.totalCents || a.retailerId.localeCompare(b.retailerId));
  const itemsCents = stores.reduce((x, s) => x + s.subtotalCents, 0);
  const shippingCents = stores.reduce((x, s) => x + s.shippingCents, 0);
  const totalCents = itemsCents + shippingCents;
  return {
    kind, maxStores, stores, itemsCents, shippingCents, totalCents, storeCount: stores.length,
    savingsVsNaiveCents: naive === null ? 0 : naive - totalCents, method,
  };
}

function storesOf(ctx: Ctx, assignment: readonly number[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < assignment.length; i++) {
    const o = ctx.offers[i]?.[assignment[i] as number];
    if (o) s.add(o.retailerId);
  }
  return s;
}

/** Exact branch & bound restricted to `allowed` stores (null = any) and at most `maxStores`. */
function exactSearch(ctx: Ctx, allowed: Set<string> | null, maxStores: number, maxNodes: number): { assignment: number[] | null; cost: number; complete: boolean } {
  const n = ctx.items.length;
  const choices: number[][] = ctx.offers.map((offs) => offs.map((_, j) => j).filter((j) => !allowed || allowed.has((offs[j] as BasketOffer).retailerId)));
  if (choices.some((c) => c.length === 0)) return { assignment: null, cost: Infinity, complete: true };
  // order items by price spread (most decisive first)
  const order = [...Array(n).keys()].sort((a, b) => spread(ctx, choices, b) - spread(ctx, choices, a));
  const minLine = order.map((i) => Math.min(...(choices[i] as number[]).map((j) => lineCost(ctx, i, j))));
  const suffixMin = new Array<number>(n + 1).fill(0);
  for (let k = n - 1; k >= 0; k--) suffixMin[k] = (suffixMin[k + 1] as number) + (minLine[k] as number);

  let best = Infinity;
  let bestAssign: number[] | null = null;
  let nodes = 0;
  let complete = true;
  const assign = new Array<number>(n).fill(-1);
  const counts = new Map<string, number>();

  const rec = (k: number, itemsCost: number) => {
    if (++nodes > maxNodes) {
      complete = false;
      return;
    }
    if (itemsCost + (suffixMin[k] as number) >= best) return;
    if (k === n) {
      const cost = evaluate(ctx, assign);
      if (cost < best) {
        best = cost;
        bestAssign = [...assign];
      }
      return;
    }
    const i = order[k] as number;
    const cand = [...(choices[i] as number[])].sort((x, y) => lineCost(ctx, i, x) - lineCost(ctx, i, y));
    for (const j of cand) {
      const o = (ctx.offers[i] as BasketOffer[])[j] as BasketOffer;
      const opened = (counts.get(o.retailerId) ?? 0) === 0;
      if (opened && counts.size >= maxStores) continue;
      const line = lineCost(ctx, i, j);
      assign[i] = j;
      counts.set(o.retailerId, (counts.get(o.retailerId) ?? 0) + 1);
      rec(k + 1, itemsCost + line);
      counts.set(o.retailerId, (counts.get(o.retailerId) as number) - 1);
      if ((counts.get(o.retailerId) as number) === 0) {
        counts.delete(o.retailerId);
      }
      assign[i] = -1;
      if (!complete) return;
    }
  };
  rec(0, 0);
  return { assignment: bestAssign, cost: best, complete };
}

function lineCost(ctx: Ctx, i: number, j: number): number {
  return ((ctx.offers[i] as BasketOffer[])[j] as BasketOffer).priceCents * (ctx.items[i] as BasketItem).quantity;
}

function spread(ctx: Ctx, choices: number[][], i: number): number {
  const costs = (choices[i] as number[]).map((j) => lineCost(ctx, i, j));
  return costs.length ? Math.max(...costs) - Math.min(...costs) : 0;
}

/** Greedy (cheapest line per item within allowed stores) + local search moves. */
function heuristicSearch(ctx: Ctx, allowed: Set<string> | null, maxStores: number, start?: number[]): { assignment: number[] | null; cost: number } {
  const n = ctx.items.length;
  const choices: number[][] = ctx.offers.map((offs) => offs.map((_, j) => j).filter((j) => !allowed || allowed.has((offs[j] as BasketOffer).retailerId)));
  if (choices.some((c) => c.length === 0)) return { assignment: null, cost: Infinity };
  const assign = start ? [...start] : choices.map((c, i) => c.reduce((b, j) => (lineCost(ctx, i, j) < lineCost(ctx, i, b) ? j : b), c[0] as number));
  const feasible = (a: number[]) => storesOf(ctx, a).size <= maxStores;
  let cost = feasible(assign) ? evaluate(ctx, assign) : Infinity;
  let improved = true;
  let iterations = 0;
  while (improved && iterations++ < 200) {
    improved = false;
    // single-item moves
    for (let i = 0; i < n; i++) {
      for (const j of choices[i] as number[]) {
        if (j === assign[i]) continue;
        const prev = assign[i] as number;
        assign[i] = j;
        const c = feasible(assign) ? evaluate(ctx, assign) : Infinity;
        if (c < cost) {
          cost = c;
          improved = true;
        } else assign[i] = prev;
      }
    }
    // store-closing moves: move every item of store S to its best alternative among other open stores
    for (const s of storesOf(ctx, assign)) {
      const trial = [...assign];
      const open = storesOf(ctx, assign);
      open.delete(s);
      let ok = true;
      for (let i = 0; i < n; i++) {
        const o = (ctx.offers[i] as BasketOffer[])[trial[i] as number] as BasketOffer;
        if (o.retailerId !== s) continue;
        const alt = (choices[i] as number[]).filter((j) => open.has(((ctx.offers[i] as BasketOffer[])[j] as BasketOffer).retailerId));
        if (alt.length === 0) {
          ok = false;
          break;
        }
        trial[i] = alt.reduce((b, j) => (lineCost(ctx, i, j) < lineCost(ctx, i, b) ? j : b), alt[0] as number);
      }
      if (!ok) continue;
      const c = feasible(trial) ? evaluate(ctx, trial) : Infinity;
      if (c < cost) {
        for (let i = 0; i < n; i++) assign[i] = trial[i] as number;
        cost = c;
        improved = true;
      }
    }
  }
  return { assignment: cost === Infinity ? null : assign, cost };
}

function combinations<T>(arr: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i] as T);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function optimizeBasket(
  items: readonly BasketItem[],
  offers: readonly BasketOffer[],
  policies: readonly RetailerPolicy[] = [],
  options: BasketOptions = {},
): BasketResult {
  const assumptions: string[] = [
    "Prices exclude sales tax.",
    "Shipping is charged once per store order; free when the store subtotal meets the retailer's free-shipping threshold or a selected membership applies.",
    "Naive plan = each item bought at its lowest listed price, ignoring shipping when choosing, then paying each store's shipping.",
  ];
  const maxStores = Math.max(1, options.maxStores ?? 2);
  const exactItemLimit = options.exactItemLimit ?? 8;
  const exactStoreLimit = options.exactStoreLimit ?? 3;
  const maxNodes = options.maxNodes ?? 500_000;
  const allowPickup = options.allowPickup ?? false;
  if (allowPickup) assumptions.push("In-store pickup is used (free) when every item in a store order is pickup-eligible.");
  if (options.memberships?.length) assumptions.push(`Memberships applied: ${options.memberships.join(", ")}.`);

  // merge duplicate items
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) throw new RangeError(`quantity for ${it.itemId} must be a positive integer`);
    merged.set(it.itemId, (merged.get(it.itemId) ?? 0) + it.quantity);
  }
  const all = [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));

  const offersByItem = new Map<string, BasketOffer[]>();
  for (const o of offers) {
    if (o.inStock === false || !Number.isInteger(o.priceCents) || o.priceCents < 0) continue;
    const list = offersByItem.get(o.itemId) ?? [];
    // keep cheapest offer per (item, retailer)
    const existing = list.findIndex((x) => x.retailerId === o.retailerId);
    if (existing >= 0) {
      if ((list[existing] as BasketOffer).priceCents > o.priceCents) list[existing] = o;
    } else list.push(o);
    offersByItem.set(o.itemId, list);
  }
  const unfulfilledItemIds = all.filter((it) => !offersByItem.get(it.itemId)?.length).map((it) => it.itemId);
  if (unfulfilledItemIds.length) assumptions.push(`No in-stock offers for: ${unfulfilledItemIds.join(", ")} (excluded from all scenarios).`);
  const basket = all.filter((it) => offersByItem.get(it.itemId)?.length);

  const ctx: Ctx = {
    items: basket,
    offers: basket.map((it) => [...(offersByItem.get(it.itemId) as BasketOffer[])].sort((a, b) => a.priceCents - b.priceCents)),
    policies: new Map(policies.map((p) => [p.retailerId, p])),
    memberships: new Set(options.memberships ?? []),
    allowPickup,
    unknownShipping: new Set(),
  };

  if (basket.length === 0) {
    return { cheapestSingleStore: null, cheapestOverall: null, bestWithinMaxStores: null, naiveTotalCents: null, unfulfilledItemIds, assumptions };
  }

  const allStores = [...new Set(ctx.offers.flat().map((o) => o.retailerId))].sort();
  const useExact = basket.length <= exactItemLimit || (allStores.length <= exactStoreLimit && basket.length <= 16);

  // naive
  const naiveAssign = ctx.offers.map(() => 0);
  const naive = evaluate(ctx, naiveAssign);

  // 1. single store
  let single: { assignment: number[]; cost: number } | null = null;
  for (const s of allStores) {
    const a = ctx.offers.map((offs) => offs.findIndex((o) => o.retailerId === s));
    if (a.some((j) => j < 0)) continue;
    const c = evaluate(ctx, a);
    if (!single || c < single.cost) single = { assignment: a, cost: c };
  }
  if (!single) assumptions.push("No single store carries every item.");

  // 2. overall split
  let overall: { assignment: number[] | null; cost: number };
  let overallMethod: BasketScenario["method"] = "exact";
  if (useExact) {
    const r = exactSearch(ctx, null, allStores.length, maxNodes);
    overall = r;
    if (!r.complete) {
      overallMethod = "heuristic";
      const h = heuristicSearch(ctx, null, allStores.length, r.assignment ?? undefined);
      if (h.cost < r.cost) overall = h;
      assumptions.push("Exact search hit its node limit; result refined heuristically and may not be optimal.");
    }
  } else {
    overallMethod = "heuristic";
    overall = heuristicSearch(ctx, null, allStores.length);
    if (single && single.cost < overall.cost) overall = { assignment: single.assignment, cost: single.cost };
    assumptions.push(`Large basket (${basket.length} items, ${allStores.length} stores): split plan found with greedy + local search; it may not be optimal.`);
  }

  // 3. best within maxStores
  let capped: { assignment: number[] | null; cost: number } = { assignment: null, cost: Infinity };
  let cappedMethod: BasketScenario["method"] = useExact ? "exact" : "heuristic";
  if (useExact) {
    const r = exactSearch(ctx, null, maxStores, maxNodes);
    capped = r;
    if (!r.complete) cappedMethod = "heuristic";
  } else {
    // rank stores by coverage then cheapness, try all subsets of size <= maxStores among the top 12
    const top = [...allStores]
      .map((s) => ({ s, cov: ctx.offers.filter((offs) => offs.some((o) => o.retailerId === s)).length }))
      .sort((a, b) => b.cov - a.cov)
      .slice(0, 12)
      .map((x) => x.s);
    for (let k = 1; k <= Math.min(maxStores, top.length); k++) {
      for (const combo of combinations(top, k)) {
        const h = heuristicSearch(ctx, new Set(combo), maxStores);
        if (h.cost < capped.cost) capped = h;
      }
    }
  }
  if (overall.assignment && storesOf(ctx, overall.assignment).size <= maxStores && overall.cost <= capped.cost) {
    capped = overall;
  }
  if (!capped.assignment) assumptions.push(`Not every item can be bought from ${maxStores} or fewer stores.`);

  const result: BasketResult = {
    cheapestSingleStore: single ? buildScenario(ctx, single.assignment, "single_store", 1, "exact", naive) : null,
    cheapestOverall: overall.assignment ? buildScenario(ctx, overall.assignment, "split_cheapest", null, overallMethod, naive) : null,
    bestWithinMaxStores: capped.assignment ? buildScenario(ctx, capped.assignment, "max_stores", maxStores, cappedMethod, naive) : null,
    naiveTotalCents: naive,
    unfulfilledItemIds,
    assumptions,
  };
  if (ctx.unknownShipping.size) {
    assumptions.push(`Shipping cost unknown for ${[...ctx.unknownShipping].sort().join(", ")} — treated as $0.00; totals may be understated.`);
  }
  if (result.cheapestOverall && result.cheapestOverall.savingsVsNaiveCents > 0) {
    assumptions.push(`Best split saves ${formatUsd(result.cheapestOverall.savingsVsNaiveCents)} versus the naive plan.`);
  }
  return result;
}
