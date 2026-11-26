/**
 * Non-color tokens. Numbers are in px (React Native consumes them directly);
 * the CSS build converts to rem where appropriate (16px root).
 */

export const fontFamily = {
  /**
   * Sans = Nunito Sans (founder decision 2026-11-26, variable 400–800), loaded by web/admin with
   * next/font/google as `--font-nunito-sans`. Mono stays Geist Mono (codes/IDs only).
   */
  sans: 'var(--font-nunito-sans), "Nunito Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'var(--font-geist-mono), "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** Native font family names (expo-font). Mobile registers Nunito Sans under these names. */
export const nativeFontFamily = {
  sans: "NunitoSans",
  sansMedium: "NunitoSans-SemiBold",
  sansSemibold: "NunitoSans-Bold",
  mono: "GeistMono",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export interface TypeStep {
  readonly size: number;
  readonly lineHeight: number;
  readonly letterSpacing: number; // em
}

/**
 * Type scale. Web base UI text is 14px (dense price layouts); long-form reading uses `md` (16px).
 * Inputs must render at >=16px below `sm` to avoid iOS focus zoom.
 */
export const fontSize = {
  "2xs": { size: 11, lineHeight: 14, letterSpacing: 0.01 },
  xs: { size: 12, lineHeight: 16, letterSpacing: 0.005 },
  sm: { size: 13, lineHeight: 18, letterSpacing: 0 },
  base: { size: 14, lineHeight: 20, letterSpacing: 0 },
  md: { size: 16, lineHeight: 24, letterSpacing: -0.005 },
  lg: { size: 18, lineHeight: 26, letterSpacing: -0.01 },
  xl: { size: 20, lineHeight: 28, letterSpacing: -0.012 },
  "2xl": { size: 24, lineHeight: 30, letterSpacing: -0.015 },
  "3xl": { size: 30, lineHeight: 36, letterSpacing: -0.02 },
  "4xl": { size: 36, lineHeight: 42, letterSpacing: -0.022 },
  "5xl": { size: 48, lineHeight: 52, letterSpacing: -0.025 },
} as const satisfies Record<string, TypeStep>;

export type FontSizeName = keyof typeof fontSize;

/** Semantic text roles -> scale step + weight. */
export const textStyles = {
  display: { step: "4xl", weight: 600 },
  h1: { step: "3xl", weight: 600 },
  h2: { step: "2xl", weight: 600 },
  h3: { step: "xl", weight: 600 },
  h4: { step: "lg", weight: 600 },
  bodyLg: { step: "md", weight: 400 },
  body: { step: "base", weight: 400 },
  label: { step: "sm", weight: 500 },
  caption: { step: "xs", weight: 400 },
  overline: { step: "2xs", weight: 600 },
  priceXl: { step: "3xl", weight: 600 },
  priceLg: { step: "xl", weight: 600 },
  price: { step: "md", weight: 600 },
  priceSm: { step: "base", weight: 600 },
} as const satisfies Record<string, { step: FontSizeName; weight: number }>;

/** 4px grid. Matches Tailwind v4 `--spacing: 0.25rem` (class `p-4` = 16px). */
export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
} as const;

/** Restrained radii. `full` is for chips/pills/avatars only. */
export const radius = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 6,
  lg: 10,
  full: 9999,
} as const;

/** Subtle elevation. Web values; RN uses `nativeShadow`. */
export const shadow = {
  light: {
    xs: "0 1px 0 rgb(20 24 22 / 0.04)",
    sm: "0 1px 2px rgb(20 24 22 / 0.06), 0 1px 1px rgb(20 24 22 / 0.03)",
    md: "0 4px 12px -2px rgb(20 24 22 / 0.08), 0 2px 4px -2px rgb(20 24 22 / 0.05)",
    lg: "0 16px 40px -12px rgb(20 24 22 / 0.18), 0 4px 10px -4px rgb(20 24 22 / 0.06)",
  },
  dark: {
    xs: "0 1px 0 rgb(0 0 0 / 0.3)",
    sm: "0 1px 2px rgb(0 0 0 / 0.4)",
    md: "0 4px 12px -2px rgb(0 0 0 / 0.5), 0 0 0 1px rgb(255 255 255 / 0.03)",
    lg: "0 16px 40px -12px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.04)",
  },
} as const;

export const nativeShadow = {
  sm: { shadowColor: "#141816", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  md: { shadowColor: "#141816", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  lg: { shadowColor: "#141816", shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
} as const;

/** Stacking order. Popover/tooltip sit above modal so they work inside dialogs. */
export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100,
  dropdown: 1000,
  overlay: 1100,
  modal: 1200,
  popover: 1300,
  toast: 1400,
  tooltip: 1500,
} as const;

/** Short, purposeful motion. All durations collapse to ~0 under prefers-reduced-motion. */
export const motion = {
  duration: {
    instant: 0,
    fast: 120,
    base: 180,
    slow: 260,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    in: "cubic-bezier(0.4, 0, 1, 1)",
  },
  /** Bezier control points for Reanimated `Easing.bezier(...)`. */
  nativeEasing: {
    standard: [0.2, 0, 0, 1],
    out: [0.16, 1, 0.3, 1],
    in: [0.4, 0, 1, 1],
  },
} as const;

/** Min-width breakpoints (Tailwind defaults, kept for familiarity). */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

export const layout = {
  /** Max content width on web. */
  contentMaxWidth: 1280,
  /** Page gutter by breakpoint (px). */
  gutter: { base: 16, md: 24, xl: 32 },
  gridColumns: 12,
  /** Dense product grid column count per breakpoint. */
  productGrid: { base: 2, sm: 3, md: 4, lg: 5, xl: 6 },
  headerHeight: { base: 56, lg: 64 },
  /** Minimum touch target. */
  minTouchTarget: 44,
} as const;
