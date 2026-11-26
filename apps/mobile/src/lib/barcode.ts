/** GTIN helpers for the scanner (UPC-A, EAN-13, EAN-8). */

export function isValidGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Weights alternate 3,1 from the rightmost data digit.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i]! * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** iOS reports UPC-A as EAN-13 with a leading 0; normalize back to 12 digits. */
export function normalizeScannedCode(type: string, data: string): string {
  const code = data.replace(/\D/g, "");
  if ((type === "ean13" || type === "org.gs1.EAN-13") && code.length === 13 && code.startsWith("0")) return code.slice(1);
  return code;
}

export function analyticsCodeType(code: string): "UPC-A" | "EAN-13" | "GTIN-8" | "GTIN-14" | "unknown" {
  switch (code.length) {
    case 12:
      return "UPC-A";
    case 13:
      return "EAN-13";
    case 8:
      return "GTIN-8";
    case 14:
      return "GTIN-14";
    default:
      return "unknown";
  }
}
