export * from "./colors";
export * from "./scales";
export * from "./contrast";

import { colors } from "./colors";
import {
  breakpoints,
  fontFamily,
  fontSize,
  fontWeight,
  layout,
  motion,
  nativeFontFamily,
  nativeShadow,
  radius,
  shadow,
  spacing,
  textStyles,
  zIndex,
} from "./scales";

/** Deal Score tiers (mirrors packages/algorithms thresholds: 90/75/60/40). */
export const dealTiers = ["exceptional", "great", "good", "average", "poor"] as const;
export type DealTier = (typeof dealTiers)[number];

export const dealTierLabel: Readonly<Record<DealTier, string>> = {
  exceptional: "Exceptional",
  great: "Great",
  good: "Good",
  average: "Average",
  poor: "Poor",
};

export function dealTierFromScore(score: number): DealTier {
  if (score >= 90) return "exceptional";
  if (score >= 75) return "great";
  if (score >= 60) return "good";
  if (score >= 40) return "average";
  return "poor";
}

/** Single object for React Native / non-CSS consumers. */
export const tokens = {
  colors,
  fontFamily,
  nativeFontFamily,
  fontWeight,
  fontSize,
  textStyles,
  spacing,
  radius,
  shadow,
  nativeShadow,
  zIndex,
  motion,
  breakpoints,
  layout,
} as const;

export type Tokens = typeof tokens;
export type ColorScheme = keyof typeof colors;
