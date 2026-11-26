/**
 * Title normalization, tokenization, brand and model extraction.
 */
import { UNIT_SUFFIXES } from "./units";

const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "with", "of", "in", "on", "by", "to", "w", "from",
  "new", "latest", "model", "edition", "version", "&", "-", "|", "/", "+",
]);

/**
 * Lowercase, strip diacritics/trademark symbols, unify quotes and inch marks, glue numbers
 * to their units ("256 GB" -> "256gb", '65"' -> "65in"), drop punctuation that is not part
 * of a model number, collapse whitespace.
 */
export function normalizeTitle(title: string): string {
  let t = title.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  t = t.replace(/[™®©]/g, " ");
  t = t.replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  t = t.toLowerCase();
  // inch marks: 65" / 65'' / 65 inch / 65-inch -> 65in
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:"|''|-?\s*inch(?:es)?\b)/g, "$1in");
  // glue number + unit
  t = t.replace(/(\d+(?:\.\d+)?)\s*-?\s*(tb|gb|mb|hz|mah|mp|oz|lbs?|ml|ghz|wh)\b/g, "$1$2");
  t = t.replace(/(\d+)\s*-\s*(pack|pk|count|ct)\b/g, "$1 $2");
  // remove parentheses/brackets/commas etc. but keep "-" and "/" inside alphanumeric runs
  t = t.replace(/[()[\]{},;:!?*#"]/g, " ");
  t = t.replace(/(^|\s)[-/+|&]+(?=\s|$)/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Tokens of the normalized title, without stopwords. */
export function tokenize(title: string, opts: { keepStopwords?: boolean } = {}): string[] {
  const tokens = normalizeTitle(title)
    .split(" ")
    .map((tok) => tok.replace(/^[-/.']+|[-/.']+$/g, ""))
    // "wh-1000xm5" -> "wh1000xm5" (model numbers), "noise-canceling" -> "noise" "canceling"
    .flatMap((tok) => (/\d/.test(tok) ? [tok.replace(/[-/]/g, "")] : tok.split(/[-/]/)))
    .filter((tok) => tok.length > 0);
  return opts.keepStopwords ? tokens : tokens.filter((tok) => !STOPWORDS.has(tok));
}

const UNIT_TOKEN_RE = new RegExp(`^\\d+(?:\\.\\d+)?(?:${UNIT_SUFFIXES.join("|")})$`);

/** True for tokens like "256gb", "65in", "144hz" (measurements, not model numbers). */
export function isUnitToken(token: string): boolean {
  return UNIT_TOKEN_RE.test(token);
}

/** Compact a model/MPN for comparison: uppercase, alphanumerics only ("WH-1000XM5" -> "WH1000XM5"). */
export function normalizeModel(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Tokens that carry model identity: contain a digit and are not measurements.
 * e.g. "iPhone 15 Pro 256GB" -> ["15"], "Sony WH-1000XM5" -> ["WH1000XM5"].
 */
export function modelTokens(title: string): string[] {
  const out = new Set<string>();
  for (const tok of tokenize(title)) {
    if (!/\d/.test(tok) || isUnitToken(tok)) continue;
    if (/^\d+(?:st|nd|rd|th)$/.test(tok)) continue; // "13th" (gen) is descriptive
    if (/^x\d+$|^\d+x$/.test(tok)) continue; // "2x" multipliers
    const norm = normalizeModel(tok);
    if (norm) out.add(norm);
  }
  return [...out];
}

/** Words that distinguish product lines within the same model number. */
export const VARIANT_WORDS = ["pro", "max", "plus", "mini", "ultra", "lite", "air", "se", "fe", "slim", "xl", "edge"] as const;

export function variantTokens(title: string): string[] {
  const toks = new Set(tokenize(title));
  // "+" written as "s24+" is normalized to a plus variant
  if (/\w\+(\s|$)/.test(title)) toks.add("plus");
  return VARIANT_WORDS.filter((w) => toks.has(w));
}

/**
 * Best-effort model number (MPN-like token) from a title: the longest token mixing letters
 * and digits, at least 4 characters, that is not a measurement. Returns null when none.
 */
export function extractModel(title: string): string | null {
  const raw = title.replace(/[™®©()[\],]/g, " ").split(/\s+/);
  let best: string | null = null;
  for (const tok of raw) {
    const cleaned = tok.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (cleaned.length < 4) continue;
    if (!/[A-Za-z]/.test(cleaned) || !/\d/.test(cleaned)) continue;
    if (isUnitToken(cleaned.toLowerCase())) continue;
    if (/^\d+(?:st|nd|rd|th)$/i.test(cleaned)) continue;
    const compact = normalizeModel(cleaned);
    if (compact.length < 4) continue;
    if (!best || compact.length > normalizeModel(best).length) best = cleaned;
  }
  return best;
}

// ---------- brands ----------

/** Canonical brand -> aliases (lowercase). Extend at runtime via `extractBrand(title, extra)`. */
export const DEFAULT_BRANDS: Record<string, string[]> = {
  Apple: ["apple", "iphone", "ipad", "macbook", "airpods", "imac"],
  Samsung: ["samsung", "galaxy"],
  Google: ["google", "pixel"],
  Sony: ["sony", "playstation"],
  LG: ["lg", "lg electronics"],
  Microsoft: ["microsoft", "xbox", "surface"],
  Nintendo: ["nintendo"],
  Dell: ["dell", "alienware"],
  HP: ["hp", "hewlett packard", "hewlett-packard"],
  Lenovo: ["lenovo", "thinkpad"],
  Asus: ["asus", "rog"],
  Acer: ["acer"],
  MSI: ["msi"],
  Razer: ["razer"],
  Bose: ["bose"],
  JBL: ["jbl"],
  Beats: ["beats"],
  Sennheiser: ["sennheiser"],
  TCL: ["tcl"],
  Hisense: ["hisense"],
  Vizio: ["vizio"],
  Panasonic: ["panasonic"],
  Philips: ["philips"],
  Canon: ["canon"],
  Nikon: ["nikon"],
  Fujifilm: ["fujifilm", "fuji"],
  GoPro: ["gopro"],
  DJI: ["dji"],
  Garmin: ["garmin"],
  Fitbit: ["fitbit"],
  Amazon: ["amazon", "kindle", "echo", "fire tv"],
  Roku: ["roku"],
  Logitech: ["logitech"],
  Corsair: ["corsair"],
  SanDisk: ["sandisk"],
  "Western Digital": ["western digital", "wd"],
  Seagate: ["seagate"],
  Crucial: ["crucial"],
  Kingston: ["kingston"],
  Anker: ["anker"],
  Dyson: ["dyson"],
  iRobot: ["irobot", "roomba"],
  Shark: ["shark"],
  KitchenAid: ["kitchenaid"],
  Ninja: ["ninja"],
  Instant: ["instant pot", "instant brands"],
  Keurig: ["keurig"],
  Nespresso: ["nespresso"],
  Breville: ["breville"],
  Cuisinart: ["cuisinart"],
  Whirlpool: ["whirlpool"],
  GE: ["ge", "ge appliances"],
  Frigidaire: ["frigidaire"],
  Bosch: ["bosch"],
  DeWalt: ["dewalt"],
  Milwaukee: ["milwaukee"],
  Makita: ["makita"],
  Ryobi: ["ryobi"],
  "Black+Decker": ["black+decker", "black & decker", "black and decker", "black decker"],
  Nike: ["nike"],
  Adidas: ["adidas"],
  "Under Armour": ["under armour"],
  "The North Face": ["the north face", "north face"],
  "Levi's": ["levi's", "levis"],
  LEGO: ["lego"],
  Hasbro: ["hasbro"],
  Mattel: ["mattel"],
  Pampers: ["pampers"],
  Huggies: ["huggies"],
  "Procter & Gamble": ["procter & gamble"],
  "Oral-B": ["oral-b", "oral b"],
  Gillette: ["gillette"],
  Neutrogena: ["neutrogena"],
  OnePlus: ["oneplus"],
  Motorola: ["motorola", "moto"],
  Nothing: ["nothing phone"],
  Xiaomi: ["xiaomi"],
  Valve: ["valve", "steam deck"],
  Meta: ["meta quest", "oculus"],
};

/** Canonicalize a brand string via the alias table; unknown brands are trimmed and title-cased. */
export function normalizeBrand(brand: string, extra: Record<string, string[]> = {}): string {
  const b = brand.trim().toLowerCase().replace(/\s+/g, " ");
  const table = { ...DEFAULT_BRANDS, ...extra };
  for (const [canonical, aliases] of Object.entries(table)) {
    if (canonical.toLowerCase() === b || aliases.includes(b)) return canonical;
  }
  return brand.trim().replace(/\s+/g, " ");
}

/**
 * Brand detection: prefers an alias at the start of the title, then any whole-word alias.
 * Returns null when no known brand occurs.
 */
export function extractBrand(title: string, extra: Record<string, string[]> = {}): string | null {
  const t = ` ${title.toLowerCase().replace(/[™®©,()]/g, " ").replace(/\s+/g, " ").trim()} `;
  const table = { ...DEFAULT_BRANDS, ...extra };
  let best: { brand: string; index: number; len: number } | null = null;
  for (const [canonical, aliases] of Object.entries(table)) {
    for (const alias of [canonical.toLowerCase(), ...aliases]) {
      const idx = t.indexOf(` ${alias} `);
      if (idx === -1) continue;
      if (!best || idx < best.index || (idx === best.index && alias.length > best.len)) {
        best = { brand: canonical, index: idx, len: alias.length };
      }
    }
  }
  return best?.brand ?? null;
}
