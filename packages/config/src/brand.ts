/**
 * Single source of truth for brand identity.
 * "Pricora" is a placeholder name — change it ONLY here.
 */
export const brand = {
  name: "Pricora",
  legalEntity: "Afterwish Inc.",
  tagline: "Compare prices. Track drops. Buy smarter.",
  description:
    "Pricora compares prices across US retailers, tracks price history, and finds flights and hotels — with transparent sources and no fake discounts.",
  domain: "pricora.com",
  url: "https://pricora.com",
  /** Placeholder — replace before launch. */
  supportEmail: "support@pricora.example",
  privacyEmail: "privacy@pricora.example",
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
