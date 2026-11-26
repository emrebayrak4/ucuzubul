/**
 * Offer totals: price + shipping + ESTIMATED sales tax.
 *
 * Tax uses the STATE BASE rate only (no county/city/special-district add-ons, no product
 * category exemptions such as groceries or clothing), so every result is flagged
 * `estimated: true`. Unknown/invalid ZIP => tax null + `incomplete: true`.
 */

export type UsStateCode =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "DC" | "FL" | "GA" | "HI" | "ID" | "IL" | "IN" | "IA"
  | "KS" | "KY" | "LA" | "ME" | "MD" | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ" | "NM"
  | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC" | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA"
  | "WV" | "WI" | "WY";

/**
 * State-level base sales tax rates in thousandths of a percent (6.25% = 6250).
 * Source: state revenue departments as summarized by the Tax Foundation's annual
 * "State and Local Sales Tax Rates" (2025 edition). Base rates only.
 * Notes: UT includes the 1.25% statewide local add-on (6.10%); VA includes the 1% statewide
 * local rate (5.30%); LA reflects the 5.00% rate effective 2025-01-01. Verify yearly.
 */
export const STATE_BASE_TAX_RATES_MILLI: Readonly<Record<UsStateCode, number>> = {
  AL: 4000, AK: 0, AZ: 5600, AR: 6500, CA: 7250, CO: 2900, CT: 6350, DE: 0, DC: 6000, FL: 6000,
  GA: 4000, HI: 4000, ID: 6000, IL: 6250, IN: 7000, IA: 6000, KS: 6500, KY: 6000, LA: 5000, ME: 5500,
  MD: 6000, MA: 6250, MI: 6000, MN: 6875, MS: 7000, MO: 4225, MT: 0, NE: 5500, NV: 6850, NH: 0,
  NJ: 6625, NM: 4875, NY: 4000, NC: 4750, ND: 5000, OH: 5750, OK: 4500, OR: 0, PA: 6000, RI: 7000,
  SC: 6000, SD: 4200, TN: 7000, TX: 6250, UT: 6100, VT: 6000, VA: 5300, WA: 6500, WV: 6000, WI: 5000,
  WY: 4000,
};

export const TAX_TABLE_AS_OF = "2025-01-01";

/**
 * USPS 3-digit ZIP prefix ranges -> state (50 states + DC). Military (AA/AE/AP) and
 * territories (PR, VI, GU, ...) intentionally map to null. Specific overrides come first.
 */
const ZIP3_RANGES: ReadonlyArray<readonly [number, number, UsStateCode]> = [
  // overrides inside larger ranges
  [5, 5, "NY"], [55, 55, "MA"], [201, 201, "VA"], [569, 569, "DC"], [733, 733, "TX"], [885, 885, "TX"],
  [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"],
  [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"], [200, 205, "DC"],
  [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"],
  [300, 319, "GA"], [398, 399, "GA"], [320, 339, "FL"], [341, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"],
  [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"],
  [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"],
  [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"],
  [870, 884, "NM"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"], [970, 979, "OR"],
  [980, 994, "WA"], [995, 999, "AK"],
];

/** Validate a US ZIP or ZIP+4 and return the 5-digit ZIP, else null. */
export function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const m = /^\s*(\d{5})(?:-?\d{4})?\s*$/.exec(zip);
  return m ? (m[1] as string) : null;
}

/** ZIP -> state via 3-digit prefix ranges. Returns null for unknown, military or territories. */
export function zipToState(zip: string | null | undefined): UsStateCode | null {
  const z = normalizeZip(zip);
  if (!z) return null;
  const prefix = Number(z.slice(0, 3));
  for (const [lo, hi, state] of ZIP3_RANGES) if (prefix >= lo && prefix <= hi) return state;
  return null;
}

export function stateTaxRateMilli(state: UsStateCode): number {
  return STATE_BASE_TAX_RATES_MILLI[state];
}

/** Tax in cents for an amount, rounded half-up to the cent. */
export function estimateTaxCents(amountCents: number, rateMilli: number): number {
  return Math.round((amountCents * rateMilli) / 100_000);
}

export interface OfferTotalInput {
  /** Unit price in cents. */
  priceCents: number;
  quantity?: number;
  /** Shipping in cents for the whole line; null/undefined = unknown. 0 = free. */
  shippingCents?: number | null;
  zip?: string | null;
  /** Whether to tax shipping too (varies by state; default false). */
  taxShipping?: boolean;
}

export interface OfferTotal {
  itemsCents: number;
  shippingCents: number | null;
  taxCents: number | null;
  /** Sum of known components. Check `incomplete` before presenting as final. */
  totalCents: number;
  state: UsStateCode | null;
  /** Rate as a percentage number (6.25), null when unknown. */
  taxRatePct: number | null;
  estimated: true;
  incomplete: boolean;
  notes: string[];
}

export function computeOfferTotal(input: OfferTotalInput): OfferTotal {
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new RangeError("priceCents must be a non-negative integer");
  const qty = input.quantity ?? 1;
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError("quantity must be a positive integer");
  const notes: string[] = [];
  const itemsCents = input.priceCents * qty;
  let incomplete = false;

  let shippingCents: number | null = null;
  if (input.shippingCents === null || input.shippingCents === undefined) {
    incomplete = true;
    notes.push("Shipping cost unknown");
  } else {
    if (!Number.isInteger(input.shippingCents) || input.shippingCents < 0) throw new RangeError("shippingCents must be a non-negative integer");
    shippingCents = input.shippingCents;
  }

  const state = zipToState(input.zip);
  let taxCents: number | null = null;
  let taxRatePct: number | null = null;
  if (!state) {
    incomplete = true;
    notes.push(input.zip ? "ZIP not recognized — tax not estimated" : "Set a ZIP code to estimate tax");
  } else {
    const rate = stateTaxRateMilli(state);
    taxRatePct = rate / 1000;
    const taxable = itemsCents + (input.taxShipping && shippingCents ? shippingCents : 0);
    taxCents = estimateTaxCents(taxable, rate);
    notes.push(`Estimated ${state} state base rate ${taxRatePct}% (local taxes not included)`);
  }

  return {
    itemsCents,
    shippingCents,
    taxCents,
    totalCents: itemsCents + (shippingCents ?? 0) + (taxCents ?? 0),
    state,
    taxRatePct,
    estimated: true,
    incomplete,
    notes,
  };
}
