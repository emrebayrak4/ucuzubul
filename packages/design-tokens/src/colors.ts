/**
 * Semantic color tokens. Light and dark share the exact same keys.
 * Raw hex values live ONLY here; components/apps reference the semantic name.
 *
 * Every text/fill pairing is checked for WCAG AA by `scripts/build-css.mjs`
 * (build fails if a pair regresses). See docs/DESIGN_SYSTEM.md for the table.
 */

export const colorTokenNames = [
  // Surfaces
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  // Text
  "text",
  "text-muted",
  // Lines + focus
  "border",
  "border-strong",
  "ring",
  // Brand
  "primary",
  "primary-hover",
  "primary-fg",
  "primary-soft",
  "primary-soft-fg",
  "accent",
  "accent-hover",
  "accent-fg",
  // Status (text/icon color, solid-fill fg, tinted background)
  "success",
  "success-fg",
  "success-soft",
  "warning",
  "warning-fg",
  "warning-soft",
  "error",
  "error-fg",
  "error-soft",
  "info",
  "info-fg",
  "info-soft",
  "travel",
  "travel-fg",
  "travel-soft",
  "travel-soft-fg",
  // Commerce
  "price-drop",
  "price-drop-soft",
  "deal-exceptional",
  "deal-exceptional-fg",
  "deal-great",
  "deal-great-fg",
  "deal-good",
  "deal-good-fg",
  "deal-average",
  "deal-average-fg",
  "deal-poor",
  "deal-poor-fg",
  "sponsored",
  "sponsored-fg",
  "demo",
  "demo-fg",
  "demo-border",
  // Scrim behind dialogs/sheets
  "overlay",
] as const;

export type ColorTokenName = (typeof colorTokenNames)[number];
export type ColorTokens = Readonly<Record<ColorTokenName, string>>;

export const lightColors: ColorTokens = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  "surface-2": "#F5F6F7",
  "surface-3": "#E9EBEE",

  text: "#111827",
  "text-muted": "#4B5563",

  border: "#E5E7EB",
  "border-strong": "#858C97",
  ring: "#1A56DB",

  primary: "#1A56DB",
  "primary-hover": "#1648BE",
  "primary-fg": "#FFFFFF",
  "primary-soft": "#EEF4FF",
  "primary-soft-fg": "#1E3A8A",
  accent: "#FF9F1C",
  "accent-hover": "#F58E00",
  "accent-fg": "#111827",

  success: "#047857",
  "success-fg": "#FFFFFF",
  "success-soft": "#E7F6EF",
  warning: "#B45309",
  "warning-fg": "#FFFFFF",
  "warning-soft": "#FFF4E5",
  error: "#C81E1E",
  "error-fg": "#FFFFFF",
  "error-soft": "#FDECEC",
  info: "#1E5AA8",
  "info-fg": "#FFFFFF",
  "info-soft": "#E8F0FB",
  travel: "#0F766E",
  "travel-fg": "#FFFFFF",
  "travel-soft": "#E6F6F4",
  "travel-soft-fg": "#115E59",

  "price-drop": "#C81E1E",
  "price-drop-soft": "#FDECEC",
  "deal-exceptional": "#1A56DB",
  "deal-exceptional-fg": "#FFFFFF",
  "deal-great": "#047857",
  "deal-great-fg": "#FFFFFF",
  "deal-good": "#E0EDFF",
  "deal-good-fg": "#1E3A8A",
  "deal-average": "#FFF4E5",
  "deal-average-fg": "#8A4B00",
  "deal-poor": "#EEF0F2",
  "deal-poor-fg": "#4B5563",
  sponsored: "#F3EFE2",
  "sponsored-fg": "#5E4F16",
  demo: "#FFF1C7",
  "demo-fg": "#6E4A00",
  "demo-border": "#E8C766",

  overlay: "rgba(17, 24, 39, 0.48)",
};

export const darkColors: ColorTokens = {
  bg: "#0B1120",
  surface: "#111827",
  "surface-2": "#1A2233",
  "surface-3": "#243044",

  text: "#E5E7EB",
  "text-muted": "#9CA3AF",

  border: "#273244",
  "border-strong": "#6B7686",
  ring: "#7AA7FF",

  primary: "#5B8DEF",
  "primary-hover": "#7AA2F5",
  "primary-fg": "#050B18",
  "primary-soft": "#172645",
  "primary-soft-fg": "#BFD3FF",
  accent: "#FFA53D",
  "accent-hover": "#FFB75E",
  "accent-fg": "#111827",

  success: "#34D399",
  "success-fg": "#04150E",
  "success-soft": "#0F2A22",
  warning: "#F5A524",
  "warning-fg": "#1A1004",
  "warning-soft": "#33250F",
  error: "#F87171",
  "error-fg": "#1F0707",
  "error-soft": "#3A1A1A",
  info: "#7AB0F5",
  "info-fg": "#06111F",
  "info-soft": "#152739",
  travel: "#2DD4BF",
  "travel-fg": "#042F2C",
  "travel-soft": "#0E2A2A",
  "travel-soft-fg": "#99F6E4",

  "price-drop": "#F87171",
  "price-drop-soft": "#3A1A1A",
  "deal-exceptional": "#5B8DEF",
  "deal-exceptional-fg": "#050B18",
  "deal-great": "#34D399",
  "deal-great-fg": "#04150E",
  "deal-good": "#172645",
  "deal-good-fg": "#BFD3FF",
  "deal-average": "#33250F",
  "deal-average-fg": "#F5C27A",
  "deal-poor": "#243044",
  "deal-poor-fg": "#C3CAD4",
  sponsored: "#2D2A1E",
  "sponsored-fg": "#DCCD95",
  demo: "#3A2E0A",
  "demo-fg": "#F5D277",
  "demo-border": "#6B5414",

  overlay: "rgba(0, 0, 0, 0.6)",
};

export const colors = { light: lightColors, dark: darkColors } as const;

/**
 * Pairs that must meet a minimum contrast ratio in BOTH modes.
 * [foreground, background, minRatio, note]
 * 4.5 = WCAG AA body text, 3 = AA large text / non-text UI (1.4.11).
 */
export const contrastRequirements: ReadonlyArray<
  readonly [ColorTokenName, ColorTokenName, number, string]
> = [
  ["text", "bg", 4.5, "Body text on page"],
  ["text", "surface", 4.5, "Body text on card"],
  ["text", "surface-2", 4.5, "Body text on well"],
  ["text-muted", "bg", 4.5, "Secondary text on page"],
  ["text-muted", "surface", 4.5, "Secondary text on card"],
  ["text-muted", "surface-2", 4.5, "Secondary text on well"],
  ["border-strong", "surface", 3, "Form control border"],
  ["border-strong", "bg", 3, "Form control border on page"],
  ["ring", "bg", 3, "Focus ring"],
  ["ring", "surface", 3, "Focus ring on card"],
  ["primary", "surface", 4.5, "Primary as link/text"],
  ["primary", "bg", 4.5, "Primary link on page"],
  ["primary-fg", "primary", 4.5, "Primary button label"],
  ["primary-fg", "primary-hover", 4.5, "Primary button hover"],
  ["primary-soft-fg", "primary-soft", 4.5, "Soft primary chip"],
  ["accent-fg", "accent", 4.5, "Accent button/label"],
  ["accent-fg", "accent-hover", 4.5, "Accent hover"],
  ["success", "surface", 4.5, "Success text"],
  ["success", "success-soft", 4.5, "Success on tint"],
  ["success-fg", "success", 4.5, "Solid success"],
  ["warning", "surface", 4.5, "Warning text"],
  ["warning", "warning-soft", 4.5, "Warning on tint"],
  ["warning-fg", "warning", 4.5, "Solid warning"],
  ["error", "surface", 4.5, "Error text"],
  ["error", "bg", 4.5, "Error text on page"],
  ["error", "error-soft", 4.5, "Error on tint"],
  ["error-fg", "error", 4.5, "Destructive button"],
  ["info", "surface", 4.5, "Info text"],
  ["info", "info-soft", 4.5, "Info on tint"],
  ["info-fg", "info", 4.5, "Solid info"],
  ["travel", "surface", 4.5, "Travel accent text"],
  ["travel-fg", "travel", 4.5, "Travel solid (buttons, active tab)"],
  ["travel-soft-fg", "travel-soft", 4.5, "Travel band text"],
  ["text", "travel-soft", 4.5, "Body text on travel band"],
  ["price-drop", "surface", 4.5, "Price-drop text"],
  ["price-drop", "price-drop-soft", 4.5, "Price-drop badge"],
  ["deal-exceptional-fg", "deal-exceptional", 4.5, "Deal: Exceptional"],
  ["deal-great-fg", "deal-great", 4.5, "Deal: Great"],
  ["deal-good-fg", "deal-good", 4.5, "Deal: Good"],
  ["deal-average-fg", "deal-average", 4.5, "Deal: Average"],
  ["deal-poor-fg", "deal-poor", 4.5, "Deal: Poor"],
  ["sponsored-fg", "sponsored", 4.5, "Sponsored label"],
  ["demo-fg", "demo", 4.5, "Demo data label"],
  ["demo-border", "surface", 1.5, "Demo label outline (decorative)"],
];
