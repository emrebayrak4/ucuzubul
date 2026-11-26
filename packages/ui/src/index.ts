// Client entry: dist/index.js is prefixed with "use client" at build time.
// Server-safe helpers live in "@pricora/ui/utils".
export { cn, focusRing } from "./lib/cn";
export { formatPrice, percentDrop, formatCount, type FormatPriceOptions } from "./lib/format";

export * from "./components/button";
export * from "./components/form";
export * from "./components/badge";
export * from "./components/price-tag";
export * from "./components/card";
export * from "./components/store-logo";
export * from "./components/category-icon";
export * from "./components/product-tile";
export * from "./components/product-rail";
export * from "./components/overlays";
export * from "./components/segmented-control";
export * from "./components/dropdown-menu";
export * from "./components/feedback";
export * from "./components/navigation";
export * from "./components/display";
export * from "./components/data";

export { dealTierFromScore, dealTierLabel, type DealTier } from "@pricora/design-tokens";
