/** Whole-dollar USD formatting for hotel prices (cents in). */
export function fmtUsd(cents: number, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: opts.cents ? 2 : 0, minimumFractionDigits: opts.cents ? 2 : 0 }).format(cents / 100);
}
