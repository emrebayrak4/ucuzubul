"use client";

import { z } from "zod";
import { createLocalStore } from "./local-store";

/** The compare endpoint accepts 2–5 ids (CompareQuery in @pricora/contracts). */
export const COMPARE_MAX = 5;

const Item = z.object({ id: z.string(), slug: z.string(), title: z.string() });
export type CompareItem = z.infer<typeof Item>;
const EMPTY: CompareItem[] = [];

export const compareStore = createLocalStore<CompareItem[]>("pc_compare", EMPTY, (v) => {
  const r = z.array(Item).max(COMPARE_MAX).safeParse(v);
  return r.success ? r.data : null;
});

export function toggleCompare(item: CompareItem): "added" | "removed" | "full" {
  const list = compareStore.get();
  if (list.some((i) => i.id === item.id)) {
    compareStore.set((prev) => prev.filter((i) => i.id !== item.id));
    return "removed";
  }
  if (list.length >= COMPARE_MAX) return "full";
  compareStore.set((prev) => [...prev, item]);
  return "added";
}

export function clearCompare() {
  compareStore.set(() => []);
}

export function removeFromCompare(id: string) {
  compareStore.set((prev) => prev.filter((i) => i.id !== id));
}

export function compareHref(items: CompareItem[]): string {
  return "/compare?ids=" + items.map((i) => encodeURIComponent(i.id)).join(",");
}
