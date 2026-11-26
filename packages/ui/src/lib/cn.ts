import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about the custom utilities defined in @pricora/design-tokens/tailwind.css
// so conflicting classes resolve correctly.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] }],
      shadow: [{ shadow: ["xs", "sm", "md", "lg"] }],
      rounded: [{ rounded: ["xs", "sm", "md", "lg"] }],
      z: [{ z: ["base", "raised", "sticky", "dropdown", "overlay", "modal", "popover", "toast", "tooltip"] }],
      duration: [{ duration: ["fast", "base", "slow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Shared focus-visible ring. Offset color = page background so it reads on any fill. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
