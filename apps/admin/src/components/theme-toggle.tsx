"use client";

import { useSyncExternalStore } from "react";
import { IconButton } from "@pricora/ui";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known on the client; keep SSR markup neutral to avoid a hydration mismatch.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  const label = !mounted ? "Toggle color theme" : dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <IconButton label={label} variant="ghost" size="sm" onClick={() => setTheme(dark ? "light" : "dark")}>
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </IconButton>
  );
}
