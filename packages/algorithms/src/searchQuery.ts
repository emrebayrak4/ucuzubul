/**
 * Natural-language search query parser.
 *
 *   "best laptop under $800"          -> terms [laptop], maxPriceCents 80000, category laptops
 *   "65 inch OLED TV under $1,500"    -> terms [oled, tv], screenInches 65, max 150000
 *   "cheapest iPhone with 256GB"      -> terms [iphone], storageGb 256, sort lowest_total
 *   "gaming monitor 144Hz under $200" -> terms [gaming, monitor], refreshHzMin 144
 * Also detects a bare UPC/EAN/GTIN and pasted product URLs of major retailers.
 */
import { cleanGtin, gtinType, toGtin14, type GtinType } from "./normalize/gtin";
import { extractBrand } from "./normalize/title";
import { normalizeCondition, parseColors, type Condition } from "./normalize/units";

export type SortHint = "best_match" | "lowest_total" | "highest_price" | "best_deal" | "rating" | "newest" | "biggest_drop";

export interface SearchFilters {
  brand?: string;
  storageGb?: number;
  ramGb?: number;
  screenInches?: number;
  refreshHzMin?: number;
  color?: string;
  condition?: Condition;
  packCount?: number;
}

export type UrlRetailer = "amazon" | "walmart" | "bestbuy" | "target" | "ebay" | "homedepot" | "lowes" | "newegg" | "costco";

export interface ParsedProductUrl {
  retailer: UrlRetailer;
  /** Retailer-specific product identifier, null when the URL needs resolution (e.g. amzn.to short links). */
  id: string | null;
  idType: "asin" | "item_id" | "sku" | "tcin" | "model" | null;
  url: string;
}

export interface ParsedSearchQuery {
  raw: string;
  kind: "text" | "gtin" | "url" | "empty";
  /** Remaining free-text search terms (lowercase). */
  terms: string[];
  /** Terms joined back for full-text engines. */
  text: string;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  categoryHint: string | null;
  filters: SearchFilters;
  sortHint: SortHint | null;
  gtin: { value: string; gtin14: string; type: GtinType } | null;
  url: ParsedProductUrl | null;
}

const CATEGORY_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:laptops?|notebooks?|macbooks?|chromebooks?|ultrabooks?)\b/, "laptops"],
  [/\b(?:tvs?|televisions?|oled\s+tv|qled)\b/, "tvs"],
  [/\b(?:monitors?|displays?)\b/, "monitors"],
  [/\b(?:iphones?|smartphones?|phones?|galaxy\s+s\d+|pixel\s+\d+)\b/, "smartphones"],
  [/\b(?:ipads?|tablets?)\b/, "tablets"],
  [/\b(?:headphones?|earbuds?|airpods|headsets?)\b/, "headphones"],
  [/\b(?:smart\s*watch(?:es)?|apple\s+watch|smartwatch(?:es)?)\b/, "smartwatches"],
  [/\b(?:ps5|playstation|xbox|nintendo\s+switch|switch\s+2|consoles?)\b/, "gaming-consoles"],
  [/\b(?:cameras?|dslr|mirrorless)\b/, "cameras"],
  [/\b(?:speakers?|soundbars?)\b/, "audio"],
  [/\b(?:ssds?|hard\s+drives?|hdds?)\b/, "storage"],
  [/\b(?:gpus?|graphics\s+cards?|rtx\s*\d+)\b/, "graphics-cards"],
  [/\b(?:vacuums?|roomba)\b/, "vacuums"],
  [/\b(?:air\s+fryers?|blenders?|coffee\s+makers?|espresso\s+machines?|microwaves?)\b/, "kitchen-appliances"],
  [/\b(?:refrigerators?|fridges?|washers?|dryers?|dishwashers?)\b/, "appliances"],
  [/\b(?:diapers?|strollers?|car\s+seats?)\b/, "baby"],
  [/\b(?:dog\s+food|cat\s+food|litter)\b/, "pet-supplies"],
  [/\b(?:drills?|power\s+tools?|saws?)\b/, "tools"],
];

const FILLER = new Set([
  "best", "cheapest", "cheap", "cheapest", "lowest", "price", "prices", "deal", "deals", "top", "rated", "good", "great",
  "with", "under", "below", "over", "above", "less", "more", "than", "between", "and", "to", "for", "a", "an", "the",
  "in", "on", "of", "at", "max", "maximum", "min", "minimum", "up", "around", "about", "buy", "new", "latest", "newest",
  "sale", "discount", "discounted", "biggest", "drop", "drops", "highest", "most", "expensive", "inch", "inches", "within",
]);

/** Parse "$1,299.99", "1299", "1.5k", "$2k" -> cents. */
export function parseMoneyToCents(raw: string): number | null {
  const m = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?$/i.exec(raw.trim());
  if (!m) return null;
  const whole = Number((m[1] as string).replace(/,/g, ""));
  const frac = m[2] ? Number((m[2] as string).padEnd(2, "0")) : 0;
  if (m[3]) {
    // "1.5k": treat the fractional part as decimal thousands
    const dec = m[2] ? Number(`0.${m[2]}`) : 0;
    return Math.round((whole + dec) * 1000) * 100;
  }
  return whole * 100 + frac;
}

const MONEY = String.raw`\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*k?`;

/** Minimal WHATWG URL surface (available in Node, browsers and React Native) without DOM lib types. */
interface UrlLike {
  protocol: string;
  hostname: string;
  pathname: string;
  searchParams: { get(name: string): string | null };
  toString(): string;
}
const UrlCtor = (globalThis as unknown as { URL: new (input: string) => UrlLike }).URL;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Recognize a pasted product URL of a supported retailer. Unknown hosts -> null. */
export function parseProductUrl(input: string): ParsedProductUrl | null {
  let u: UrlLike;
  try {
    u = new UrlCtor(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const url = u.toString();

  if (hostMatches(host, "amazon.com")) {
    const m = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(path);
    return { retailer: "amazon", id: m ? (m[1] as string).toUpperCase() : null, idType: m ? "asin" : null, url };
  }
  if (host === "amzn.to" || host === "a.co") return { retailer: "amazon", id: null, idType: null, url };
  if (hostMatches(host, "walmart.com")) {
    const m = /\/ip\/(?:[^/]+\/)?(\d{5,})(?:[/?]|$)/.exec(path);
    return { retailer: "walmart", id: m ? (m[1] as string) : null, idType: m ? "item_id" : null, url };
  }
  if (hostMatches(host, "bestbuy.com")) {
    const q = u.searchParams.get("skuId");
    const m = /\/(\d{6,8})\.p(?:[/?]|$)/.exec(path) ?? /\/site\/(?:[^/]+\/)?(\d{6,8})(?:[/?]|$)/.exec(path);
    const id = q && /^\d+$/.test(q) ? q : m ? (m[1] as string) : null;
    return { retailer: "bestbuy", id, idType: id ? "sku" : null, url };
  }
  if (hostMatches(host, "target.com")) {
    const m = /\/A-(\d{6,10})(?:[/?#]|$)/.exec(path);
    const pre = u.searchParams.get("preselect");
    const id = m ? (m[1] as string) : pre && /^\d+$/.test(pre) ? pre : null;
    return { retailer: "target", id, idType: id ? "tcin" : null, url };
  }
  if (hostMatches(host, "ebay.com")) {
    const m = /\/itm\/(?:[^/]+\/)?(\d{9,15})(?:[/?]|$)/.exec(path);
    return { retailer: "ebay", id: m ? (m[1] as string) : null, idType: m ? "item_id" : null, url };
  }
  if (hostMatches(host, "homedepot.com")) {
    const m = /\/p\/(?:[^/]+\/)?(\d{9})(?:[/?]|$)/.exec(path);
    return { retailer: "homedepot", id: m ? (m[1] as string) : null, idType: m ? "item_id" : null, url };
  }
  if (hostMatches(host, "lowes.com")) {
    const m = /\/pd\/(?:[^/]+\/)?(\d{6,})(?:[/?]|$)/.exec(path);
    return { retailer: "lowes", id: m ? (m[1] as string) : null, idType: m ? "item_id" : null, url };
  }
  if (hostMatches(host, "newegg.com")) {
    const q = u.searchParams.get("Item") ?? u.searchParams.get("item");
    const m = /\/p\/([A-Z0-9-]{6,})(?:[/?]|$)/i.exec(path);
    const id = q ?? (m ? (m[1] as string) : null);
    return { retailer: "newegg", id: id ? id.toUpperCase() : null, idType: id ? "item_id" : null, url };
  }
  if (hostMatches(host, "costco.com")) {
    const m = /\.product\.(\d+)\.html$/.exec(path);
    return { retailer: "costco", id: m ? (m[1] as string) : null, idType: m ? "item_id" : null, url };
  }
  return null;
}

function emptyResult(raw: string): ParsedSearchQuery {
  return {
    raw, kind: "empty", terms: [], text: "", minPriceCents: null, maxPriceCents: null, categoryHint: null,
    filters: {}, sortHint: null, gtin: null, url: null,
  };
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const raw = input ?? "";
  const trimmed = raw.trim();
  const out = emptyResult(raw);
  if (!trimmed) return out;

  // URL paste
  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = parseProductUrl(trimmed);
    if (parsed) return { ...out, kind: "url", url: parsed };
  }

  // Bare barcode
  const digits = cleanGtin(trimmed);
  if (digits && [8, 12, 13, 14].includes(digits.length)) {
    const type = gtinType(digits);
    if (type) return { ...out, kind: "gtin", gtin: { value: digits, gtin14: toGtin14(digits) as string, type } };
  }

  out.kind = "text";
  let q = ` ${trimmed.toLowerCase().replace(/[“”]/g, '"')} `;
  const consume = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(q);
    if (m) {
      fn(m);
      q = q.slice(0, m.index) + " " + q.slice(m.index + m[0].length);
    }
  };

  // price ranges
  consume(new RegExp(String.raw`\bbetween\s+(${MONEY})\s+(?:and|to|-)\s+(${MONEY})`, "i"), (m) => {
    out.minPriceCents = parseMoneyToCents(m[1] as string);
    out.maxPriceCents = parseMoneyToCents(m[2] as string);
  });
  consume(new RegExp(String.raw`(\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*k?)\s*(?:-|to)\s*(${MONEY})`, "i"), (m) => {
    out.minPriceCents = parseMoneyToCents(m[1] as string);
    out.maxPriceCents = parseMoneyToCents(m[2] as string);
  });
  consume(new RegExp(String.raw`(?:\bunder|\bbelow|\bless\s+than|\bup\s+to|\bmax(?:imum)?|\bwithin|\bno\s+more\s+than|<=?)\s*(${MONEY})`, "i"), (m) => {
    out.maxPriceCents = parseMoneyToCents(m[1] as string);
  });
  consume(new RegExp(String.raw`(?:\bover|\babove|\bmore\s+than|\bat\s+least|\bmin(?:imum)?|>=?)\s*(${MONEY})|\bfrom\s*(\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*k?)`, "i"), (m) => {
    // "from" requires a "$" ("from 2023" is not a price)
    const v = parseMoneyToCents((m[1] ?? m[2]) as string);
    if (v !== null) out.minPriceCents = v;
  });
  if (out.minPriceCents !== null && out.maxPriceCents !== null && out.minPriceCents > out.maxPriceCents) {
    [out.minPriceCents, out.maxPriceCents] = [out.maxPriceCents, out.minPriceCents];
  }

  // sort hints
  if (/\b(?:cheapest|lowest\s+price|least\s+expensive|cheap)\b/.test(q)) out.sortHint = "lowest_total";
  else if (/\b(?:most\s+expensive|highest\s+price)\b/.test(q)) out.sortHint = "highest_price";
  else if (/\b(?:biggest|largest)\s+(?:price\s+)?drops?\b|\bprice\s+drops?\b/.test(q)) out.sortHint = "biggest_drop";
  else if (/\b(?:deals?|discount(?:ed)?|on\s+sale|sale)\b/.test(q)) out.sortHint = "best_deal";
  else if (/\b(?:top[\s-]rated|highest[\s-]rated|best[\s-]rated)\b/.test(q)) out.sortHint = "rating";
  else if (/\b(?:newest|latest)\b/.test(q)) out.sortHint = "newest";
  else if (/\bbest\b/.test(q)) out.sortHint = "best_match";

  // attributes
  consume(/(\d+(?:\.\d+)?)\s*(tb|gb)\s*(?:of\s+)?(?:ram|memory)\b/i, (m) => {
    const v = Number(m[1]);
    out.filters.ramGb = (m[2] as string).toLowerCase() === "tb" ? v * 1024 : v;
  });
  consume(/(\d+(?:\.\d+)?)\s*(tb|gb)\b(?:\s*(?:storage|ssd))?/i, (m) => {
    const v = Number(m[1]);
    out.filters.storageGb = (m[2] as string).toLowerCase() === "tb" ? Math.round(v * 1024) : v;
  });
  consume(/(\d{2,3}(?:\.\d)?)\s*(?:"|-?\s*inch(?:es)?\b|-?\s*in\b(?!\s+(?:stock|store)))/i, (m) => {
    out.filters.screenInches = Number(m[1]);
  });
  consume(/(\d{2,3})\s*hz\b/i, (m) => {
    out.filters.refreshHzMin = Number(m[1]);
  });
  consume(/\b(\d{1,3})\s*-?\s*(?:pack|pk|count|ct)\b/i, (m) => {
    out.filters.packCount = Number(m[1]);
  });
  consume(/\b(refurbished|renewed|open[\s-]box|used|pre-?owned)\b/i, (m) => {
    const c = normalizeCondition(m[1] as string);
    if (c) out.filters.condition = c;
  });
  const colors = parseColors(q);
  if (colors.length > 0) {
    out.filters.color = colors[0] as string;
    consume(new RegExp(`\\b${(colors[0] as string).replace(/ /g, "\\s+")}\\b`, "i"), () => undefined);
  }
  const brand = extractBrand(q);
  if (brand) out.filters.brand = brand;

  for (const [re, slug] of CATEGORY_KEYWORDS) {
    if (re.test(q)) {
      out.categoryHint = slug;
      break;
    }
  }

  out.terms = q
    .replace(/[^a-z0-9+\-.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((t) => t.length > 0 && !FILLER.has(t));
  out.text = out.terms.join(" ");
  return out;
}
