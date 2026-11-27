import { haptic } from "./format";
import { createLocalStore, useLocalStore } from "./store";

/** Smart Basket (device only, like web): products + quantity, optimized by POST /v1/basket/optimize. */
export interface BasketItem {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  qty: number;
}

export const BASKET_MAX = 50;

export const basketStore = createLocalStore<BasketItem[]>("pricora.basket.v1", [], (raw) =>
  Array.isArray(raw)
    ? raw
        .filter((i): i is BasketItem => !!i && typeof i === "object" && typeof (i as BasketItem).id === "string" && typeof (i as BasketItem).slug === "string")
        .map((i) => ({ ...i, qty: Math.min(99, Math.max(1, Math.round(Number(i.qty) || 1))), imageUrl: i.imageUrl ?? null }))
        .slice(0, BASKET_MAX)
    : null,
);

export function useBasket(): BasketItem[] {
  return useLocalStore(basketStore);
}

export function addToBasket(item: Omit<BasketItem, "qty">): "added" | "increased" {
  const exists = basketStore.get().some((i) => i.id === item.id);
  basketStore.set((prev) =>
    exists ? prev.map((i) => (i.id === item.id ? { ...i, qty: Math.min(99, i.qty + 1) } : i)) : [...prev, { ...item, qty: 1 }].slice(0, BASKET_MAX),
  );
  haptic.success();
  return exists ? "increased" : "added";
}

export function setBasketQty(id: string, qty: number): void {
  basketStore.set((prev) => prev.map((i) => (i.id === id ? { ...i, qty: Math.min(99, Math.max(1, qty)) } : i)));
}

export function removeFromBasket(id: string): void {
  basketStore.set((prev) => prev.filter((i) => i.id !== id));
}
