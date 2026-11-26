import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, delayMs = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

/** First value of an expo-router search param (params can be string | string[]). */
export function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
