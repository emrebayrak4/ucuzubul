/**
 * Single source of truth for brand identity.
 * Brand name "WhichLess" — change it ONLY here. Logo files: packages/config/assets/.
 */
export const brand = {
  name: "WhichLess",
  legalEntity: "Afterwish Inc.",
  tagline: "Compare prices. Track drops. Buy smarter.",
  description:
    "WhichLess compares prices across US retailers, tracks price history and coupons, and compares flights and hotels in its travel section — with transparent sources and no fake discounts.",
  domain: "whichless.com",
  url: "https://whichless.com",
  /** Placeholder — replace before launch. */
  supportEmail: "support@whichless.example",
  privacyEmail: "privacy@whichless.example",
  /** Reference only — the canonical palette lives in @pricora/design-tokens. */
  colors: {
    primary: "#1A56DB",
    accent: "#FF9F1C",
    background: "#FFFFFF",
    surface: "#FFFFFF",
    text: "#111827",
    textSecondary: "#4B5563",
    border: "#E5E7EB",
    success: "#047857",
    error: "#C81E1E",
  },
  locale: "en-US",
  currency: "USD",
  country: "US",
  sessionCookieName: "pc_session",
  csrfCookieName: "pc_csrf",
  csrfHeaderName: "x-csrf-token",
} as const;

export type Brand = typeof brand;
