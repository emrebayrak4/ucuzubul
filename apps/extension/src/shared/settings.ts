export interface ExtensionSettings {
  /** Product pages: show "Lower price at …" banner. */
  priceComparison: boolean;
  /** Store coupons: badge, popup list and checkout "Try them" panel. */
  couponFinder: boolean;
  /** Send anonymous worked/didn't-work results of tested codes to the API (no account, no cookies). */
  shareResults: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  priceComparison: true,
  couponFinder: true,
  shareResults: true,
};

export const SETTINGS_KEY = "settings";

export function normalizeSettings(raw: unknown): ExtensionSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (k: keyof ExtensionSettings): boolean => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_SETTINGS[k]);
  return { priceComparison: pick("priceComparison"), couponFinder: pick("couponFinder"), shareResults: pick("shareResults") };
}
