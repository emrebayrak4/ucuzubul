import { Alert } from "react-native";
import { haptic } from "./format";
import { createLocalStore, useLocalStore } from "./store";

/** The compare endpoint accepts 2–5 ids (CompareQuery in @pricora/contracts). Same limit as web. */
export const COMPARE_MAX = 5;

export interface CompareItem {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
}

function isItem(v: unknown): v is CompareItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.slug === "string" && typeof o.title === "string";
}

export const compareStore = createLocalStore<CompareItem[]>("pricora.compare.v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter(isItem).slice(0, COMPARE_MAX).map((i) => ({ ...i, imageUrl: i.imageUrl ?? null })) : null,
);

export function useCompare(): CompareItem[] {
  return useLocalStore(compareStore);
}

export function isInCompare(list: CompareItem[], id: string): boolean {
  return list.some((i) => i.id === id);
}

export function toggleCompare(item: CompareItem): "added" | "removed" | "full" {
  const list = compareStore.get();
  if (isInCompare(list, item.id)) {
    compareStore.set((prev) => prev.filter((i) => i.id !== item.id));
    haptic.toggle();
    return "removed";
  }
  if (list.length >= COMPARE_MAX) {
    haptic.warning();
    Alert.alert("Compare is full", `You can compare up to ${COMPARE_MAX} products. Remove one first.`);
    return "full";
  }
  compareStore.set((prev) => [...prev, item]);
  haptic.toggle();
  return "added";
}

export function removeFromCompare(id: string): void {
  compareStore.set((prev) => prev.filter((i) => i.id !== id));
}

export function clearCompare(): void {
  compareStore.set([]);
}
