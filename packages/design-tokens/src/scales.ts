/**
 * Non-color tokens. Numbers are in px (React Native consumes them directly);
 * the CSS build converts to rem where appropriate (16px root).
 */

export const fontFamily = {
  /**
   * Sans = Plus Jakarta Sans (founder decision 2026-11-27, variable 200–800, replacing Nunito Sans), loaded by web/admin with
   * next/font/google as `--font-plus-jakarta-sans`. Mono stays Geist Mono (codes/IDs only).
   */
  sans: 'var(--font-plus-jakarta-sans), "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'var(--font-geist-mono), "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const;

/** Native font family names (expo-font). Mobile registers Plus Jakarta Sans under these names (see apps/mobile/src/lib/theme.tsx FONTS). */
export const nativeFontFamily = {
  sans: "PlusJakartaSans-Regular",
  sansMedium: "PlusJakartaSans-SemiBold",
  sansSemibold: "PlusJakartaSans-Bold",
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
 * Type scale. Base UI text is 14.5px / 1.4 (founder decision 2026-11-27: a hair above the original 14px);
 * `sm` 13px is the dense/secondary step, long-form reading uses `md` (15.5px).
 * Inputs must render at >=16px below `sm` to avoid iOS focus zoom.
 */
export const fontSize = {
  "2xs": { size: 11, lineHeight: 14, letterSpacing: 0.01 },
  xs: { size: 12, lineHeight: 16, letterSpacing: 0.005 },
  sm: { size: 13, lineHeight: 18, letterSpacing: 0 },
  base: { size: 14.5, lineHeight: 20.3, letterSpacing: 0 },
  md: { size: 15.5, lineHeight: 22, letterSpacing: -0.005 },
  lg: { size: 17, lineHeight: 24, letterSpacing: -0.01 },
  xl: { size: 20, lineHeight: 28, letterSpacing: -0.012 },
  "2xl": { size: 24, lineHeight: 30, letterSpacing: -0.015 },
  "3xl": { size: 30, lineHeight: 36, letterSpacing: -0.02 },
  "4xl": { size: 38, lineHeight: 44, letterSpacing: -0.022 },
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
  "3xl": 1920,
} as const;

export const layout = {
  /** Max content width on web: 1280 from lg (also at 2xl), 1360 from 3xl (1920). Below lg it is 100% + gutter. */
  contentMaxWidth: 1280,
  contentMaxWidth2xl: 1280,
  contentMaxWidth3xl: 1360,
  /** Page gutter by breakpoint (px). */
  gutter: { base: 16, md: 24, xl: 32 },
  gridColumns: 12,
  /** Dense product grid column count per breakpoint. */
  productGrid: { base: 2, sm: 3, lg: 4, xl: 5, "2xl": 6 },
  /** Product tiles never get narrower than this (px); the grid drops columns instead. */
  productTileMinWidth: 150,
  /** Gap between product tiles, shared by `grid-products` and horizontal rails so their columns line up (px). */
  gridGap: { base: 12, lg: 14 },
  /** Vertical rhythm: gap between page sections (`section-stack`) and heading → content (`section-head`) (px). */
  sectionGap: { base: 32, lg: 40 },
  sectionHeadGap: { base: 12, md: 16 },
  headerHeight: { base: 64, lg: 66 },
  /** Control heights (buttons, inputs, selects) in px. */
  controlHeight: { sm: 32, md: 38, lg: 44 },
  /** Minimum touch target. */
  minTouchTarget: 44,
} as const;
