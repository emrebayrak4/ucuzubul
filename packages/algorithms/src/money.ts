/** Internal money helpers (integer cents). */

/** Format integer cents as US dollars: 129999 -> "$1,299.99". */
export function formatUsd(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${rest}`;
}

export function isValidCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
