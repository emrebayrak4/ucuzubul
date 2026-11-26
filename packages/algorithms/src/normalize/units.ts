/**
 * Attribute / unit parsing from free-text product titles and spec strings.
 * Everything here is deterministic and conservative: when in doubt, return undefined.
 */

export type Condition = "new" | "refurbished" | "used" | "open_box";

export interface ParsedAttributes {
  /** Primary storage capacity in GB (1 TB = 1024 GB). */
  storageGb?: number;
  /** RAM / memory in GB. */
  ramGb?: number;
  /** Screen diagonal in inches. */
  screenInches?: number;
  /** Refresh rate in Hz. */
  refreshHz?: number;
  /** Canonical color names found (lowercase, US spelling). First is most likely the product color. */
  colors: string[];
  /** Pack / multi-pack count (e.g. "2-Pack" -> 2). Undefined when not stated. */
  packCount?: number;
  /** Condition explicitly stated in the text. Undefined when not stated. */
  condition?: Condition;
  /** Normalized size label (apparel size, bed size, or a net quantity like "12 oz"). */
  size?: string;
}

const GB_PER_TB = 1024;

/** Units that follow a number but are not a model number (used by matching too). */
export const UNIT_SUFFIXES = [
  "gb", "tb", "mb", "in", "inch", "hz", "khz", "mhz", "ghz", "mah", "wh", "w", "v", "mp", "mm", "cm",
  "oz", "lb", "lbs", "ml", "l", "ft", "qt", "gal", "k", "p", "fps", "pk", "pack", "ct", "count",
] as const;

// ---------- storage / RAM ----------

interface CapacityHit {
  gb: number;
  index: number;
  isRam: boolean;
}

function capacityHits(text: string): CapacityHit[] {
  const hits: CapacityHit[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(tb|gb)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = Number(m[1]);
    const unit = (m[2] as string).toLowerCase();
    const gb = unit === "tb" ? Math.round(value * GB_PER_TB) : value;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 28).toLowerCase();
    const before = text.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    const isRam =
      /^\s*(?:of\s+)?(?:lpddr\d*x?|ddr\d*|unified\s+memory|ram|memory|system\s+memory)\b/.test(after) ||
      /\b(?:ram|memory)\s*[:-]\s*$/.test(before);
    hits.push({ gb, index: m.index, isRam });
  }
  return hits;
}

export function parseStorageGb(text: string): number | undefined {
  const storage = capacityHits(text).filter((h) => !h.isRam);
  if (storage.length === 0) return undefined;
  // Largest non-RAM capacity is the primary storage ("8GB RAM 256GB SSD" -> 256).
  return Math.max(...storage.map((h) => h.gb));
}

export function parseRamGb(text: string): number | undefined {
  const ram = capacityHits(text).filter((h) => h.isRam);
  if (ram.length === 0) return undefined;
  return Math.max(...ram.map((h) => h.gb));
}

// ---------- screen / refresh ----------

export function parseScreenInches(text: string): number | undefined {
  const re = /(\d{1,3}(?:\.\d{1,2})?)\s*(?:"|''|”|″|-?\s*inch(?:es)?\b|-?\s*in\.?(?=[\s,)]|$)|\s*-?\s*class\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (v >= 3 && v <= 120) return v;
  }
  return undefined;
}

export function parseRefreshHz(text: string): number | undefined {
  const m = /(\d{2,3})\s*hz\b/i.exec(text);
  if (!m) return undefined;
  const v = Number(m[1]);
  return v >= 24 && v <= 1000 ? v : undefined;
}

// ---------- colors ----------

/** Synonym -> canonical color. Multi-word entries are matched before single words. */
const COLOR_SYNONYMS: Record<string, string> = {
  "space gray": "space gray",
  "space grey": "space gray",
  "space black": "space black",
  "rose gold": "rose gold",
  "natural titanium": "natural titanium",
  "black titanium": "black titanium",
  "white titanium": "white titanium",
  "blue titanium": "blue titanium",
  "desert titanium": "desert titanium",
  "sky blue": "sky blue",
  "navy blue": "navy",
  "jet black": "black",
  "midnight": "midnight",
  "starlight": "starlight",
  "graphite": "graphite",
  "black": "black",
  "white": "white",
  "silver": "silver",
  "gold": "gold",
  "gray": "gray",
  "grey": "gray",
  "charcoal": "charcoal",
  "red": "red",
  "blue": "blue",
  "navy": "navy",
  "green": "green",
  "yellow": "yellow",
  "orange": "orange",
  "purple": "purple",
  "pink": "pink",
  "brown": "brown",
  "beige": "beige",
  "teal": "teal",
  "titanium": "titanium",
  "bronze": "bronze",
  "copper": "copper",
  "lavender": "lavender",
  "ultramarine": "ultramarine",
  "cream": "cream",
};

const COLOR_KEYS = Object.keys(COLOR_SYNONYMS).sort((a, b) => b.length - a.length);

/** Canonicalize a single color string ("Space Grey" -> "space gray"); unknown colors are lowercased. */
export function normalizeColor(color: string): string {
  const c = color.trim().toLowerCase().replace(/\s+/g, " ");
  return COLOR_SYNONYMS[c] ?? c;
}

export function parseColors(text: string): string[] {
  let remaining = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, " ")} `;
  const found: { color: string; index: number }[] = [];
  for (const key of COLOR_KEYS) {
    const re = new RegExp(`\\s${key.replace(/ /g, "\\s+")}\\s`);
    const m = re.exec(remaining);
    if (m) {
      found.push({ color: COLOR_SYNONYMS[key] as string, index: m.index });
      remaining = remaining.slice(0, m.index) + " ".repeat(m[0].length) + remaining.slice(m.index + m[0].length);
    }
  }
  found.sort((a, b) => a.index - b.index);
  return [...new Set(found.map((f) => f.color))];
}

// ---------- pack count ----------

const WORD_NUMBERS: Record<string, number> = {
  single: 1, twin: 2, double: 2, two: 2, triple: 3, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12,
};

export function parsePackCount(text: string): number | undefined {
  const t = text.toLowerCase();
  const patterns: RegExp[] = [
    /\bpack\s+of\s+(\d{1,3})\b/,
    /\bset\s+of\s+(\d{1,3})\b/,
    /\bcase\s+of\s+(\d{1,3})\b/,
    /\b(\d{1,3})\s*-?\s*(?:pack|pk|pcs|pieces|piece|count|ct)\b/,
    /\(\s*(\d{1,3})\s*-?\s*(?:pack|pk|count|ct)\s*\)/,
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 500) return n;
    }
  }
  const word = /\b(single|twin|double|two|triple|three|four|five|six|eight|ten|twelve)\s*-?\s*pack\b/.exec(t);
  if (word) return WORD_NUMBERS[word[1] as string];
  return undefined;
}

// ---------- condition ----------

export function parseCondition(text: string): Condition | undefined {
  const t = text.toLowerCase();
  if (/\bopen[\s-]?box\b/.test(t)) return "open_box";
  if (/\b(?:refurbished|renewed|reconditioned|refurb|remanufactured)\b/.test(t)) return "refurbished";
  if (/\b(?:used|pre-?owned|second[\s-]hand)\b/.test(t)) return "used";
  if (/\bbrand[\s-]new\b|\bnew\s+in\s+box\b|\(new\)/.test(t)) return "new";
  return undefined;
}

export function normalizeCondition(value: string | null | undefined): Condition | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "new" || v === "brand_new" || v === "new_with_tags") return "new";
  if (v === "open_box" || v === "openbox") return "open_box";
  if (["refurbished", "renewed", "certified_refurbished", "seller_refurbished", "manufacturer_refurbished", "reconditioned"].includes(v)) return "refurbished";
  if (["used", "pre_owned", "preowned", "like_new", "used_like_new", "used_good", "used_very_good", "used_acceptable"].includes(v)) return "used";
  return parseCondition(value);
}

// ---------- size ----------

export function parseSize(text: string): string | undefined {
  const t = text.toLowerCase();
  const bed = /\b(california\s+king|cal\s+king|king|queen|full|twin\s+xl|twin)\s+(?:size|mattress|bed|sheet|comforter|duvet|frame)\b/.exec(t);
  if (bed) return (bed[1] as string).replace(/\s+/g, " ").replace("cal king", "california king");
  const apparel = /\bsize\s*[:-]?\s*(xxxl|xxl|xl|xxs|xs|s|m|l|\d{1,2}(?:\.5)?)\b/.exec(t);
  if (apparel) return (apparel[1] as string).toUpperCase();
  const qty = /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lbs?|ml|l|gal|qt)\b/.exec(t);
  if (qty) {
    const unit = (qty[2] as string).replace(/\.\s*|\s+/g, "").replace(/^lbs$/, "lb");
    return `${Number(qty[1])} ${unit}`;
  }
  return undefined;
}

/** Parse every supported attribute from free text. */
export function parseAttributes(text: string): ParsedAttributes {
  const out: ParsedAttributes = { colors: parseColors(text) };
  const storageGb = parseStorageGb(text);
  if (storageGb !== undefined) out.storageGb = storageGb;
  const ramGb = parseRamGb(text);
  if (ramGb !== undefined) out.ramGb = ramGb;
  const screenInches = parseScreenInches(text);
  if (screenInches !== undefined) out.screenInches = screenInches;
  const refreshHz = parseRefreshHz(text);
  if (refreshHz !== undefined) out.refreshHz = refreshHz;
  const packCount = parsePackCount(text);
  if (packCount !== undefined) out.packCount = packCount;
  const condition = parseCondition(text);
  if (condition !== undefined) out.condition = condition;
  const size = parseSize(text);
  if (size !== undefined) out.size = size;
  return out;
}
