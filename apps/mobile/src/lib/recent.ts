import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import type { ProductCard } from "@pricora/contracts";

/**
 * Local "recently viewed" list (device only). Product detail responses for these slugs are also kept in
 * the persisted query cache, so they open offline.
 */
const KEY = "pricora.recently-viewed.v1";
const MAX = 20;
type Listener = (items: ProductCard[]) => void;
const listeners = new Set<Listener>();
let cache: ProductCard[] | null = null;

async function read(): Promise<ProductCard[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? (parsed as ProductCard[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export async function addRecentlyViewed(card: ProductCard): Promise<void> {
  const items = await read();
  const next = [card, ...items.filter((p) => p.id !== card.id)].slice(0, MAX);
  cache = next;
  listeners.forEach((l) => l(next));
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

export async function clearRecentlyViewed(): Promise<void> {
  cache = [];
  listeners.forEach((l) => l([]));
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}

export function useRecentlyViewed(): { items: ProductCard[]; clear: () => void } {
  const [items, setItems] = useState<ProductCard[]>(cache ?? []);
  useEffect(() => {
    let alive = true;
    read().then((v) => alive && setItems(v));
    listeners.add(setItems);
    return () => {
      alive = false;
      listeners.delete(setItems);
    };
  }, []);
  const clear = useCallback(() => {
    void clearRecentlyViewed();
  }, []);
  return { items, clear };
}
