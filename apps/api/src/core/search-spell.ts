/**
 * "Did you mean" for product search: corrects query tokens against a vocabulary built from catalog
 * titles, brands and categories (bounded Damerau-free Levenshtein). Pure, no I/O.
 */

export interface SpellVocabulary {
  /** word → frequency in the catalog. */
  words: Map<string, number>;
}

const MIN_LEN = 3;

/** Shopping words that are valid even when no product title contains them — never "corrected". */
const KEEP = new Set(["best", "cheap", "cheapest", "deal", "deals", "sale", "new", "used", "under", "over", "with", "for", "the", "and", "good", "top", "buy", "price", "prices", "discount", "gift", "gifts", "kids", "women", "womens", "men", "mens", "black", "white", "red", "blue", "green", "pink", "gray", "grey", "silver", "gold", "small", "large", "big", "mini", "pro", "max", "plus", "ultra"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);
}

export function buildVocabulary(texts: Iterable<string>): SpellVocabulary {
  const words = new Map<string, number>();
  for (const t of texts) for (const w of tokenize(t)) if (w.length >= MIN_LEN && !/^\d+$/.test(w)) words.set(w, (words.get(w) ?? 0) + 1);
  return { words };
}

/** Levenshtein distance with an early exit once `max` is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Returns a corrected query, or null when every token is known (or nothing close enough exists). */
export function suggestCorrection(query: string, vocab: SpellVocabulary): string | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  let changed = false;
  const out = tokens.map((t) => {
    if (t.length < MIN_LEN || /\d/.test(t) || KEEP.has(t) || vocab.words.has(t)) return t;
    const max = t.length <= 4 ? 1 : 2;
    let best: { w: string; d: number; f: number } | null = null;
    for (const [w, f] of vocab.words) {
      if (w[0] !== t[0] && max === 1) continue;
      const d = editDistance(t, w, max);
      if (d > max) continue;
      if (!best || d < best.d || (d === best.d && f > best.f)) best = { w, d, f };
    }
    if (!best) return t;
    changed = true;
    return best.w;
  });
  return changed ? out.join(" ") : null;
}
