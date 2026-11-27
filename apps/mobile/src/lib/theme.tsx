import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme, type TextStyle } from "react-native";
import { tokens, type ColorTokens, type FontSizeName } from "@pricora/design-tokens";

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const STORAGE_KEY = "pricora.theme";

/**
 * Brand font: Plus Jakarta Sans. React Native needs one family name per weight (custom fonts + fontWeight break on
 * Android), so each loaded weight is registered under its own family name and selected here. Never set fontWeight.
 * Loaded in app/_layout.tsx (useFonts) before the splash hides.
 */
export type FontWeight = 400 | 500 | 600 | 700 | 800;
export const FONTS = {
  regular: "PlusJakartaSans-Regular",
  semibold: "PlusJakartaSans-SemiBold",
  bold: "PlusJakartaSans-Bold",
  extrabold: "PlusJakartaSans-ExtraBold",
} as const;

/** 500 is not loaded → SemiBold. */
export const fontFamilyForWeight = (weight: FontWeight): string => {
  switch (weight) {
    case 800:
      return FONTS.extrabold;
    case 700:
      return FONTS.bold;
    case 600:
    case 500:
      return FONTS.semibold;
    default:
      return FONTS.regular;
  }
};

/** Converts a token type step into an RN text style (letterSpacing is em in tokens). */
export function typeStyle(step: FontSizeName, weight: FontWeight = 400): TextStyle {
  const s = tokens.fontSize[step];
  return {
    fontSize: s.size,
    lineHeight: s.lineHeight,
    letterSpacing: s.size * s.letterSpacing,
    fontFamily: fontFamilyForWeight(weight),
  };
}

export interface Theme {
  scheme: Scheme;
  preference: ThemePreference;
  c: ColorTokens;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === "light" || v === "dark" || v === "system") setPref(v);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Drives native chrome (tab bar, alerts, keyboard) as well as our own tokens.
    Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
  }, []);

  const scheme: Scheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
  const value = useMemo<Theme>(
    () => ({ scheme, preference, c: tokens.colors[scheme], setPreference }),
    [scheme, preference, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme must be used inside ThemeProvider");
  return t;
}

export { tokens };
