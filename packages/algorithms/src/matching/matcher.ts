/**
 * Staged product matcher.
 *
 *   0. Resolve attributes (explicit fields win over values parsed from the title).
 *   1. Conflict detection — HARD conflicts (storage, RAM, color, size, pack count, condition,
 *      model number, model variant, brand) block a merge regardless of any other signal,
 *      including an identical GTIN.
 *   2. Exact identifier (GTIN/UPC/EAN, compared as GTIN-14)            -> confidence 1.00
 *   3. Brand + MPN                                                     -> confidence 0.99
 *   4. Candidate scoring: weighted brand, token & trigram similarity, model tokens,
 *      attribute agreement and an optional pluggable semantic similarity.
 *   5. Decision: auto (>= thresholds.auto), review (>= thresholds.review), reject.
 */
import { toGtin14 } from "../normalize/gtin";
import { extractBrand, extractModel, modelTokens, normalizeBrand, normalizeModel, variantTokens } from "../normalize/title";
import { normalizeColor, normalizeCondition, parseAttributes, type Condition } from "../normalize/units";
import { diceCoefficient, tokenSimilarity, trigramSimilarity } from "./similarity";

export interface MatchableAttributes {
  storageGb?: number | null;
  ramGb?: number | null;
  screenInches?: number | null;
  refreshHz?: number | null;
  color?: string | null;
  size?: string | null;
  packCount?: number | null;
}

export interface MatchableProduct {
  id: string;
  title: string;
  brand?: string | null;
  /** Manufacturer part number. */
  mpn?: string | null;
  model?: string | null;
  /** Any of UPC-A / EAN-13 / GTIN-8 / GTIN-14; invalid codes are ignored. */
  gtins?: readonly string[] | null;
  condition?: Condition | string | null;
  attributes?: MatchableAttributes | null;
  category?: string | null;
}

export type MatchDecision = "auto" | "review" | "reject";
export type MatchStage = "identifier" | "brand_mpn" | "scored" | "blocked";
export type ConflictAttribute =
  | "storage"
  | "ram"
  | "color"
  | "size"
  | "pack_count"
  | "condition"
  | "model_number"
  | "model_variant"
  | "brand";

export interface MatchConflict {
  attribute: ConflictAttribute;
  a: string;
  b: string;
  /** Hard conflicts always block the merge. */
  hard: boolean;
}

export interface MatchThresholds {
  /** Minimum confidence for automatic merge. Default 0.98. */
  auto: number;
  /** Minimum confidence for the manual review queue. Default 0.85. */
  review: number;
}

export const DEFAULT_THRESHOLDS: MatchThresholds = { auto: 0.98, review: 0.85 };

export interface MatchWeights {
  brand: number;
  tokens: number;
  trigrams: number;
  modelTokens: number;
  attributes: number;
  /** Used only when a semantic similarity function is supplied. */
  semantic: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  brand: 0.15,
  tokens: 0.25,
  trigrams: 0.15,
  modelTokens: 0.25,
  attributes: 0.2,
  semantic: 0.2,
};

/** Pluggable semantic similarity (e.g. embeddings cosine). Must return [0, 1]. */
export type SemanticSimilarityFn = (a: MatchableProduct, b: MatchableProduct) => number;
export type AsyncSemanticSimilarityFn = (a: MatchableProduct, b: MatchableProduct) => number | Promise<number>;

export interface MatchOptions {
  thresholds?: Partial<MatchThresholds>;
  weights?: Partial<MatchWeights>;
  semanticSimilarity?: SemanticSimilarityFn;
  /**
   * Upper bound for confidence reached by fuzzy scoring alone (no identifier / MPN match).
   * Default 0.975 so that, with default thresholds, title similarity alone never auto-merges.
   */
  maxFuzzyConfidence?: number;
  /** Extra brand aliases for brand extraction. */
  brandAliases?: Record<string, string[]>;
}

export interface MatchResult {
  confidence: number;
  decision: MatchDecision;
  stage: MatchStage;
  /** True when at least one hard conflict was found. */
  blocked: boolean;
  conflicts: MatchConflict[];
  /** Raw component signals (0..1) for explainability / tuning. */
  signals: Record<string, number>;
  reasons: string[];
}

interface Resolved {
  brand: string | null;
  mpn: string | null;
  gtins: Set<string>;
  condition: Condition;
  conditionExplicit: boolean;
  storageGb?: number;
  ramGb?: number;
  screenInches?: number;
  refreshHz?: number;
  color?: string;
  size?: string;
  packCount: number;
  packExplicit: boolean;
  modelTokens: Set<string>;
  variants: Set<string>;
}

function resolve(p: MatchableProduct, opts: MatchOptions): Resolved {
  const parsed = parseAttributes(p.title);
  const attrs = p.attributes ?? {};
  const brandRaw = p.brand ?? extractBrand(p.title, opts.brandAliases);
  const mpnRaw = p.mpn ?? p.model ?? null;
  const gtins = new Set<string>();
  for (const g of p.gtins ?? []) {
    const n = toGtin14(g);
    if (n) gtins.add(n);
  }
  const explicitCondition = normalizeCondition(p.condition ?? undefined);
  const condition = explicitCondition ?? parsed.condition ?? "new";
  const packCount = attrs.packCount ?? parsed.packCount;
  const color = attrs.color ?? parsed.colors[0];
  const mt = new Set(modelTokens(p.title));
  if (mpnRaw) mt.add(normalizeModel(mpnRaw));
  const r: Resolved = {
    brand: brandRaw ? normalizeBrand(brandRaw, opts.brandAliases) : null,
    mpn: mpnRaw ? normalizeModel(mpnRaw) || null : null,
    gtins,
    condition,
    conditionExplicit: explicitCondition !== undefined || parsed.condition !== undefined,
    packCount: packCount ?? 1,
    packExplicit: packCount != null,
    modelTokens: mt,
    variants: new Set(variantTokens(p.title)),
  };
  const storage = attrs.storageGb ?? parsed.storageGb;
  if (storage != null) r.storageGb = storage;
  const ram = attrs.ramGb ?? parsed.ramGb;
  if (ram != null) r.ramGb = ram;
  const screen = attrs.screenInches ?? parsed.screenInches;
  if (screen != null) r.screenInches = screen;
  const hz = attrs.refreshHz ?? parsed.refreshHz;
  if (hz != null) r.refreshHz = hz;
  if (color) r.color = normalizeColor(color);
  const size = attrs.size ?? parsed.size;
  if (size) r.size = size.trim().toLowerCase();
  return r;
}

/** Detect conflicts between two resolved products. */
function detectConflicts(a: Resolved, b: Resolved, titleA: string, titleB: string): MatchConflict[] {
  const out: MatchConflict[] = [];
  const add = (attribute: ConflictAttribute, va: unknown, vb: unknown, hard = true) =>
    out.push({ attribute, a: String(va), b: String(vb), hard });

  if (a.storageGb !== undefined && b.storageGb !== undefined && a.storageGb !== b.storageGb) add("storage", `${a.storageGb}GB`, `${b.storageGb}GB`);
  if (a.ramGb !== undefined && b.ramGb !== undefined && a.ramGb !== b.ramGb) add("ram", `${a.ramGb}GB`, `${b.ramGb}GB`);
  if (a.color && b.color && a.color !== b.color) add("color", a.color, b.color);
  if (a.screenInches !== undefined && b.screenInches !== undefined && Math.abs(a.screenInches - b.screenInches) >= 0.5) {
    add("size", `${a.screenInches}in`, `${b.screenInches}in`);
  }
  if (a.size && b.size && a.size !== b.size) add("size", a.size, b.size);
  if (a.packCount !== b.packCount) add("pack_count", a.packCount, b.packCount);
  if (a.condition !== b.condition) add("condition", a.condition, b.condition);
  if (a.brand && b.brand && a.brand.toLowerCase() !== b.brand.toLowerCase()) add("brand", a.brand, b.brand);

  // Model identity: both titles carry model tokens but share none (iPhone 15 vs iPhone 16).
  const ta = new Set(modelTokens(titleA));
  const tb = new Set(modelTokens(titleB));
  if (ta.size > 0 && tb.size > 0) {
    let shared = 0;
    for (const t of ta) for (const u of tb) if (modelTokenEquivalent(t, u)) shared++;
    if (shared === 0 && !(a.mpn && b.mpn && a.mpn === b.mpn)) add("model_number", [...ta].join(" "), [...tb].join(" "));
  }
  // Line variant: "Pro" vs "Pro Max", "S24" vs "S24 Ultra".
  const va = [...a.variants].sort().join(" ");
  const vb = [...b.variants].sort().join(" ");
  if (va !== vb) add("model_variant", va || "(none)", vb || "(none)");

  return out;
}

/** Equal, or one is a >=5-char prefix of the other ("WH1000XM5" ~ "WH1000XM5B" color suffix). */
function modelTokenEquivalent(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && /\d/.test(s) && /[A-Z]/.test(s) && l.startsWith(s);
}

function attributeAgreement(a: Resolved, b: Resolved): number | null {
  let compared = 0;
  let agree = 0;
  const cmp = (x: unknown, y: unknown) => {
    if (x === undefined || y === undefined) return;
    compared++;
    if (x === y) agree++;
  };
  cmp(a.storageGb, b.storageGb);
  cmp(a.ramGb, b.ramGb);
  cmp(a.screenInches, b.screenInches);
  cmp(a.refreshHz, b.refreshHz);
  cmp(a.color, b.color);
  cmp(a.size, b.size);
  if (a.packExplicit || b.packExplicit) cmp(a.packCount, b.packCount);
  return compared === 0 ? null : agree / compared;
}

function decide(confidence: number, t: MatchThresholds): MatchDecision {
  if (confidence >= t.auto) return "auto";
  if (confidence >= t.review) return "review";
  return "reject";
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

function matchCore(
  a: MatchableProduct,
  b: MatchableProduct,
  opts: MatchOptions,
  semantic: number | undefined,
): MatchResult {
  const thresholds: MatchThresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
  const weights: MatchWeights = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const maxFuzzy = opts.maxFuzzyConfidence ?? 0.975;
  const ra = resolve(a, opts);
  const rb = resolve(b, opts);
  const conflicts = detectConflicts(ra, rb, a.title, b.title);
  const hard = conflicts.filter((c) => c.hard);
  const reasons: string[] = [];
  const signals: Record<string, number> = {};

  // --- signals (computed for explainability even when blocked) ---
  const sTokens = round4(tokenSimilarity(a.title, b.title));
  const sTrigrams = round4(trigramSimilarity(a.title, b.title));
  const sBrand = ra.brand && rb.brand ? (ra.brand.toLowerCase() === rb.brand.toLowerCase() ? 1 : 0) : 0.5;
  const sModel = ra.modelTokens.size === 0 && rb.modelTokens.size === 0 ? 0.5 : round4(diceCoefficient(ra.modelTokens, rb.modelTokens));
  const attr = attributeAgreement(ra, rb);
  const sAttr = attr === null ? 0.5 : round4(attr);
  const sSemantic = semantic === undefined ? undefined : round4(Math.min(1, Math.max(0, semantic)));
  signals.tokens = sTokens;
  signals.trigrams = sTrigrams;
  signals.brand = sBrand;
  signals.modelTokens = sModel;
  signals.attributes = sAttr;
  if (sSemantic !== undefined) signals.semantic = sSemantic;

  let sharedGtin = false;
  for (const g of ra.gtins) if (rb.gtins.has(g)) sharedGtin = true;
  const gtinMismatch = !sharedGtin && ra.gtins.size > 0 && rb.gtins.size > 0;
  const mpnMatch = !!(ra.brand && rb.brand && ra.mpn && rb.mpn && ra.brand.toLowerCase() === rb.brand.toLowerCase() && ra.mpn === rb.mpn);
  const mpnMismatch = !!(ra.mpn && rb.mpn && ra.mpn !== rb.mpn);

  if (hard.length > 0) {
    for (const c of hard) reasons.push(`Blocked: ${c.attribute.replace("_", " ")} differs (${c.a} vs ${c.b})`);
    return {
      confidence: 0,
      decision: "reject",
      stage: "blocked",
      blocked: true,
      conflicts,
      signals,
      reasons,
    };
  }

  if (sharedGtin) {
    reasons.push("Same GTIN/UPC/EAN");
    return { confidence: 1, decision: decide(1, thresholds), stage: "identifier", blocked: false, conflicts, signals, reasons };
  }

  if (mpnMatch && !gtinMismatch) {
    reasons.push("Same brand and manufacturer part number");
    return { confidence: 0.99, decision: decide(0.99, thresholds), stage: "brand_mpn", blocked: false, conflicts, signals, reasons };
  }

  // --- weighted scoring ---
  const parts: [number, number][] = [
    [weights.brand, sBrand],
    [weights.tokens, sTokens],
    [weights.trigrams, sTrigrams],
    [weights.modelTokens, sModel],
    [weights.attributes, sAttr],
  ];
  if (sSemantic !== undefined) parts.push([weights.semantic, sSemantic]);
  const wSum = parts.reduce((s, [w]) => s + w, 0);
  let score = wSum > 0 ? parts.reduce((s, [w, v]) => s + w * v, 0) / wSum : 0;

  if (gtinMismatch) {
    score -= 0.15;
    reasons.push("Different GTINs on both sides");
  }
  if (mpnMismatch) {
    score -= 0.2;
    reasons.push("Different manufacturer part numbers");
  }
  score = Math.min(maxFuzzy, Math.max(0, score));
  const confidence = round4(score);
  reasons.push(`Title similarity ${(sTokens * 100).toFixed(0)}% (tokens), ${(sTrigrams * 100).toFixed(0)}% (trigrams)`);
  return { confidence, decision: decide(confidence, thresholds), stage: "scored", blocked: false, conflicts, signals, reasons };
}

/** Compare two products. Synchronous; the semantic function (if any) must be synchronous. */
export function matchProducts(a: MatchableProduct, b: MatchableProduct, opts: MatchOptions = {}): MatchResult {
  const semantic = opts.semanticSimilarity ? opts.semanticSimilarity(a, b) : undefined;
  return matchCore(a, b, opts, semantic);
}

/** Async variant for semantic functions that call an embedding service. */
export async function matchProductsAsync(
  a: MatchableProduct,
  b: MatchableProduct,
  opts: Omit<MatchOptions, "semanticSimilarity"> & { semanticSimilarity?: AsyncSemanticSimilarityFn } = {},
): Promise<MatchResult> {
  const { semanticSimilarity, ...rest } = opts;
  const semantic = semanticSimilarity ? await semanticSimilarity(a, b) : undefined;
  return matchCore(a, b, rest, semantic);
}

export interface RankedMatch {
  candidate: MatchableProduct;
  result: MatchResult;
}

/** Score a product against a candidate pool; returns non-blocked matches sorted by confidence. */
export function rankCandidates(
  product: MatchableProduct,
  candidates: readonly MatchableProduct[],
  opts: MatchOptions = {},
): RankedMatch[] {
  return candidates
    .map((candidate) => ({ candidate, result: matchProducts(product, candidate, opts) }))
    .filter((r) => !r.result.blocked)
    .sort((x, y) => y.result.confidence - x.result.confidence);
}

/**
 * Blocking keys for candidate generation (cheap pre-filter before scoring):
 * GTIN-14s, brand+MPN, and brand+each model token.
 */
export function candidateKeys(p: MatchableProduct, opts: Pick<MatchOptions, "brandAliases"> = {}): string[] {
  const keys = new Set<string>();
  for (const g of p.gtins ?? []) {
    const n = toGtin14(g);
    if (n) keys.add(`gtin:${n}`);
  }
  const brandRaw = p.brand ?? extractBrand(p.title, opts.brandAliases);
  const brand = brandRaw ? normalizeBrand(brandRaw, opts.brandAliases).toLowerCase() : "?";
  const mpn = p.mpn ?? p.model ?? extractModel(p.title);
  if (mpn) keys.add(`mpn:${brand}:${normalizeModel(mpn)}`);
  for (const t of modelTokens(p.title)) keys.add(`model:${brand}:${t}`);
  return [...keys];
}
