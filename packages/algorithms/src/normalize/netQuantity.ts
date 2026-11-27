/**
 * Net quantity + unit pricing for grocery / everyday items (CPG).
 *
 * Parses sizes and pack counts from titles or attribute strings ("Family Size 18.8 oz", "2 x 12 oz", "Pack of 4",
 * "12 fl oz, 12 Pack", "6 Double Rolls, 147 sheets per roll", "92 fl oz, 64 loads") into one comparable basis:
 *   weight → oz · volume → fl oz · count → ct · sheets → sheet · laundry loads → load.
 * Unit price = price ÷ total quantity, kept as integer millicents (1/1000 ¢) per basis unit so sorting stays exact.
 * Conservative: when nothing is stated, return undefined (never guess a size).
 */

export type UnitBasis = "oz" | "fl_oz" | "ct" | "sheet" | "load";

export const UNIT_BASES: readonly UnitBasis[] = ["oz", "fl_oz", "ct", "sheet", "load"] as const;

export interface Measures {
  /** Total net weight in ounces (all items). */
  weightOz?: number;
  /** Total volume in fluid ounces (all items). */
  volumeFlOz?: number;
  /** Item count ("120 Count", "72 K-Cup Pods", or the pack count when nothing else is stated). */
  count?: number;
  /** Total sheets (sheets per roll × rolls when both are stated). */
  sheets?: number;
  /** Laundry / dishwasher loads. */
  loads?: number;
  /** Multipack count (1 when not stated). */
  packCount: number;
  /** Per-item weight/volume label as written, e.g. "12 fl oz", "500 g". */
  itemLabel?: string;
}

export interface NetQuantity {
  basis: UnitBasis;
  /** Total quantity in the basis unit. */
  total: number;
  /** Multipack count (1 when not stated). */
  packCount: number;
  /** Human size label: "18.8 oz", "2 × 12 oz", "120 ct", "882 sheets", "64 loads". */
  label: string;
}

export interface UnitPrice {
  basis: UnitBasis;
  /** Display quantity the label refers to (100 for sheets, otherwise 1). */
  per: number;
  /** Exact-ish sortable value: millicents (1/1000 ¢) per ONE basis unit. */
  millicentsPerUnit: number;
  /** "23.4¢/oz", "$1.25/fl oz", "$0.31/ct", "$1.02/100 sheets", "19.5¢/load". */
  label: string;
}

const OZ_PER_LB = 16;
const G_PER_OZ = 28.349523125;
const ML_PER_FLOZ = 29.5735295625;

const round2 = (n: number) => Math.round(n * 100) / 100;

function clean(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/×/g, " x ")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/fluid\s+ounces?/g, "fl oz")
    .replace(/fl\.\s*oz\.?/g, "fl oz")
    .replace(/\bounces?\b/g, "oz")
    .replace(/\bpounds?\b/g, "lb")
    .replace(/\bgrams?\b/g, "g")
    .replace(/\bkilograms?\b/g, "kg")
    .replace(/\bmilliliters?\b|\bmillilitres?\b/g, "ml")
    .replace(/\bliters?\b|\blitres?\b/g, "l")
    .replace(/\bgallons?\b/g, "gal")
    .replace(/\bquarts?\b/g, "qt")
    .replace(/\bpints?\b/g, "pt")
    .replace(/\s+/g, " ")} `;
}

interface QtyHit {
  value: number;
  unit: string;
  kind: "weight" | "volume";
  index: number;
  raw: string;
}

const QTY_RE = /(\d+(?:\.\d+)?)\s*-?\s*(fl oz|oz|lbs?|kg|g|ml|l|gal|qt|pt)\b/g;

function qtyHits(t: string): QtyHit[] {
  const out: QtyHit[] = [];
  QTY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QTY_RE.exec(t)) !== null) {
    const value = Number(m[1]);
    if (!(value > 0)) continue;
    const unit = (m[2] as string).replace(/^lbs$/, "lb");
    const kind = unit === "fl oz" || unit === "ml" || unit === "l" || unit === "gal" || unit === "qt" || unit === "pt" ? "volume" : "weight";
    out.push({ value, unit, kind, index: m.index, raw: `${value} ${unit}` });
  }
  return out;
}

function toOz(value: number, unit: string): number {
  if (unit === "lb") return value * OZ_PER_LB;
  if (unit === "g") return value / G_PER_OZ;
  if (unit === "kg") return (value * 1000) / G_PER_OZ;
  return value;
}

function toFlOz(value: number, unit: string): number {
  if (unit === "ml") return value / ML_PER_FLOZ;
  if (unit === "l") return (value * 1000) / ML_PER_FLOZ;
  if (unit === "gal") return value * 128;
  if (unit === "qt") return value * 32;
  if (unit === "pt") return value * 16;
  return value;
}

const CONTAINERS = "cans?|bottles?|boxes|box|bags?|pouches|pouch|jars?|cartons?|packs?|pk|tubs?|cups?|pods?|k-cups?|sticks?|bars?|rolls?|count|ct";

/** Multipack count stated next to a per-item weight/volume. */
function multipack(t: string): number | undefined {
  const res: RegExp[] = [
    /\bpack\s+of\s+(\d{1,3})\b/,
    /\bcase\s+of\s+(\d{1,3})\b/,
    /\bset\s+of\s+(\d{1,3})\b/,
    /\b(\d{1,3})\s*[x]\s*\d+(?:\.\d+)?\s*(?:fl oz|oz|lb|g|kg|ml|l)\b/,
    /\b(\d{1,3})\s*-?\s*(?:pack|pk)\b/,
    new RegExp(`\\b(\\d{1,3})\\s*-?\\s*(?:${CONTAINERS})\\b`),
    /\b(single|twin|double|triple|two|three|four|six|eight|twelve)\s*-?\s*pack\b/,
  ];
  const words: Record<string, number> = { single: 1, twin: 2, double: 2, two: 2, triple: 3, three: 3, four: 4, six: 6, eight: 8, twelve: 12 };
  for (const re of res) {
    const m = re.exec(t);
    if (!m) continue;
    const g = m[1] as string;
    const n = /^\d+$/.test(g) ? Number(g) : words[g];
    if (n !== undefined && n >= 1 && n <= 500) return n;
  }
  return undefined;
}

/** All measures stated in the text (weights/volumes multiplied by the multipack count). */
export function parseMeasures(text: string): Measures {
  const t = clean(text);
  const hits = qtyHits(t);
  const out: Measures = { packCount: 1 };

  // Sheets: "147 sheets per roll" × "6 rolls" (or a plain total "880 sheets").
  const perRoll = /\b(\d{2,4})\s*(?:\d-ply\s+)?sheets?\s*(?:per|\/|a)\s*(?:roll|box)\b/.exec(t);
  const rolls = /\b(\d{1,3})\s*(?:double|triple|mega|super\s+mega|family|huge|giant|regular|big|jumbo|select-a-size)?\s*(?:plus\s+)?(?:rolls?|boxes)\b/.exec(t);
  const sheets = /\b(\d{2,5})\s*(?:total\s+)?sheets?\b/.exec(t);
  if (perRoll && rolls) out.sheets = Number(perRoll[1]) * Number(rolls[1]);
  else if (sheets) out.sheets = Number(sheets[1]);

  const loads = /\b(\d{1,4})\s*loads?\b/.exec(t);
  if (loads) out.loads = Number(loads[1]);

  // "12 packs of 56" (wipes) → 672 ct.
  const packsOf = /\b(\d{1,3})\s*packs?\s+of\s+(\d{1,4})\b/.exec(t);
  // An explicit "N Count" / "N ct" wins over nouns ("Pampers Cruisers 360 Diapers …, 116 Count" → 116).
  const count =
    /\b(\d{1,5})\s*-?\s*(?:count|ct)\b/.exec(t) ??
    /\b(\d{1,5})\s*-?\s*(?:pcs|pieces|pods|k-cup pods|k-cups|capsules|tablets|caplets|softgels|gummies|wipes|diapers|bags|sticks|bars|pairs)\b/.exec(t);

  const first = hits[0];
  const pack = multipack(t);
  if (first) {
    const pk = pack ?? 1;
    out.packCount = pk;
    out.itemLabel = first.raw;
    if (first.kind === "weight") out.weightOz = round2(toOz(first.value, first.unit) * pk);
    else out.volumeFlOz = round2(toFlOz(first.value, first.unit) * pk);
    if (count) out.count = Number(count[1]);
    else if (pack !== undefined && pack > 1) out.count = pack;
  } else {
    if (packsOf) {
      out.count = Number(packsOf[1]) * Number(packsOf[2]);
      out.packCount = Number(packsOf[1]);
    } else if (count) out.count = Number(count[1]);
    else if (pack !== undefined) out.count = pack;
    const strict = /\bpack\s+of\s+(\d{1,3})\b|\b(\d{1,3})\s*-?\s*(?:pack|pk)\b/.exec(t);
    if (strict && !packsOf) out.packCount = Number(strict[1] ?? strict[2]);
  }
  if (out.count !== undefined && !(out.count > 0)) delete out.count;
  return out;
}

const UNIT_LABEL: Record<UnitBasis, string> = { oz: "oz", fl_oz: "fl oz", ct: "ct", sheet: "sheets", load: "loads" };

/** Default preference when the caller doesn't say: loads > sheets > weight > volume > count. */
const DEFAULT_ORDER: UnitBasis[] = ["load", "sheet", "oz", "fl_oz", "ct"];

function measureFor(m: Measures, basis: UnitBasis): number | undefined {
  if (basis === "oz") return m.weightOz;
  if (basis === "fl_oz") return m.volumeFlOz;
  if (basis === "ct") return m.count;
  if (basis === "sheet") return m.sheets;
  return m.loads;
}

/**
 * Net quantity in one comparable basis. `prefer` (e.g. "ct" for diapers / coffee pods) wins when that measure is
 * stated; otherwise the default order applies. Undefined when no size is stated.
 */
export function parseNetQuantity(text: string, prefer?: UnitBasis): NetQuantity | undefined {
  const m = parseMeasures(text);
  const order = prefer ? [prefer, ...DEFAULT_ORDER.filter((b) => b !== prefer)] : DEFAULT_ORDER;
  for (const basis of order) {
    const total = measureFor(m, basis);
    if (total === undefined || !(total > 0)) continue;
    let label: string;
    if ((basis === "oz" || basis === "fl_oz") && m.itemLabel) label = m.packCount > 1 ? `${m.packCount} × ${m.itemLabel}` : m.itemLabel;
    else label = `${round2(total)} ${UNIT_LABEL[basis]}`;
    return { basis, total: round2(total), packCount: m.packCount, label };
  }
  return undefined;
}

const PER_DISPLAY: Record<UnitBasis, { per: number; label: string }> = {
  oz: { per: 1, label: "oz" },
  fl_oz: { per: 1, label: "fl oz" },
  ct: { per: 1, label: "ct" },
  sheet: { per: 100, label: "100 sheets" },
  load: { per: 1, label: "load" },
};

/** "23.4¢" under a dollar, "$1.25" from a dollar up. */
export function formatUnitCents(cents: number): string {
  if (cents < 100) return `${cents < 10 ? cents.toFixed(2) : cents.toFixed(1)}¢`;
  return `$${(cents / 100).toFixed(2)}`;
}

/** Unit price for an offer price (cents) and a product's net quantity. Null when the quantity is unknown/zero. */
export function computeUnitPrice(priceCents: number, qty: { basis: UnitBasis; total: number } | null | undefined): UnitPrice | null {
  if (!qty || !(qty.total > 0) || !Number.isFinite(priceCents) || priceCents < 0) return null;
  const millicentsPerUnit = Math.round((priceCents * 1000) / qty.total);
  const d = PER_DISPLAY[qty.basis];
  const displayCents = (priceCents * d.per) / qty.total;
  return { basis: qty.basis, per: d.per, millicentsPerUnit, label: `${formatUnitCents(displayCents)}/${d.label}` };
}

/** Index of the lowest unit price among comparable entries (same basis only); -1 when fewer than two compare. */
export function bestValueIndex(prices: readonly (UnitPrice | null)[]): number {
  const bases = new Set(prices.filter((p): p is UnitPrice => p !== null).map((p) => p.basis));
  if (bases.size !== 1) return -1;
  let best = -1;
  let n = 0;
  prices.forEach((p, i) => {
    if (!p) return;
    n++;
    if (best < 0 || p.millicentsPerUnit < (prices[best] as UnitPrice).millicentsPerUnit) best = i;
  });
  return n >= 2 ? best : -1;
}

export function isUnitBasis(v: unknown): v is UnitBasis {
  return typeof v === "string" && (UNIT_BASES as readonly string[]).includes(v);
}
