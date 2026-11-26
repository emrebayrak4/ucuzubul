/**
 * GTIN utilities: UPC-A (12), EAN-13 (13), GTIN-8 and GTIN-14 check-digit validation,
 * UPC <-> EAN conversion, GTIN-14 canonical form, ISBN-10 -> ISBN-13.
 *
 * All GS1 identifiers share the same mod-10 check digit: starting from the rightmost
 * digit of the body (i.e. excluding the check digit), weights alternate 3,1,3,1...
 */

export type GtinType = "GTIN-8" | "UPC-A" | "EAN-13" | "GTIN-14";

const GTIN_LENGTHS: Record<number, GtinType> = {
  8: "GTIN-8",
  12: "UPC-A",
  13: "EAN-13",
  14: "GTIN-14",
};

/** Strip spaces, dashes and other separators. Returns null if anything but digits remains. */
export function cleanGtin(input: string): string | null {
  const stripped = input.trim().replace(/[\s\-.]/g, "");
  return /^\d+$/.test(stripped) ? stripped : null;
}

/** Compute the GS1 mod-10 check digit for a body (all digits except the check digit). */
export function computeGtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error("GTIN body must contain digits only");
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Returns the GTIN type if the code has a valid length and check digit, else null. */
export function gtinType(input: string): GtinType | null {
  const code = cleanGtin(input);
  if (!code) return null;
  const type = GTIN_LENGTHS[code.length];
  if (!type) return null;
  const body = code.slice(0, -1);
  const check = code.charCodeAt(code.length - 1) - 48;
  return computeGtinCheckDigit(body) === check ? type : null;
}

export function isValidGtin(input: string): boolean {
  return gtinType(input) !== null;
}

export function isValidUpcA(input: string): boolean {
  return gtinType(input) === "UPC-A";
}

export function isValidEan13(input: string): boolean {
  return gtinType(input) === "EAN-13";
}

/** UPC-A -> EAN-13 (prefix "0"). Returns null when the input is not a valid UPC-A. */
export function upcToEan13(upc: string): string | null {
  const code = cleanGtin(upc);
  if (!code || !isValidUpcA(code)) return null;
  return `0${code}`;
}

/** EAN-13 -> UPC-A. Only possible when the EAN starts with "0"; otherwise null. */
export function ean13ToUpcA(ean: string): string | null {
  const code = cleanGtin(ean);
  if (!code || !isValidEan13(code) || !code.startsWith("0")) return null;
  return code.slice(1);
}

/**
 * Canonical GTIN-14 (zero-padded). This is the form to store and compare on:
 * a UPC-A, its EAN-13 and its GTIN-14 all normalize to the same string.
 */
export function toGtin14(input: string): string | null {
  const code = cleanGtin(input);
  if (!code || !isValidGtin(code)) return null;
  return code.padStart(14, "0");
}

/** Alias of {@link toGtin14}; returns null for invalid codes. */
export function normalizeGtin(input: string): string | null {
  return toGtin14(input);
}

/** True when both codes are valid GTINs that identify the same trade item. */
export function gtinsEqual(a: string, b: string): boolean {
  const ga = toGtin14(a);
  const gb = toGtin14(b);
  return ga !== null && ga === gb;
}

/** Shortest conventional representation: GTIN-14 with leading zeros -> EAN-13 -> UPC-A. */
export function toDisplayGtin(input: string): string | null {
  const g14 = toGtin14(input);
  if (!g14) return null;
  if (g14.startsWith("000000")) return g14.slice(6); // GTIN-8
  if (g14.startsWith("00")) return g14.slice(2); // UPC-A
  if (g14.startsWith("0")) return g14.slice(1); // EAN-13
  return g14;
}

export function isValidIsbn10(input: string): boolean {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = code[i] as string;
    const value = ch === "X" ? 10 : Number(ch);
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

/** ISBN-10 -> ISBN-13 (978 prefix, recomputed check digit). */
export function isbn10ToIsbn13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const body = `978${isbn10.replace(/[\s-]/g, "").slice(0, 9)}`;
  return `${body}${computeGtinCheckDigit(body)}`;
}

export function isValidIsbn13(input: string): boolean {
  const code = cleanGtin(input);
  return !!code && code.length === 13 && /^97[89]/.test(code) && isValidEan13(code);
}
