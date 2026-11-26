/**
 * String similarity primitives used by the matcher. All return a value in [0, 1].
 */
import { normalizeTitle, tokenize } from "../normalize/title";

/** Sørensen–Dice coefficient over two sets. Two empty sets are considered identical (1). */
export function diceCoefficient<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

/** Jaccard index over two sets. Two empty sets are considered identical (1). */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Token-set similarity (Dice) of two titles after normalization and stopword removal. */
export function tokenSimilarity(a: string, b: string): number {
  return diceCoefficient(new Set(tokenize(a)), new Set(tokenize(b)));
}

/** Character trigrams of a normalized string, padded with two leading/trailing spaces. */
export function trigrams(text: string): Set<string> {
  const s = `  ${normalizeTitle(text)}  `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Trigram similarity (Dice over character trigrams); robust to typos and word glueing. */
export function trigramSimilarity(a: string, b: string): number {
  return diceCoefficient(trigrams(a), trigrams(b));
}

/** Classic Levenshtein edit distance (O(n*m), two-row). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] as number) + 1, (curr[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] as number;
}
