import { createLocalStore, useLocalStore } from "./store";

const MAX = 10;

/** Recent search queries, device only (never synced). */
export const recentSearchStore = createLocalStore<string[]>("pricora.recent-searches.v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string").slice(0, MAX) : null,
);

export function useRecentSearches(): string[] {
  return useLocalStore(recentSearchStore);
}

export function addRecentSearch(q: string): void {
  const t = q.trim();
  if (t.length < 2) return;
  recentSearchStore.set((prev) => [t, ...prev.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX));
}

export function removeRecentSearch(q: string): void {
  recentSearchStore.set((prev) => prev.filter((s) => s !== q));
}

export function clearRecentSearches(): void {
  recentSearchStore.set([]);
}
